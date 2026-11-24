import { eq } from "drizzle-orm";
import Stripe from "stripe";
import type { Database } from "@/db/client";
import { organization, stripeEvent, subscription, type SubscriptionRow } from "@/db/schema";
import { parsePlan, planForPriceId } from "./stripe";

/**
 * Stripe webhook processing.
 *
 * Guarantees:
 * 1. Signature verification: unsigned/tampered payloads are rejected (400).
 * 2. Idempotency: each event ID is recorded in `stripe_event` inside the same
 *    transaction as its side effects. A redelivered event is a no-op; if a
 *    handler throws, the transaction (and the event record) rolls back so
 *    Stripe's retry is processed normally.
 * 3. Ordering: subscription state changes older than the newest applied event
 *    are skipped (Stripe does not guarantee delivery order).
 *
 * Handlers never call the Stripe API: everything needed is in the payload,
 * which keeps webhooks fast and makes them testable with signed fixtures.
 */

export const HANDLED_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
] as const;

export type ProcessResult =
  | { status: "processed"; eventId: string; type: string }
  | { status: "duplicate"; eventId: string; type: string }
  | { status: "ignored"; eventId: string; type: string; reason: string };

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Handler = (tx: Tx, event: Stripe.Event) => Promise<void | { ignored: string }>;

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function toDate(unixSeconds: number | null | undefined): Date | null {
  return typeof unixSeconds === "number" ? new Date(unixSeconds * 1000) : null;
}

async function findRow(
  tx: Tx,
  by: { organizationId?: string | null; customerId?: string | null; subscriptionId?: string | null },
): Promise<SubscriptionRow | undefined> {
  if (by.organizationId) {
    const [row] = await tx.select().from(subscription).where(eq(subscription.organizationId, by.organizationId)).limit(1);
    if (row) return row;
  }
  if (by.subscriptionId) {
    const [row] = await tx.select().from(subscription).where(eq(subscription.stripeSubscriptionId, by.subscriptionId)).limit(1);
    if (row) return row;
  }
  if (by.customerId) {
    const [row] = await tx.select().from(subscription).where(eq(subscription.stripeCustomerId, by.customerId)).limit(1);
    if (row) return row;
  }
  return undefined;
}

async function organizationExists(tx: Tx, organizationId: string) {
  const [row] = await tx.select({ id: organization.id }).from(organization).where(eq(organization.id, organizationId)).limit(1);
  return !!row;
}

function isStale(row: SubscriptionRow | undefined, event: Stripe.Event) {
  return !!row?.lastEventAt && event.created * 1000 < row.lastEventAt.getTime();
}

const onCheckoutCompleted: Handler = async (tx, event) => {
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.mode !== "subscription") return { ignored: "not a subscription checkout" };

  const organizationId = session.client_reference_id ?? session.metadata?.organizationId ?? null;
  if (!organizationId || !(await organizationExists(tx, organizationId))) {
    return { ignored: "unknown organization" };
  }

  const customerId = idOf(session.customer);
  const subscriptionId = idOf(session.subscription);
  const plan = parsePlan(session.metadata?.plan) ?? "pro";
  const existing = await findRow(tx, { organizationId });
  const now = new Date();

  if (!existing) {
    await tx.insert(subscription).values({
      organizationId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      plan,
      status: "active",
      lastEventAt: toDate(event.created),
      updatedAt: now,
    });
    return;
  }

  // A customer.subscription.* event may already have arrived with fuller,
  // authoritative data; only fill in what is missing in that case.
  const alreadySynced = existing.stripeSubscriptionId === subscriptionId && !!existing.lastEventAt;
  await tx
    .update(subscription)
    .set({
      stripeCustomerId: customerId ?? existing.stripeCustomerId,
      stripeSubscriptionId: subscriptionId ?? existing.stripeSubscriptionId,
      ...(alreadySynced ? {} : { plan, status: "active", lastEventAt: toDate(event.created) }),
      updatedAt: now,
    })
    .where(eq(subscription.organizationId, organizationId));
};

const onSubscriptionChanged: Handler = async (tx, event) => {
  const sub = event.data.object as Stripe.Subscription;
  const customerId = idOf(sub.customer);
  const existing = await findRow(tx, {
    organizationId: sub.metadata?.organizationId,
    subscriptionId: sub.id,
    customerId,
  });
  const organizationId = existing?.organizationId ?? sub.metadata?.organizationId ?? null;
  if (!organizationId || (!existing && !(await organizationExists(tx, organizationId)))) {
    return { ignored: "unknown organization" };
  }
  if (isStale(existing, event)) return { ignored: "stale event" };

  const item = sub.items?.data?.[0];
  const priceId = item?.price?.id ?? null;
  const deleted = event.type === "customer.subscription.deleted";
  const plan = deleted
    ? "free"
    : (planForPriceId(priceId) ?? parsePlan(sub.metadata?.plan) ?? existing?.plan ?? "free");

  const values = {
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    stripePriceId: priceId,
    plan,
    status: deleted ? "canceled" : sub.status,
    currentPeriodEnd: toDate(item?.current_period_end),
    cancelAtPeriodEnd: deleted ? false : sub.cancel_at_period_end,
    lastEventAt: toDate(event.created),
    updatedAt: new Date(),
  };

  if (existing) {
    await tx.update(subscription).set(values).where(eq(subscription.organizationId, organizationId));
  } else {
    await tx.insert(subscription).values({ organizationId, ...values });
  }
};

const onInvoicePaymentFailed: Handler = async (tx, event) => {
  const invoice = event.data.object as Stripe.Invoice;
  const subscriptionId = idOf(invoice.parent?.subscription_details?.subscription);
  const existing = await findRow(tx, {
    organizationId: invoice.parent?.subscription_details?.metadata?.organizationId,
    subscriptionId,
    customerId: idOf(invoice.customer),
  });
  if (!existing) return { ignored: "unknown subscription" };
  if (isStale(existing, event)) return { ignored: "stale event" };

  await tx
    .update(subscription)
    .set({ status: "past_due", lastEventAt: toDate(event.created), updatedAt: new Date() })
    .where(eq(subscription.organizationId, existing.organizationId));
};

export const defaultHandlers: Partial<Record<Stripe.Event.Type, Handler>> = {
  "checkout.session.completed": onCheckoutCompleted,
  "customer.subscription.created": onSubscriptionChanged,
  "customer.subscription.updated": onSubscriptionChanged,
  "customer.subscription.deleted": onSubscriptionChanged,
  "invoice.payment_failed": onInvoicePaymentFailed,
};

/** Applies a verified Stripe event exactly once. */
export async function handleStripeEvent(
  db: Database,
  event: Stripe.Event,
  handlers: Partial<Record<string, Handler>> = defaultHandlers,
): Promise<ProcessResult> {
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(stripeEvent)
      .values({ id: event.id, type: event.type })
      .onConflictDoNothing({ target: stripeEvent.id })
      .returning({ id: stripeEvent.id });

    if (inserted.length === 0) return { status: "duplicate", eventId: event.id, type: event.type };

    const handler = handlers[event.type];
    if (!handler) return { status: "ignored", eventId: event.id, type: event.type, reason: "unhandled event type" };

    const outcome = await handler(tx, event);
    if (outcome && "ignored" in outcome) {
      return { status: "ignored", eventId: event.id, type: event.type, reason: outcome.ignored };
    }
    return { status: "processed", eventId: event.id, type: event.type };
  });
}

// Signature verification needs no API key; a placeholder keeps it offline.
const verifier = new Stripe("sk_test_signature_verification_only");

export type WebhookResponse = { status: number; body: Record<string, unknown> };

/** Verifies the signature, then processes the event. Used by the route handler. */
export async function processStripeWebhook(input: {
  db: Database;
  payload: string;
  signature: string | null;
  secret: string | undefined;
}): Promise<WebhookResponse> {
  if (!input.secret) return { status: 500, body: { error: "Webhook secret not configured" } };
  if (!input.signature) return { status: 400, body: { error: "Missing stripe-signature header" } };

  let event: Stripe.Event;
  try {
    event = verifier.webhooks.constructEvent(input.payload, input.signature, input.secret);
  } catch {
    return { status: 400, body: { error: "Invalid signature" } };
  }

  const result = await handleStripeEvent(input.db, event);
  return { status: 200, body: { received: true, ...result } };
}

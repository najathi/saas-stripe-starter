/**
 * Minimal but realistic Stripe event payloads (API version 2026-11-18).
 * Only the fields the webhook handler reads are guaranteed to be meaningful.
 */
import Stripe from "stripe";

export const WEBHOOK_SECRET = "whsec_test_fixture_secret";
export const PRICE_PRO = "price_test_pro_monthly";
export const PRICE_TEAM = "price_test_team_monthly";

const stripe = new Stripe("sk_test_fixture");
let counter = 0;

export function baseEvent<T extends object>(type: string, object: T, created = Math.floor(Date.now() / 1000)) {
  counter += 1;
  return {
    id: `evt_test_${counter}_${Math.random().toString(36).slice(2, 10)}`,
    object: "event",
    api_version: "2026-11-18.endive",
    created,
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
    data: { object },
  };
}

/** Serialises and signs a payload exactly like Stripe does. */
export function sign(event: object, secret = WEBHOOK_SECRET) {
  const payload = JSON.stringify(event, null, 2);
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
  return { payload, signature };
}

export function checkoutCompleted(opts: {
  organizationId: string;
  plan?: string;
  customer?: string;
  subscription?: string;
  created?: number;
}) {
  return baseEvent(
    "checkout.session.completed",
    {
      id: `cs_test_${Math.random().toString(36).slice(2, 10)}`,
      object: "checkout.session",
      mode: "subscription",
      status: "complete",
      payment_status: "paid",
      client_reference_id: opts.organizationId,
      customer: opts.customer ?? "cus_test_123",
      subscription: opts.subscription ?? "sub_test_123",
      metadata: { organizationId: opts.organizationId, plan: opts.plan ?? "pro" },
    },
    opts.created,
  );
}

export function subscriptionEvent(
  type: "customer.subscription.created" | "customer.subscription.updated" | "customer.subscription.deleted",
  opts: {
    organizationId?: string;
    id?: string;
    customer?: string;
    price?: string;
    status?: string;
    cancelAtPeriodEnd?: boolean;
    periodEnd?: number;
    created?: number;
  },
) {
  const periodEnd = opts.periodEnd ?? Math.floor(Date.now() / 1000) + 30 * 86400;
  return baseEvent(
    type,
    {
      id: opts.id ?? "sub_test_123",
      object: "subscription",
      customer: opts.customer ?? "cus_test_123",
      status: opts.status ?? "active",
      cancel_at_period_end: opts.cancelAtPeriodEnd ?? false,
      metadata: opts.organizationId ? { organizationId: opts.organizationId } : {},
      items: {
        object: "list",
        data: [
          {
            id: "si_test_1",
            object: "subscription_item",
            price: { id: opts.price ?? PRICE_PRO, object: "price", recurring: { interval: "month" } },
            quantity: 1,
            current_period_start: periodEnd - 30 * 86400,
            current_period_end: periodEnd,
          },
        ],
      },
    },
    opts.created,
  );
}

export function invoicePaymentFailed(opts: { subscription?: string; customer?: string; created?: number }) {
  return baseEvent(
    "invoice.payment_failed",
    {
      id: `in_test_${Math.random().toString(36).slice(2, 10)}`,
      object: "invoice",
      customer: opts.customer ?? "cus_test_123",
      status: "open",
      attempt_count: 1,
      billing_reason: "subscription_cycle",
      parent: {
        type: "subscription_details",
        quote_details: null,
        subscription_details: { subscription: opts.subscription ?? "sub_test_123", metadata: {} },
      },
    },
    opts.created,
  );
}

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DatabaseHandle } from "@/db/client";
import { stripeEvent, subscription } from "@/db/schema";
import { getOrganizationPlan } from "@/lib/billing/plan";
import { processStripeWebhook } from "@/lib/billing/webhook";
import {
  PRICE_PRO,
  PRICE_TEAM,
  WEBHOOK_SECRET,
  checkoutCompleted,
  invoicePaymentFailed,
  sign,
  subscriptionEvent,
} from "./fixtures/stripe-events";
import { createOrgWithOwner, createTestDb } from "./helpers/db";

let h: DatabaseHandle;

beforeAll(async () => {
  process.env.STRIPE_PRICE_PRO = PRICE_PRO;
  process.env.STRIPE_PRICE_TEAM = PRICE_TEAM;
  h = await createTestDb();
});
afterAll(async () => {
  await h.close();
});

async function deliver(event: object, secret = WEBHOOK_SECRET) {
  const { payload, signature } = sign(event, secret);
  return processStripeWebhook({ db: h.db, payload, signature, secret: WEBHOOK_SECRET });
}

async function rowFor(orgId: string) {
  const [row] = await h.db.select().from(subscription).where(eq(subscription.organizationId, orgId));
  return row;
}

const uniq = () => Math.random().toString(36).slice(2, 10);

describe("signature verification", () => {
  it("rejects a missing signature", async () => {
    const { payload } = sign(checkoutCompleted({ organizationId: "org_x" }));
    const res = await processStripeWebhook({ db: h.db, payload, signature: null, secret: WEBHOOK_SECRET });
    expect(res.status).toBe(400);
  });

  it("rejects a payload signed with the wrong secret", async () => {
    const res = await deliver(checkoutCompleted({ organizationId: "org_x" }), "whsec_attacker");
    expect(res).toEqual({ status: 400, body: { error: "Invalid signature" } });
  });

  it("rejects a tampered payload", async () => {
    const { org } = await createOrgWithOwner(h);
    const { payload, signature } = sign(checkoutCompleted({ organizationId: org.id, plan: "pro" }));
    const tampered = payload.replace('"plan": "pro"', '"plan": "team"');
    expect(tampered).not.toBe(payload);
    const res = await processStripeWebhook({ db: h.db, payload: tampered, signature, secret: WEBHOOK_SECRET });
    expect(res.status).toBe(400);
    expect(await rowFor(org.id)).toBeUndefined();
  });

  it("rejects an expired signature (replay protection)", async () => {
    const event = checkoutCompleted({ organizationId: "org_x" });
    const payload = JSON.stringify(event);
    const { default: Stripe } = await import("stripe");
    const signature = new Stripe("sk_test_x").webhooks.generateTestHeaderString({
      payload,
      secret: WEBHOOK_SECRET,
      timestamp: Math.floor(Date.now() / 1000) - 60 * 60, // 1 hour old; default tolerance is 5 min
    });
    const res = await processStripeWebhook({ db: h.db, payload, signature, secret: WEBHOOK_SECRET });
    expect(res.status).toBe(400);
  });

  it("returns 500 when the webhook secret is not configured", async () => {
    const { payload, signature } = sign(checkoutCompleted({ organizationId: "org_x" }));
    const res = await processStripeWebhook({ db: h.db, payload, signature, secret: undefined });
    expect(res.status).toBe(500);
  });
});

describe("checkout.session.completed", () => {
  it("activates the purchased plan for the organisation", async () => {
    const { org } = await createOrgWithOwner(h);
    const cus = `cus_${uniq()}`;
    const sub = `sub_${uniq()}`;
    const res = await deliver(checkoutCompleted({ organizationId: org.id, plan: "pro", customer: cus, subscription: sub }));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true, status: "processed" });
    expect(await rowFor(org.id)).toMatchObject({
      plan: "pro",
      status: "active",
      stripeCustomerId: cus,
      stripeSubscriptionId: sub,
    });
    expect((await getOrganizationPlan(h.db, org.id)).plan).toBe("pro");
  });

  it("ignores checkouts for unknown organisations", async () => {
    const res = await deliver(checkoutCompleted({ organizationId: "org_does_not_exist" }));
    expect(res.body).toMatchObject({ status: "ignored", reason: "unknown organization" });
  });

  it("does not overwrite fresher data from an earlier subscription event", async () => {
    const { org } = await createOrgWithOwner(h);
    const cus = `cus_${uniq()}`;
    const sub = `sub_${uniq()}`;
    // Stripe may deliver subscription.created before checkout.session.completed.
    await deliver(
      subscriptionEvent("customer.subscription.created", { organizationId: org.id, id: sub, customer: cus, price: PRICE_TEAM }),
    );
    await deliver(checkoutCompleted({ organizationId: org.id, plan: "pro", customer: cus, subscription: sub }));
    expect(await rowFor(org.id)).toMatchObject({ plan: "team", stripePriceId: PRICE_TEAM });
  });
});

describe("customer.subscription.updated / deleted", () => {
  it("syncs plan, status, period end and cancellation from the subscription", async () => {
    const { org } = await createOrgWithOwner(h);
    const cus = `cus_${uniq()}`;
    const sub = `sub_${uniq()}`;
    const now = Math.floor(Date.now() / 1000);
    await deliver(checkoutCompleted({ organizationId: org.id, customer: cus, subscription: sub, created: now }));

    const periodEnd = now + 31 * 86400;
    const res = await deliver(
      subscriptionEvent("customer.subscription.updated", {
        id: sub,
        customer: cus,
        price: PRICE_TEAM,
        cancelAtPeriodEnd: true,
        periodEnd,
        created: now + 10,
      }),
    );

    expect(res.body).toMatchObject({ status: "processed" });
    const row = await rowFor(org.id);
    expect(row).toMatchObject({ plan: "team", status: "active", cancelAtPeriodEnd: true, stripePriceId: PRICE_TEAM });
    expect(row?.currentPeriodEnd?.getTime()).toBe(periodEnd * 1000);
  });

  it("resolves the organisation by customer id when metadata is missing", async () => {
    const { org } = await createOrgWithOwner(h);
    const cus = `cus_${uniq()}`;
    const now = Math.floor(Date.now() / 1000);
    await deliver(checkoutCompleted({ organizationId: org.id, customer: cus, subscription: `sub_${uniq()}`, created: now }));
    await deliver(
      subscriptionEvent("customer.subscription.updated", { id: `sub_${uniq()}`, customer: cus, price: PRICE_TEAM, created: now + 5 }),
    );
    expect((await rowFor(org.id))?.plan).toBe("team");
  });

  it("downgrades to Free when the subscription is deleted", async () => {
    const { org } = await createOrgWithOwner(h);
    const cus = `cus_${uniq()}`;
    const sub = `sub_${uniq()}`;
    const now = Math.floor(Date.now() / 1000);
    await deliver(checkoutCompleted({ organizationId: org.id, customer: cus, subscription: sub, created: now }));
    await deliver(
      subscriptionEvent("customer.subscription.deleted", { id: sub, customer: cus, status: "canceled", created: now + 10 }),
    );

    expect(await rowFor(org.id)).toMatchObject({ plan: "free", status: "canceled" });
    expect((await getOrganizationPlan(h.db, org.id)).plan).toBe("free");
  });

  it("skips stale (out-of-order) events", async () => {
    const { org } = await createOrgWithOwner(h);
    const cus = `cus_${uniq()}`;
    const sub = `sub_${uniq()}`;
    const now = Math.floor(Date.now() / 1000);
    await deliver(
      subscriptionEvent("customer.subscription.updated", { organizationId: org.id, id: sub, customer: cus, price: PRICE_TEAM, created: now }),
    );
    const res = await deliver(
      subscriptionEvent("customer.subscription.updated", { organizationId: org.id, id: sub, customer: cus, price: PRICE_PRO, created: now - 60 }),
    );
    expect(res.body).toMatchObject({ status: "ignored", reason: "stale event" });
    expect((await rowFor(org.id))?.plan).toBe("team");
  });

  it("ignores subscriptions that belong to no known organisation", async () => {
    const res = await deliver(subscriptionEvent("customer.subscription.updated", { id: `sub_${uniq()}`, customer: `cus_${uniq()}` }));
    expect(res.body).toMatchObject({ status: "ignored", reason: "unknown organization" });
  });
});

describe("invoice.payment_failed", () => {
  it("marks the subscription past_due but keeps the plan (grace period)", async () => {
    const { org } = await createOrgWithOwner(h);
    const cus = `cus_${uniq()}`;
    const sub = `sub_${uniq()}`;
    const now = Math.floor(Date.now() / 1000);
    await deliver(checkoutCompleted({ organizationId: org.id, customer: cus, subscription: sub, created: now }));
    const res = await deliver(invoicePaymentFailed({ subscription: sub, customer: cus, created: now + 10 }));

    expect(res.body).toMatchObject({ status: "processed" });
    expect(await rowFor(org.id)).toMatchObject({ status: "past_due", plan: "pro" });
    expect((await getOrganizationPlan(h.db, org.id)).plan).toBe("pro");
  });

  it("ignores failures for unknown subscriptions", async () => {
    const res = await deliver(invoicePaymentFailed({ subscription: `sub_${uniq()}`, customer: `cus_${uniq()}` }));
    expect(res.body).toMatchObject({ status: "ignored", reason: "unknown subscription" });
  });
});

describe("unhandled event types", () => {
  it("acknowledges and records them without side effects", async () => {
    const event = { ...checkoutCompleted({ organizationId: "org_x" }), type: "customer.created" };
    const res = await deliver(event);
    expect(res).toMatchObject({ status: 200, body: { status: "ignored", reason: "unhandled event type" } });
    const [recorded] = await h.db.select().from(stripeEvent).where(eq(stripeEvent.id, (event as { id: string }).id));
    expect(recorded?.type).toBe("customer.created");
  });
});

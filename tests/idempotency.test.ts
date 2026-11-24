import { count, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DatabaseHandle } from "@/db/client";
import { stripeEvent, subscription } from "@/db/schema";
import { defaultHandlers, handleStripeEvent, processStripeWebhook } from "@/lib/billing/webhook";
import { PRICE_PRO, PRICE_TEAM, WEBHOOK_SECRET, checkoutCompleted, sign, subscriptionEvent } from "./fixtures/stripe-events";
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

async function eventCount(id: string) {
  const [row] = await h.db.select({ n: count() }).from(stripeEvent).where(eq(stripeEvent.id, id));
  return Number(row?.n ?? 0);
}

describe("webhook idempotency", () => {
  it("processes a redelivered event only once", async () => {
    const { org } = await createOrgWithOwner(h);
    const event = checkoutCompleted({ organizationId: org.id, plan: "pro", customer: "cus_idem_1", subscription: "sub_idem_1" });
    const { payload, signature } = sign(event);

    const first = await processStripeWebhook({ db: h.db, payload, signature, secret: WEBHOOK_SECRET });
    // Simulate a manual change between deliveries; a duplicate must not undo it.
    await h.db.update(subscription).set({ plan: "team" }).where(eq(subscription.organizationId, org.id));
    const second = await processStripeWebhook({ db: h.db, payload, signature, secret: WEBHOOK_SECRET });

    expect(first.body).toMatchObject({ status: "processed" });
    expect(second).toMatchObject({ status: 200, body: { status: "duplicate", eventId: event.id } });
    expect(await eventCount(event.id)).toBe(1);
    const [row] = await h.db.select().from(subscription).where(eq(subscription.organizationId, org.id));
    expect(row?.plan).toBe("team");
  });

  it("handles concurrent deliveries of the same event exactly once", async () => {
    const { org } = await createOrgWithOwner(h);
    const event = subscriptionEvent("customer.subscription.updated", {
      organizationId: org.id,
      id: "sub_idem_concurrent",
      customer: "cus_idem_concurrent",
      price: PRICE_TEAM,
    }) as unknown as Stripe.Event;

    let calls = 0;
    const counting = {
      ...defaultHandlers,
      "customer.subscription.updated": async (...args: Parameters<NonNullable<(typeof defaultHandlers)["customer.subscription.updated"]>>) => {
        calls += 1;
        return defaultHandlers["customer.subscription.updated"]!(...args);
      },
    };

    const results = await Promise.all(Array.from({ length: 5 }, () => handleStripeEvent(h.db, event, counting)));
    expect(results.filter((r) => r.status === "processed")).toHaveLength(1);
    expect(results.filter((r) => r.status === "duplicate")).toHaveLength(4);
    expect(calls).toBe(1);
    expect(await eventCount(event.id)).toBe(1);
  });

  it("rolls back the event record when a handler fails, so Stripe's retry succeeds", async () => {
    const { org } = await createOrgWithOwner(h);
    const event = checkoutCompleted({ organizationId: org.id, customer: "cus_idem_retry", subscription: "sub_idem_retry" }) as unknown as Stripe.Event;

    const failing = {
      ...defaultHandlers,
      "checkout.session.completed": async () => {
        throw new Error("database hiccup");
      },
    };
    await expect(handleStripeEvent(h.db, event, failing)).rejects.toThrow("database hiccup");
    expect(await eventCount(event.id)).toBe(0);

    const retry = await handleStripeEvent(h.db, event);
    expect(retry.status).toBe("processed");
    expect(await eventCount(event.id)).toBe(1);
    const [row] = await h.db.select().from(subscription).where(eq(subscription.organizationId, org.id));
    expect(row?.plan).toBe("pro");
  });

  it("treats different event ids for the same object as separate events", async () => {
    const { org } = await createOrgWithOwner(h);
    const a = checkoutCompleted({ organizationId: org.id, customer: "cus_idem_two", subscription: "sub_idem_two" });
    const b = { ...a, id: `${a.id}_b` };
    expect((await handleStripeEvent(h.db, a as unknown as Stripe.Event)).status).toBe("processed");
    expect((await handleStripeEvent(h.db, b as unknown as Stripe.Event)).status).toBe("processed");
  });
});

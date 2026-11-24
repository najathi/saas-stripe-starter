import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { DatabaseHandle } from "@/db/client";
import { subscription } from "@/db/schema";
import { PRICE_PRO, WEBHOOK_SECRET, checkoutCompleted, sign } from "./fixtures/stripe-events";
import { createOrgWithOwner, createTestDb } from "./helpers/db";

// Point the route's `db` import at an in-memory test database.
const holder = vi.hoisted(() => ({ handle: undefined as DatabaseHandle | undefined }));
vi.mock("@/db", () => ({
  get db() {
    return holder.handle!.db;
  },
}));

beforeAll(async () => {
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.STRIPE_PRICE_PRO = PRICE_PRO;
  holder.handle = await createTestDb();
});
afterAll(async () => {
  await holder.handle?.close();
});

describe("POST /api/stripe/webhook", () => {
  it("accepts a correctly signed event and updates the database", async () => {
    const { POST } = await import("@/app/api/stripe/webhook/route");
    const { org } = await createOrgWithOwner(holder.handle!);
    const { payload, signature } = sign(checkoutCompleted({ organizationId: org.id, plan: "pro", customer: "cus_route", subscription: "sub_route" }));

    const res = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": signature, "content-type": "application/json" },
        body: payload,
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ received: true, status: "processed" });
    const [row] = await holder.handle!.db.select().from(subscription).where(eq(subscription.organizationId, org.id));
    expect(row?.plan).toBe("pro");
  });

  it("returns 400 for an unsigned request", async () => {
    const { POST } = await import("@/app/api/stripe/webhook/route");
    const res = await POST(new Request("http://localhost/api/stripe/webhook", { method: "POST", body: "{}" }));
    expect(res.status).toBe(400);
  });
});

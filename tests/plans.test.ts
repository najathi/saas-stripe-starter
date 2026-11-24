import { describe, expect, it } from "vitest";
import {
  PLAN_ORDER,
  canAdd,
  cheapestPlanWith,
  getLimit,
  hasFeature,
  isPlanId,
  planSatisfies,
  plans,
} from "@/config/plans";
import { resolveEffectivePlan } from "@/lib/billing/plan";
import { planForPriceId, priceIdForPlan } from "@/lib/billing/stripe";

describe("plan config", () => {
  it("defines free, pro and team in upgrade order", () => {
    expect(PLAN_ORDER).toEqual(["free", "pro", "team"]);
    expect(plans.free.priceMonthly).toBe(0);
    expect(plans.free.stripePriceEnv).toBeNull();
    expect(plans.pro.stripePriceEnv).toBe("STRIPE_PRICE_PRO");
  });

  it("limits Free to 3 projects", () => {
    expect(getLimit("free", "projects")).toBe(3);
    expect(canAdd("free", "projects", 2)).toBe(true);
    expect(canAdd("free", "projects", 3)).toBe(false);
  });

  it("treats null limits as unlimited", () => {
    expect(getLimit("team", "projects")).toBeNull();
    expect(canAdd("team", "projects", 10_000)).toBe(true);
  });

  it("compares plan tiers", () => {
    expect(planSatisfies("free", "pro")).toBe(false);
    expect(planSatisfies("pro", "pro")).toBe(true);
    expect(planSatisfies("team", "pro")).toBe(true);
    expect(planSatisfies("pro", "team")).toBe(false);
  });

  it("resolves features and the cheapest plan offering them", () => {
    expect(hasFeature("free", "csv-export")).toBe(false);
    expect(hasFeature("pro", "csv-export")).toBe(true);
    expect(cheapestPlanWith("csv-export")).toBe("pro");
    expect(cheapestPlanWith("priority-support")).toBe("team");
  });

  it("validates plan ids", () => {
    expect(isPlanId("pro")).toBe(true);
    expect(isPlanId("enterprise")).toBe(false);
    expect(isPlanId(undefined)).toBe(false);
  });
});

describe("resolveEffectivePlan", () => {
  it.each([
    ["active", "pro"],
    ["trialing", "pro"],
    ["past_due", "pro"], // grace period while Stripe retries
    ["canceled", "free"],
    ["unpaid", "free"],
    ["incomplete", "free"],
    ["incomplete_expired", "free"],
  ])("status %s on a Pro subscription -> %s", (status, expected) => {
    expect(resolveEffectivePlan({ plan: "pro", status })).toBe(expected);
  });

  it("falls back to free without a subscription or with an unknown plan", () => {
    expect(resolveEffectivePlan(null)).toBe("free");
    expect(resolveEffectivePlan({ plan: "enterprise", status: "active" })).toBe("free");
  });
});

describe("Stripe price mapping", () => {
  const env = { STRIPE_PRICE_PRO: "price_pro", STRIPE_PRICE_TEAM: "price_team" } as unknown as NodeJS.ProcessEnv;

  it("maps plans to price ids from env", () => {
    expect(priceIdForPlan("pro", env)).toBe("price_pro");
    expect(priceIdForPlan("free", env)).toBeNull();
    expect(priceIdForPlan("team", {} as unknown as NodeJS.ProcessEnv)).toBeNull();
  });

  it("maps price ids back to plans", () => {
    expect(planForPriceId("price_team", env)).toBe("team");
    expect(planForPriceId("price_unknown", env)).toBeNull();
    expect(planForPriceId(null, env)).toBeNull();
  });
});

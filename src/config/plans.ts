/**
 * Single source of truth for plans, prices, limits and feature flags.
 *
 * - Marketing (pricing table), billing (Stripe Checkout) and gating
 *   (`requirePlan`, `assertWithinLimit`) all read from this file.
 * - Stripe Price IDs are not hard-coded: each paid plan names the env var
 *   that holds its recurring Price ID, so test and live mode can differ.
 *
 * This file is safe to import from client components (no secrets, no env reads).
 */

export const PLAN_IDS = ["free", "pro", "team"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export type LimitedResource = "projects" | "members";

export type Feature = "projects" | "invites" | "csv-export" | "priority-support";

export interface Plan {
  id: PlanId;
  name: string;
  description: string;
  /** Monthly price in whole USD, shown on the pricing table. */
  priceMonthly: number;
  /** Env var holding the Stripe recurring Price ID. `null` for free plans. */
  stripePriceEnv: string | null;
  /** `null` means unlimited. */
  limits: Record<LimitedResource, number | null>;
  features: readonly Feature[];
  /** Bullet points for the pricing table. */
  highlights: readonly string[];
  /** Visually highlight this plan on the pricing table. */
  popular?: boolean;
}

export const plans: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    description: "For side projects and trying things out.",
    priceMonthly: 0,
    stripePriceEnv: null,
    limits: { projects: 3, members: 2 },
    features: ["projects", "invites"],
    highlights: ["Up to 3 projects", "Up to 2 team members", "Community support"],
  },
  pro: {
    id: "pro",
    name: "Pro",
    description: "For small teams shipping real products.",
    priceMonthly: 19,
    stripePriceEnv: "STRIPE_PRICE_PRO",
    limits: { projects: 25, members: 5 },
    features: ["projects", "invites", "csv-export"],
    highlights: ["Up to 25 projects", "Up to 5 team members", "CSV export", "Email support"],
    popular: true,
  },
  team: {
    id: "team",
    name: "Team",
    description: "For growing organisations that need room to scale.",
    priceMonthly: 49,
    stripePriceEnv: "STRIPE_PRICE_TEAM",
    limits: { projects: null, members: 25 },
    features: ["projects", "invites", "csv-export", "priority-support"],
    highlights: ["Unlimited projects", "Up to 25 team members", "CSV export", "Priority support"],
  },
};

/** Plans in upgrade order. `requirePlan("pro")` is satisfied by pro and team. */
export const PLAN_ORDER: readonly PlanId[] = PLAN_IDS;

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value);
}

export function planRank(plan: PlanId): number {
  return PLAN_ORDER.indexOf(plan);
}

/** True when `current` is the same tier as `required` or higher. */
export function planSatisfies(current: PlanId, required: PlanId): boolean {
  return planRank(current) >= planRank(required);
}

export function getLimit(plan: PlanId, resource: LimitedResource): number | null {
  return plans[plan].limits[resource];
}

/** True when one more `resource` can be added given the current usage. */
export function canAdd(plan: PlanId, resource: LimitedResource, currentUsage: number): boolean {
  const limit = getLimit(plan, resource);
  return limit === null || currentUsage < limit;
}

export function hasFeature(plan: PlanId, feature: Feature): boolean {
  return plans[plan].features.includes(feature);
}

/** Cheapest plan that includes `feature`. */
export function cheapestPlanWith(feature: Feature): PlanId {
  return PLAN_ORDER.find((id) => hasFeature(id, feature)) ?? "team";
}

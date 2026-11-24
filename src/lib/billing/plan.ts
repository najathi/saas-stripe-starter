import { count, eq } from "drizzle-orm";
import {
  canAdd,
  cheapestPlanWith,
  getLimit,
  hasFeature,
  isPlanId,
  planSatisfies,
  plans,
  type Feature,
  type LimitedResource,
  type PlanId,
} from "@/config/plans";
import type { Database } from "@/db/client";
import { member, project, subscription, type SubscriptionRow } from "@/db/schema";

/**
 * Subscription statuses that keep paid features switched on.
 * `past_due` is a grace period: Stripe is still retrying the card
 * (Smart Retries). If retries fail, Stripe cancels the subscription and the
 * `customer.subscription.deleted` webhook drops the org back to Free.
 */
export const ENTITLED_STATUSES = new Set(["active", "trialing", "past_due"]);

/** Pure: which plan an organisation is entitled to, given its subscription row. */
export function resolveEffectivePlan(
  row: Pick<SubscriptionRow, "plan" | "status"> | null | undefined,
): PlanId {
  if (!row || !ENTITLED_STATUSES.has(row.status) || !isPlanId(row.plan)) return "free";
  return row.plan;
}

export async function getOrganizationPlan(db: Database, organizationId: string) {
  const [row] = await db
    .select()
    .from(subscription)
    .where(eq(subscription.organizationId, organizationId))
    .limit(1);
  return { plan: resolveEffectivePlan(row), subscription: row ?? null };
}

export class PlanRequiredError extends Error {
  readonly status = 402;
  constructor(
    readonly requiredPlan: PlanId,
    readonly currentPlan: PlanId,
    message = `This feature requires the ${plans[requiredPlan].name} plan.`,
  ) {
    super(message);
    this.name = "PlanRequiredError";
  }
}

export class PlanLimitError extends Error {
  readonly status = 402;
  constructor(
    readonly resource: LimitedResource,
    readonly limit: number,
    readonly currentPlan: PlanId,
  ) {
    super(
      `Your ${plans[currentPlan].name} plan includes up to ${limit} ${resource}. Upgrade to add more.`,
    );
    this.name = "PlanLimitError";
  }
}

/**
 * Server-side plan gate. Throws `PlanRequiredError` unless the organisation's
 * effective plan is `minimum` or higher.
 *
 * @example
 *   const { plan } = await requirePlan(db, orgId, "pro");
 */
export async function requirePlan(db: Database, organizationId: string, minimum: PlanId) {
  const result = await getOrganizationPlan(db, organizationId);
  if (!planSatisfies(result.plan, minimum)) throw new PlanRequiredError(minimum, result.plan);
  return result;
}

/** Server-side feature gate (feature flags live in src/config/plans.ts). */
export async function requireFeature(db: Database, organizationId: string, feature: Feature) {
  const result = await getOrganizationPlan(db, organizationId);
  if (!hasFeature(result.plan, feature)) {
    throw new PlanRequiredError(cheapestPlanWith(feature), result.plan);
  }
  return result;
}

export async function countUsage(db: Database, organizationId: string, resource: LimitedResource) {
  const table = resource === "projects" ? project : member;
  const [row] = await db
    .select({ n: count() })
    .from(table)
    .where(eq(table.organizationId, organizationId));
  return Number(row?.n ?? 0);
}

/** Throws `PlanLimitError` if adding one more `resource` would exceed the plan limit. */
export async function assertWithinLimit(db: Database, organizationId: string, resource: LimitedResource) {
  const { plan } = await getOrganizationPlan(db, organizationId);
  const used = await countUsage(db, organizationId, resource);
  if (!canAdd(plan, resource, used)) {
    throw new PlanLimitError(resource, getLimit(plan, resource)!, plan);
  }
  return { plan, used };
}

/**
 * How many pending invitations an organisation may hold: the seats left on
 * its plan. Together with `membershipLimit` this stops invites from
 * overshooting the plan's member limit.
 */
export async function getInvitationAllowance(db: Database, organizationId: string) {
  const { plan } = await getOrganizationPlan(db, organizationId);
  const limit = getLimit(plan, "members");
  if (limit === null) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, limit - (await countUsage(db, organizationId, "members")));
}

/** Usage summary for the dashboard. */
export async function getUsageSummary(db: Database, organizationId: string) {
  const { plan, subscription: sub } = await getOrganizationPlan(db, organizationId);
  const [projects, members] = await Promise.all([
    countUsage(db, organizationId, "projects"),
    countUsage(db, organizationId, "members"),
  ]);
  return {
    plan,
    subscription: sub,
    usage: {
      projects: { used: projects, limit: getLimit(plan, "projects") },
      members: { used: members, limit: getLimit(plan, "members") },
    },
  };
}

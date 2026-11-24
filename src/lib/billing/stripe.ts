import Stripe from "stripe";
import { isPlanId, plans, type PlanId } from "@/config/plans";

let client: Stripe | undefined;

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY?.trim();
}

/** Lazily-created Stripe client. Throws if STRIPE_SECRET_KEY is missing. */
export function getStripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY?.trim();
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set.");
    client = new Stripe(key, {
      appInfo: { name: "saas-stripe-starter", url: "https://github.com/najathi" },
    });
  }
  return client;
}

/** Stripe Price ID for a paid plan, read from the env var named in plans.ts. */
export function priceIdForPlan(plan: PlanId, source: NodeJS.ProcessEnv = process.env): string | null {
  const envName = plans[plan].stripePriceEnv;
  return envName ? source[envName]?.trim() || null : null;
}

/** Reverse lookup used by the webhook handler: Stripe Price ID -> plan. */
export function planForPriceId(
  priceId: string | null | undefined,
  source: NodeJS.ProcessEnv = process.env,
): PlanId | null {
  if (!priceId) return null;
  for (const plan of Object.values(plans)) {
    if (plan.stripePriceEnv && source[plan.stripePriceEnv]?.trim() === priceId) return plan.id;
  }
  return null;
}

export function parsePlan(value: unknown): PlanId | null {
  return isPlanId(value) ? value : null;
}

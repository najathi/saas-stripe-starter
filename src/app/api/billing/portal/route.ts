import { NextResponse } from "next/server";
import { db } from "@/db";
import { env } from "@/env";
import { requireOrgPermission } from "@/lib/auth/membership";
import { getOrganizationPlan } from "@/lib/billing/plan";
import { getApiContext } from "@/lib/auth/api-context";
import { getStripe, isStripeConfigured } from "@/lib/billing/stripe";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";

/** Opens the Stripe Customer Portal for the active organisation. */
export async function POST() {
  const ctx = await getApiContext();
  if (!ctx) return NextResponse.redirect(new URL("/sign-in", env.appUrl), 303);
  const billingUrl = new URL("/dashboard/billing", env.appUrl);

  try {
    await requireOrgPermission(db, { organizationId: ctx.organizationId, userId: ctx.user.id }, { billing: ["manage"] });
    const { subscription } = await getOrganizationPlan(db, ctx.organizationId);
    if (!isStripeConfigured() || !subscription?.stripeCustomerId) {
      billingUrl.searchParams.set("error", "no-customer");
      return NextResponse.redirect(billingUrl, 303);
    }
    const portal = await getStripe().billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: billingUrl.toString(),
    });
    return NextResponse.redirect(portal.url, 303);
  } catch (error) {
    return errorResponse(error);
  }
}

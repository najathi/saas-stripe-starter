import { NextResponse } from "next/server";
import { db } from "@/db";
import { env } from "@/env";
import { requireOrgPermission } from "@/lib/auth/membership";
import { getOrganizationPlan } from "@/lib/billing/plan";
import { getApiContext } from "@/lib/auth/api-context";
import { getStripe, isStripeConfigured, parsePlan, priceIdForPlan } from "@/lib/billing/stripe";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";

/** Starts a Stripe Checkout session for the active organisation (form POST). */
export async function POST(request: Request) {
  const ctx = await getApiContext();
  if (!ctx) return NextResponse.redirect(new URL("/sign-in", env.appUrl), 303);

  const form = await request.formData();
  const plan = parsePlan(form.get("plan"));
  const billingUrl = new URL("/dashboard/billing", env.appUrl);

  try {
    await requireOrgPermission(db, { organizationId: ctx.organizationId, userId: ctx.user.id }, { billing: ["manage"] });

    const priceId = plan ? priceIdForPlan(plan) : null;
    if (!plan || !priceId || !isStripeConfigured()) {
      billingUrl.searchParams.set("error", "not-configured");
      return NextResponse.redirect(billingUrl, 303);
    }

    const { plan: currentPlan, subscription } = await getOrganizationPlan(db, ctx.organizationId);
    const stripe = getStripe();

    // Already subscribed: plan changes, cancellation and card updates go through the Portal.
    if (currentPlan !== "free" && subscription?.stripeCustomerId) {
      const portal = await stripe.billingPortal.sessions.create({
        customer: subscription.stripeCustomerId,
        return_url: billingUrl.toString(),
      });
      return NextResponse.redirect(portal.url, 303);
    }

    const metadata = { organizationId: ctx.organizationId, plan };
    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        client_reference_id: ctx.organizationId,
        ...(subscription?.stripeCustomerId
          ? { customer: subscription.stripeCustomerId }
          : { customer_email: ctx.user.email }),
        metadata,
        subscription_data: { metadata },
        allow_promotion_codes: true,
        success_url: `${billingUrl}?checkout=success`,
        cancel_url: `${billingUrl}?checkout=cancelled`,
      },
      // Avoid duplicate sessions on double-submit within the same minute.
      { idempotencyKey: `checkout:${ctx.organizationId}:${plan}:${Math.floor(Date.now() / 60_000)}` },
    );

    return NextResponse.redirect(session.url!, 303);
  } catch (error) {
    return errorResponse(error);
  }
}

import type { Metadata } from "next";
import { PricingTable } from "@/components/pricing-table";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { plans } from "@/config/plans";
import { db } from "@/db";
import { roleHasPermission } from "@/lib/auth/permissions";
import { requireActiveOrg } from "@/lib/auth/session";
import { getOrganizationPlan } from "@/lib/billing/plan";
import { isStripeConfigured, priceIdForPlan } from "@/lib/billing/stripe";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Billing" };

const statusVariant: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  active: "success",
  trialing: "success",
  past_due: "warning",
  unpaid: "destructive",
  canceled: "secondary",
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; error?: string }>;
}) {
  const { organization, role } = await requireActiveOrg();
  const { plan, subscription } = await getOrganizationPlan(db, organization.id);
  const params = await searchParams;
  const canManage = roleHasPermission(role, { billing: ["manage"] });
  const stripeReady = isStripeConfigured() && !!priceIdForPlan("pro") && !!priceIdForPlan("team");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">Subscriptions are per organisation and managed through Stripe.</p>
      </div>

      {params.checkout === "success" && (
        <Alert variant="success">
          Payment received. Your plan updates as soon as Stripe&apos;s webhook arrives (usually within seconds) — refresh if
          it still shows the old plan.
        </Alert>
      )}
      {params.checkout === "cancelled" && <Alert>Checkout cancelled. No changes were made.</Alert>}
      {params.error && (
        <Alert variant="destructive">
          {params.error === "not-configured"
            ? "Stripe is not configured. Set STRIPE_SECRET_KEY and the STRIPE_PRICE_* variables."
            : "No Stripe customer exists for this organisation yet."}
        </Alert>
      )}
      {!stripeReady && (
        <Alert variant="warning">
          Stripe test keys are not configured, so checkout is disabled. See the README&apos;s quick start.
        </Alert>
      )}
      {!canManage && <Alert>Only organisation owners can change the plan. Your role: {role}.</Alert>}
      {subscription?.status === "past_due" && (
        <Alert variant="warning">
          Your last payment failed. Stripe will retry automatically — update your card in the billing portal to avoid
          losing access.
        </Alert>
      )}

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              {plans[plan].name} plan
              {subscription && (
                <Badge variant={statusVariant[subscription.status] ?? "secondary"}>
                  {subscription.status.replace("_", " ")}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {plan === "free"
                ? "You're on the free plan."
                : subscription?.cancelAtPeriodEnd
                  ? `Cancels on ${formatDate(subscription.currentPeriodEnd)}.`
                  : `Renews on ${formatDate(subscription?.currentPeriodEnd)}.`}
            </CardDescription>
          </div>
          {subscription?.stripeCustomerId && (
            <form action="/api/billing/portal" method="post">
              <Button variant="outline" disabled={!canManage || !isStripeConfigured()}>
                Manage subscription
              </Button>
            </form>
          )}
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          ${plans[plan].priceMonthly}/month · {plans[plan].highlights.join(" · ")}
        </CardContent>
      </Card>

      <PricingTable mode={{ kind: "billing", currentPlan: plan, canManage, stripeReady }} />
    </div>
  );
}

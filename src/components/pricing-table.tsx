import Link from "next/link";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { PLAN_ORDER, planRank, plans, type PlanId } from "@/config/plans";
import { cn } from "@/lib/utils";

type Mode =
  | { kind: "marketing" }
  | { kind: "billing"; currentPlan: PlanId; canManage: boolean; stripeReady: boolean };

/**
 * Renders every plan from src/config/plans.ts.
 * Marketing mode links to sign-up; billing mode posts to Stripe Checkout.
 */
export function PricingTable({ mode = { kind: "marketing" } }: { mode?: Mode }) {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {PLAN_ORDER.map((id) => {
        const plan = plans[id];
        const isCurrent = mode.kind === "billing" && mode.currentPlan === id;
        return (
          <Card
            key={id}
            data-plan={id}
            className={cn("relative flex flex-col", plan.popular && "border-primary shadow-md ring-1 ring-primary/30")}
          >
            {plan.popular && <Badge className="absolute -top-2.5 left-6">Most popular</Badge>}
            <CardHeader>
              <CardTitle className="text-lg">{plan.name}</CardTitle>
              <CardDescription>{plan.description}</CardDescription>
              <p className="pt-2">
                <span className="text-4xl font-bold tracking-tight">${plan.priceMonthly}</span>
                <span className="text-sm text-muted-foreground">/month</span>
              </p>
            </CardHeader>
            <CardContent className="flex-1">
              <ul className="space-y-2 text-sm">
                {plan.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <PlanAction planId={id} mode={mode} isCurrent={isCurrent} />
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}

function PlanAction({ planId, mode, isCurrent }: { planId: PlanId; mode: Mode; isCurrent: boolean }) {
  if (mode.kind === "marketing") {
    return (
      <Button asChild className="w-full" variant={plans[planId].popular ? "default" : "outline"}>
        <Link href={planId === "free" ? "/sign-up" : `/sign-up?plan=${planId}`}>
          {planId === "free" ? "Start for free" : `Start with ${plans[planId].name}`}
        </Link>
      </Button>
    );
  }

  if (isCurrent) {
    return (
      <Button className="w-full" variant="secondary" disabled>
        Current plan
      </Button>
    );
  }
  if (planId === "free") {
    return (
      <form action="/api/billing/portal" method="post" className="w-full">
        <Button className="w-full" variant="outline" disabled={!mode.canManage || !mode.stripeReady}>
          Downgrade via portal
        </Button>
      </form>
    );
  }
  const upgrade = planRank(planId) > planRank(mode.currentPlan);
  return (
    <form action="/api/billing/checkout" method="post" className="w-full">
      <input type="hidden" name="plan" value={planId} />
      <Button className="w-full" disabled={!mode.canManage || !mode.stripeReady}>
        {upgrade ? `Upgrade to ${plans[planId].name}` : `Switch to ${plans[planId].name}`}
      </Button>
    </form>
  );
}

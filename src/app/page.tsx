import Link from "next/link";
import { Building2, CreditCard, Gauge, KeyRound, ShieldCheck, Webhook } from "lucide-react";
import { PricingTable } from "@/components/pricing-table";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";

const features = [
  { icon: KeyRound, title: "Authentication", body: "Email & password plus optional Google OAuth, powered by Better Auth with database sessions." },
  { icon: Building2, title: "Organisations", body: "Multi-tenant workspaces with owner, admin and member roles, invitations and an org switcher." },
  { icon: CreditCard, title: "Stripe billing", body: "Per-organisation subscriptions with Stripe Checkout and the Customer Portal." },
  { icon: Webhook, title: "Reliable webhooks", body: "Signature-verified, idempotent and order-safe webhook processing backed by Postgres." },
  { icon: Gauge, title: "Plan gating", body: "One plans config drives pricing, limits and server-side requirePlan() checks." },
  { icon: ShieldCheck, title: "Tested", body: "Vitest suite with Stripe-signed fixtures, role checks and gating logic. CI included." },
];

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="mx-auto max-w-6xl px-4 pt-20 pb-16 text-center">
          <p className="mx-auto mb-4 w-fit rounded-full border px-3 py-1 text-xs text-muted-foreground">
            Next.js 16 · Better Auth · Drizzle · PostgreSQL · Stripe
          </p>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
            The multi-tenant SaaS foundation, <span className="text-primary">billing included</span>.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Sign-up, organisations with roles, and Stripe subscriptions per organisation — wired together,
            tested, and ready to build your product on.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/sign-up">Create your workspace</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/pricing">See pricing</Link>
            </Button>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-6xl px-4 py-16">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-xl border p-6">
                <Icon className="size-5 text-primary" />
                <h2 className="mt-4 font-semibold">{title}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-6xl px-4 py-16">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold tracking-tight">Simple, per-organisation pricing</h2>
            <p className="mt-3 text-muted-foreground">Start free. Upgrade when your team grows.</p>
          </div>
          <PricingTable />
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

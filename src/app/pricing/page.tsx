import type { Metadata } from "next";
import { PricingTable } from "@/components/pricing-table";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = { title: "Pricing" };

const faqs = [
  { q: "Who is billed — me or my organisation?", a: "Each organisation has its own subscription. You can belong to several organisations on different plans." },
  { q: "Can I change plans later?", a: "Yes. Upgrades, downgrades, cancellation and card updates are handled in the Stripe Customer Portal." },
  { q: "What happens if a payment fails?", a: "Your organisation keeps its plan while Stripe retries the card. If retries fail the subscription is cancelled and the organisation returns to Free." },
];

export default function PricingPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-16">
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold tracking-tight">Pricing</h1>
          <p className="mt-3 text-muted-foreground">Per organisation, billed monthly. Cancel any time.</p>
        </div>
        <PricingTable />
        <div className="mx-auto mt-16 max-w-3xl space-y-6">
          {faqs.map((f) => (
            <div key={f.q}>
              <h2 className="font-semibold">{f.q}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{f.a}</p>
            </div>
          ))}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

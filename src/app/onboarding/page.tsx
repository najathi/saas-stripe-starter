import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { Logo } from "@/components/logo";
import { CreateOrgForm } from "@/components/org/create-org-form";
import { SwitchOrgButton } from "@/components/org/switch-org-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isPlanId } from "@/config/plans";
import { db } from "@/db";
import { member, organization } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Set up your organisation" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const session = await requireSession();
  const { plan } = await searchParams;
  const orgs = await db
    .select({ id: organization.id, name: organization.name, role: member.role })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, session.user.id));

  const redirectTo = isPlanId(plan) && plan !== "free" ? `/dashboard/billing?plan=${plan}` : "/dashboard";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-muted/40 px-4 py-12">
      <Logo />
      <div className="w-full max-w-md space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Create an organisation</CardTitle>
            <CardDescription>
              Organisations own projects and subscriptions. You can invite teammates next.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CreateOrgForm redirectTo={redirectTo} />
          </CardContent>
        </Card>
        {orgs.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Or continue with an existing one</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {orgs.map((o) => (
                <div key={o.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span>
                    {o.name} <span className="text-muted-foreground">· {o.role}</span>
                  </span>
                  <SwitchOrgButton organizationId={o.id} />
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

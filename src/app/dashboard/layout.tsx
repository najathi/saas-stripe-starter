import { eq } from "drizzle-orm";
import { Logo } from "@/components/logo";
import { NavLinks } from "@/components/dashboard/nav-links";
import { OrgSwitcher } from "@/components/dashboard/org-switcher";
import { SignOutButton } from "@/components/dashboard/sign-out-button";
import { Badge } from "@/components/ui/badge";
import { plans } from "@/config/plans";
import { db } from "@/db";
import { member, organization } from "@/db/schema";
import { requireActiveOrg } from "@/lib/auth/session";
import { getOrganizationPlan } from "@/lib/billing/plan";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, organization: org, role } = await requireActiveOrg();
  const [orgs, { plan }] = await Promise.all([
    db
      .select({ id: organization.id, name: organization.name })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .where(eq(member.userId, user.id)),
    getOrganizationPlan(db, org.id),
  ]);

  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <aside className="flex flex-col gap-6 border-b bg-muted/30 p-4 md:min-h-screen md:border-r md:border-b-0">
        <Logo href="/dashboard" />
        <div className="space-y-2">
          <OrgSwitcher organizations={orgs} activeId={org.id} />
          <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
            <Badge variant={plan === "free" ? "secondary" : "default"}>{plans[plan].name}</Badge>
            <span className="capitalize">{role.replaceAll(",", ", ")}</span>
          </div>
        </div>
        <NavLinks />
        <div className="mt-auto space-y-2 border-t pt-4">
          <p className="truncate px-3 text-xs text-muted-foreground" title={user.email}>
            {user.email}
          </p>
          <SignOutButton />
        </div>
      </aside>
      <main className="mx-auto w-full max-w-5xl p-6 md:p-10">{children}</main>
    </div>
  );
}

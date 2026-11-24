import type { Metadata } from "next";
import Link from "next/link";
import { Download, Lock, Trash2 } from "lucide-react";
import { deleteProjectAction } from "./actions";
import { CreateProjectForm } from "@/components/dashboard/create-project-form";
import { UsageMeter } from "@/components/dashboard/usage-meter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { canAdd, hasFeature, plans } from "@/config/plans";
import { db } from "@/db";
import { roleHasPermission } from "@/lib/auth/permissions";
import { requireActiveOrg } from "@/lib/auth/session";
import { getUsageSummary } from "@/lib/billing/plan";
import { listProjects } from "@/lib/projects";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { organization, role } = await requireActiveOrg();
  const [summary, projects] = await Promise.all([
    getUsageSummary(db, organization.id),
    listProjects(db, organization.id),
  ]);
  const { plan, usage } = summary;
  const atLimit = !canAdd(plan, "projects", usage.projects.used);
  const canExport = hasFeature(plan, "csv-export");
  const canDelete = roleHasPermission(role, { project: ["delete"] });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{organization.name}</h1>
        <p className="text-sm text-muted-foreground">
          You are on the <strong>{plans[plan].name}</strong> plan.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Usage</CardTitle>
            <CardDescription>Limits come from src/config/plans.ts and are enforced on the server.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <UsageMeter label="Projects" used={usage.projects.used} limit={usage.projects.limit} />
            <UsageMeter label="Members" used={usage.members.used} limit={usage.members.limit} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Plan</CardTitle>
            <CardDescription>{plans[plan].description}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant={plan === "free" ? "default" : "outline"} className="w-full">
              <Link href="/dashboard/billing">{plan === "free" ? "Upgrade" : "Manage billing"}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle>Projects</CardTitle>
            <CardDescription>A sample plan-gated resource: Free organisations can create up to 3.</CardDescription>
          </div>
          {canExport ? (
            <Button asChild variant="outline" size="sm">
              <a href="/api/projects/export">
                <Download /> Export CSV
              </a>
            </Button>
          ) : (
            <Button asChild variant="outline" size="sm" title="CSV export is available on Pro and Team">
              <Link href="/dashboard/billing">
                <Lock /> Export CSV <Badge variant="secondary">Pro</Badge>
              </Link>
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <CreateProjectForm disabled={atLimit} />
          {atLimit && (
            <p className="text-sm text-muted-foreground">
              Project limit reached.{" "}
              <Link href="/dashboard/billing" className="font-medium text-foreground underline underline-offset-4">
                Upgrade to add more
              </Link>
              .
            </p>
          )}
          {projects.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No projects yet. Create your first one above.
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {projects.map((p) => (
                <li key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">Created {formatDate(p.createdAt)}</p>
                  </div>
                  {canDelete && (
                    <form action={deleteProjectAction}>
                      <input type="hidden" name="projectId" value={p.id} />
                      <Button variant="ghost" size="icon" aria-label={`Delete ${p.name}`}>
                        <Trash2 />
                      </Button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

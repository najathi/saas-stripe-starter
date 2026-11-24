import type { Metadata } from "next";
import { and, asc, eq } from "drizzle-orm";
import { InvitationRowActions } from "@/components/org/invitation-row-actions";
import { InviteForm } from "@/components/org/invite-form";
import { MemberActions } from "@/components/org/member-actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { canAdd, getLimit } from "@/config/plans";
import { db } from "@/db";
import { invitation, member, user } from "@/db/schema";
import { env } from "@/env";
import { roleHasPermission } from "@/lib/auth/permissions";
import { requireActiveOrg } from "@/lib/auth/session";
import { getOrganizationPlan } from "@/lib/billing/plan";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Organisation settings" };

export default async function SettingsPage() {
  const { organization, role, user: me } = await requireActiveOrg();
  const [members, invites, { plan }] = await Promise.all([
    db
      .select({ id: member.id, role: member.role, userId: user.id, name: user.name, email: user.email, joinedAt: member.createdAt })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(eq(member.organizationId, organization.id))
      .orderBy(asc(member.createdAt)),
    db
      .select()
      .from(invitation)
      .where(and(eq(invitation.organizationId, organization.id), eq(invitation.status, "pending")))
      .orderBy(asc(invitation.createdAt)),
    getOrganizationPlan(db, organization.id),
  ]);

  const canInvite = roleHasPermission(role, { invitation: ["create"] });
  const canCancel = roleHasPermission(role, { invitation: ["cancel"] });
  const canUpdate = roleHasPermission(role, { member: ["update"] });
  const canRemove = roleHasPermission(role, { member: ["delete"] });
  const seatLimit = getLimit(plan, "members");
  // Pending invitations reserve a seat too.
  const seatsFull = !canAdd(plan, "members", members.length + invites.length);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Organisation</h1>
        <p className="text-sm text-muted-foreground">Manage members, roles and invitations for {organization.name}.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            {members.length} of {seatLimit ?? "unlimited"} seats used
            {invites.length > 0 && ` (${invites.length} reserved by pending invitations)`}. Owners manage billing; admins
            manage members.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y rounded-md border">
            {members.map((m) => (
              <li key={m.id} className="flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">
                    {m.name} {m.userId === me.id && <Badge variant="outline">You</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {m.email} · joined {formatDate(m.joinedAt)}
                  </p>
                </div>
                <MemberActions
                  organizationId={organization.id}
                  memberId={m.id}
                  role={m.role}
                  canUpdate={canUpdate && m.userId !== me.id}
                  canRemove={canRemove && m.userId !== me.id}
                />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invite a teammate</CardTitle>
          <CardDescription>
            Invitations expire after 7 days. No email provider is wired up in the demo — copy the link instead.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canInvite ? (
            <Alert>Only owners and admins can invite members.</Alert>
          ) : seatsFull ? (
            <Alert variant="warning">Your plan&apos;s seat limit is reached. Upgrade to invite more teammates.</Alert>
          ) : (
            <InviteForm organizationId={organization.id} canInviteAdmins={roleHasPermission(role, { member: ["update"] })} />
          )}

          {invites.length > 0 && (
            <ul className="divide-y rounded-md border">
              {invites.map((i) => (
                <li key={i.id} className="flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">{i.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {i.role ?? "member"} · expires {formatDate(i.expiresAt)}
                    </p>
                  </div>
                  <InvitationRowActions
                    invitationId={i.id}
                    url={`${env.appUrl}/accept-invitation/${i.id}`}
                    canCancel={canCancel}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { InvitationActions } from "@/components/org/invitation-actions";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db";
import { invitation, organization } from "@/db/schema";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Accept invitation" };

export default async function AcceptInvitationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/sign-in?redirect=${encodeURIComponent(`/accept-invitation/${id}`)}`);

  const [invite] = await db
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      organizationName: organization.name,
    })
    .from(invitation)
    .innerJoin(organization, eq(invitation.organizationId, organization.id))
    .where(eq(invitation.id, id))
    .limit(1);

  const problem = !invite
    ? "This invitation does not exist."
    : invite.status !== "pending"
      ? `This invitation has already been ${invite.status}.`
      : invite.expiresAt < new Date()
        ? "This invitation has expired. Ask for a new one."
        : invite.email.toLowerCase() !== session.user.email.toLowerCase()
          ? `This invitation was sent to ${invite.email}. Sign in with that email to accept it.`
          : null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-muted/40 px-4">
      <Logo />
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">
            {invite ? `Join ${invite.organizationName}` : "Invitation"}
          </CardTitle>
          {invite && (
            <CardDescription>
              You have been invited as <strong>{invite.role ?? "member"}</strong>.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {problem ? <Alert variant="destructive">{problem}</Alert> : <InvitationActions invitationId={id} />}
        </CardContent>
      </Card>
    </div>
  );
}

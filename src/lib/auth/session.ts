import "server-only";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { organization } from "@/db/schema";
import { auth } from "./index";
import { getMemberRole } from "./membership";

export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session;
}

/**
 * Resolves the signed-in user's active organisation and their role in it.
 * Redirects to onboarding when the user has no (valid) active organisation.
 */
export const requireActiveOrg = cache(async () => {
  const session = await requireSession();
  const organizationId = session.session.activeOrganizationId;
  if (!organizationId) redirect("/onboarding");

  const role = await getMemberRole(db, organizationId, session.user.id);
  if (!role) redirect("/onboarding");

  const [org] = await db.select().from(organization).where(eq(organization.id, organizationId)).limit(1);
  if (!org) redirect("/onboarding");

  return { session, user: session.user, organization: org, role };
});

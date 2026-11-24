import "server-only";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/** Session + active organisation for API routes (no redirects). */
export async function getApiContext() {
  const session = await auth.api.getSession({ headers: await headers() });
  const organizationId = session?.session.activeOrganizationId ?? null;
  if (!session || !organizationId) return null;
  return { session, user: session.user, organizationId };
}

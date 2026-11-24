import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { member } from "@/db/schema";
import { roleHasPermission, type Permissions } from "./permissions";

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "You do not have permission to do that.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Returns the member's role string in the organisation, or `null` if not a member. */
export async function getMemberRole(db: Database, organizationId: string, userId: string) {
  const rows = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
    .limit(1);
  return rows[0]?.role ?? null;
}

/**
 * Server-side role check. Always look the role up from the database —
 * never trust a role sent by the client.
 */
export async function requireOrgPermission(
  db: Database,
  input: { organizationId: string; userId: string },
  permissions: Permissions,
): Promise<string> {
  const role = await getMemberRole(db, input.organizationId, input.userId);
  if (!role) throw new ForbiddenError("You are not a member of this organisation.");
  if (!roleHasPermission(role, permissions)) throw new ForbiddenError();
  return role;
}

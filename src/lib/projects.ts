import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { organization, project } from "@/db/schema";
import { requireOrgPermission } from "@/lib/auth/membership";
import { assertWithinLimit } from "@/lib/billing/plan";

export const projectNameSchema = z
  .string()
  .trim()
  .min(2, "Project name must be at least 2 characters.")
  .max(60, "Project name must be at most 60 characters.");

export async function listProjects(db: Database, organizationId: string) {
  return db
    .select()
    .from(project)
    .where(eq(project.organizationId, organizationId))
    .orderBy(desc(project.createdAt));
}

/**
 * Creates a project: role check -> plan limit check -> insert.
 * The organisation row is locked for the duration of the transaction so two
 * concurrent requests cannot both squeeze under the plan limit.
 */
export async function createProject(
  db: Database,
  input: { organizationId: string; userId: string; name: string },
) {
  const name = projectNameSchema.parse(input.name);
  await requireOrgPermission(db, input, { project: ["create"] });

  return db.transaction(async (tx) => {
    await tx.select({ id: organization.id }).from(organization).where(eq(organization.id, input.organizationId)).for("update");
    await assertWithinLimit(tx as unknown as Database, input.organizationId, "projects");
    const [created] = await tx
      .insert(project)
      .values({
        id: crypto.randomUUID(),
        organizationId: input.organizationId,
        name,
        createdById: input.userId,
      })
      .returning();
    return created!;
  });
}

export async function deleteProject(
  db: Database,
  input: { organizationId: string; userId: string; projectId: string },
) {
  await requireOrgPermission(db, input, { project: ["delete"] });
  await db
    .delete(project)
    .where(and(eq(project.id, input.projectId), eq(project.organizationId, input.organizationId)));
}

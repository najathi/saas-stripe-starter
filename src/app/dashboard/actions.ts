"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { db } from "@/db";
import { ForbiddenError } from "@/lib/auth/membership";
import { requireActiveOrg } from "@/lib/auth/session";
import { PlanLimitError } from "@/lib/billing/plan";
import { createProject, deleteProject } from "@/lib/projects";

export type ActionState = { error?: string; upgrade?: boolean; ok?: boolean };

export async function createProjectAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, organization } = await requireActiveOrg();
  try {
    await createProject(db, {
      organizationId: organization.id,
      userId: user.id,
      name: String(formData.get("name") ?? ""),
    });
  } catch (error) {
    if (error instanceof PlanLimitError) return { error: error.message, upgrade: true };
    if (error instanceof ForbiddenError) return { error: error.message };
    if (error instanceof ZodError) return { error: error.issues[0]?.message ?? "Invalid name." };
    throw error;
  }
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteProjectAction(formData: FormData) {
  const { user, organization } = await requireActiveOrg();
  await deleteProject(db, {
    organizationId: organization.id,
    userId: user.id,
    projectId: String(formData.get("projectId")),
  });
  revalidatePath("/dashboard");
}

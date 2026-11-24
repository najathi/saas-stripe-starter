import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DatabaseHandle } from "@/db/client";
import { ForbiddenError } from "@/lib/auth/membership";
import {
  PlanLimitError,
  PlanRequiredError,
  assertWithinLimit,
  getInvitationAllowance,
  getUsageSummary,
  requireFeature,
  requirePlan,
} from "@/lib/billing/plan";
import { createProject, deleteProject, listProjects } from "@/lib/projects";
import { addMember, createOrgWithOwner, createUser, createTestDb, setSubscription } from "./helpers/db";

let h: DatabaseHandle;
beforeAll(async () => {
  h = await createTestDb();
});
afterAll(async () => {
  await h.close();
});

describe("requirePlan()", () => {
  it("rejects a Free organisation for a Pro feature", async () => {
    const { org } = await createOrgWithOwner(h);
    await expect(requirePlan(h.db, org.id, "pro")).rejects.toBeInstanceOf(PlanRequiredError);
    await expect(requirePlan(h.db, org.id, "pro")).rejects.toMatchObject({
      status: 402,
      requiredPlan: "pro",
      currentPlan: "free",
    });
  });

  it("allows Pro and higher", async () => {
    const { org: pro } = await createOrgWithOwner(h);
    await setSubscription(h, pro.id, { plan: "pro", status: "active" });
    await expect(requirePlan(h.db, pro.id, "pro")).resolves.toMatchObject({ plan: "pro" });

    const { org: team } = await createOrgWithOwner(h);
    await setSubscription(h, team.id, { plan: "team", status: "active" });
    await expect(requirePlan(h.db, team.id, "pro")).resolves.toMatchObject({ plan: "team" });
    await expect(requirePlan(h.db, pro.id, "team")).rejects.toBeInstanceOf(PlanRequiredError);
  });

  it("keeps access during past_due grace, drops it once canceled", async () => {
    const { org: pastDue } = await createOrgWithOwner(h);
    await setSubscription(h, pastDue.id, { plan: "pro", status: "past_due" });
    await expect(requirePlan(h.db, pastDue.id, "pro")).resolves.toBeTruthy();

    const { org: canceled } = await createOrgWithOwner(h);
    await setSubscription(h, canceled.id, { plan: "pro", status: "canceled" });
    await expect(requirePlan(h.db, canceled.id, "pro")).rejects.toBeInstanceOf(PlanRequiredError);
  });

  it("gates features by plan (CSV export is Pro+)", async () => {
    const { org } = await createOrgWithOwner(h);
    await expect(requireFeature(h.db, org.id, "csv-export")).rejects.toMatchObject({ requiredPlan: "pro" });
    await setSubscription(h, org.id, { plan: "pro", status: "active" });
    await expect(requireFeature(h.db, org.id, "csv-export")).resolves.toMatchObject({ plan: "pro" });
  });
});

describe("Projects limit (example gated resource)", () => {
  it("lets a Free organisation create exactly 3 projects", async () => {
    const { org, owner } = await createOrgWithOwner(h);
    for (const name of ["One", "Two", "Three"]) {
      await createProject(h.db, { organizationId: org.id, userId: owner.id, name });
    }
    const fourth = createProject(h.db, { organizationId: org.id, userId: owner.id, name: "Four" });
    await expect(fourth).rejects.toBeInstanceOf(PlanLimitError);
    await expect(fourth).rejects.toMatchObject({ resource: "projects", limit: 3 });
    expect(await listProjects(h.db, org.id)).toHaveLength(3);
  });

  it("lifts the limit after upgrading to Pro", async () => {
    const { org, owner } = await createOrgWithOwner(h);
    for (const name of ["Alpha", "Bravo", "Charlie"]) await createProject(h.db, { organizationId: org.id, userId: owner.id, name });
    await setSubscription(h, org.id, { plan: "pro", status: "active" });
    await expect(createProject(h.db, { organizationId: org.id, userId: owner.id, name: "Delta" })).resolves.toMatchObject({
      name: "Delta",
    });
  });

  it("does not let concurrent requests exceed the limit", async () => {
    const { org, owner } = await createOrgWithOwner(h);
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) => createProject(h.db, { organizationId: org.id, userId: owner.id, name: `P${i}` })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(await listProjects(h.db, org.id)).toHaveLength(3);
  });

  it("scopes limits per organisation", async () => {
    const a = await createOrgWithOwner(h);
    const b = await createOrgWithOwner(h);
    for (const name of ["One", "Two", "Three"]) await createProject(h.db, { organizationId: a.org.id, userId: a.owner.id, name });
    await expect(assertWithinLimit(h.db, b.org.id, "projects")).resolves.toMatchObject({ used: 0 });
  });

  it("rejects non-members and invalid names", async () => {
    const { org } = await createOrgWithOwner(h);
    const outsider = await createUser(h);
    await expect(createProject(h.db, { organizationId: org.id, userId: outsider.id, name: "Nope" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    const { org: org2, owner } = await createOrgWithOwner(h);
    await expect(createProject(h.db, { organizationId: org2.id, userId: owner.id, name: " " })).rejects.toThrow();
  });

  it("only lets owners/admins delete projects", async () => {
    const { org, owner } = await createOrgWithOwner(h);
    const plain = await createUser(h);
    await addMember(h, org.id, plain.id, "member");
    const p = await createProject(h.db, { organizationId: org.id, userId: plain.id, name: "Shared" });

    await expect(deleteProject(h.db, { organizationId: org.id, userId: plain.id, projectId: p.id })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await deleteProject(h.db, { organizationId: org.id, userId: owner.id, projectId: p.id });
    expect(await listProjects(h.db, org.id)).toHaveLength(0);
  });

  it("reports usage for the dashboard", async () => {
    const { org, owner } = await createOrgWithOwner(h);
    await createProject(h.db, { organizationId: org.id, userId: owner.id, name: "Only" });
    const summary = await getUsageSummary(h.db, org.id);
    expect(summary.plan).toBe("free");
    expect(summary.usage.projects).toEqual({ used: 1, limit: 3 });
    expect(summary.usage.members).toEqual({ used: 1, limit: 2 });
  });
});

describe("seat limits for invitations", () => {
  it("allows invitations only for the seats left on the plan", async () => {
    const { org } = await createOrgWithOwner(h);
    // Free: 2 members, owner occupies one.
    expect(await getInvitationAllowance(h.db, org.id)).toBe(1);
    const second = await createUser(h);
    await addMember(h, org.id, second.id, "member");
    expect(await getInvitationAllowance(h.db, org.id)).toBe(0);

    await setSubscription(h, org.id, { plan: "pro", status: "active" });
    expect(await getInvitationAllowance(h.db, org.id)).toBe(3); // Pro: 5 seats - 2 members
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DatabaseHandle } from "@/db/client";
import { ForbiddenError, getMemberRole, requireOrgPermission } from "@/lib/auth/membership";
import { roleHasPermission, type Permissions } from "@/lib/auth/permissions";
import { addMember, createOrgWithOwner, createUser, createTestDb } from "./helpers/db";

describe("role permission matrix", () => {
  const cases: Array<[string, Permissions, boolean]> = [
    ["owner", { billing: ["manage"] }, true],
    ["admin", { billing: ["manage"] }, false],
    ["member", { billing: ["manage"] }, false],
    ["member", { billing: ["read"] }, true],

    ["owner", { project: ["delete"] }, true],
    ["admin", { project: ["delete"] }, true],
    ["member", { project: ["create"] }, true],
    ["member", { project: ["delete"] }, false],

    ["owner", { invitation: ["create"] }, true],
    ["admin", { invitation: ["create"] }, true],
    ["member", { invitation: ["create"] }, false],

    ["admin", { member: ["update", "delete"] }, true],
    ["member", { member: ["delete"] }, false],

    ["owner", { organization: ["delete"] }, true],
    ["admin", { organization: ["delete"] }, false],
    ["admin", { organization: ["update"] }, true],
  ];

  it.each(cases)("%s %j -> %s", (role, permissions, expected) => {
    expect(roleHasPermission(role, permissions)).toBe(expected);
  });

  it("requires every requested action", () => {
    expect(roleHasPermission("member", { project: ["create", "delete"] })).toBe(false);
    expect(roleHasPermission("admin", { project: ["create", "delete"] })).toBe(true);
  });

  it("supports Better Auth's comma-separated multi-role strings", () => {
    expect(roleHasPermission("member,admin", { project: ["delete"] })).toBe(true);
    expect(roleHasPermission("member, owner", { billing: ["manage"] })).toBe(true);
  });

  it("denies unknown, empty or missing roles", () => {
    expect(roleHasPermission("superuser", { project: ["create"] })).toBe(false);
    expect(roleHasPermission("", { project: ["create"] })).toBe(false);
    expect(roleHasPermission(null, { project: ["create"] })).toBe(false);
  });
});

describe("requireOrgPermission() (database-backed)", () => {
  let h: DatabaseHandle;
  beforeAll(async () => {
    h = await createTestDb();
  });
  afterAll(async () => {
    await h.close();
  });

  it("looks up the role from the database", async () => {
    const { org, owner } = await createOrgWithOwner(h);
    expect(await getMemberRole(h.db, org.id, owner.id)).toBe("owner");
    await expect(
      requireOrgPermission(h.db, { organizationId: org.id, userId: owner.id }, { billing: ["manage"] }),
    ).resolves.toBe("owner");
  });

  it("forbids members from managing billing", async () => {
    const { org } = await createOrgWithOwner(h);
    const m = await createUser(h);
    await addMember(h, org.id, m.id, "member");
    await expect(
      requireOrgPermission(h.db, { organizationId: org.id, userId: m.id }, { billing: ["manage"] }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("forbids users from other organisations (tenant isolation)", async () => {
    const a = await createOrgWithOwner(h);
    const b = await createOrgWithOwner(h);
    expect(await getMemberRole(h.db, a.org.id, b.owner.id)).toBeNull();
    await expect(
      requireOrgPermission(h.db, { organizationId: a.org.id, userId: b.owner.id }, { project: ["create"] }),
    ).rejects.toThrow(/not a member/);
  });
});

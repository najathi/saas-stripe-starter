import { createAccessControl } from "better-auth/plugins/access";
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

/**
 * Organisation access control, shared by the Better Auth server plugin,
 * the client plugin and our own server-side checks.
 *
 * Built-in statements (organization, member, invitation, team, ac) keep
 * Better Auth's defaults; `project` and `billing` are app-specific.
 */
export const statement = {
  ...defaultStatements,
  project: ["create", "delete"],
  billing: ["read", "manage"],
} as const;

export const ac = createAccessControl(statement);

export const member = ac.newRole({
  ...memberAc.statements,
  project: ["create"],
  billing: ["read"],
});

export const admin = ac.newRole({
  ...adminAc.statements,
  project: ["create", "delete"],
  billing: ["read"],
});

export const owner = ac.newRole({
  ...ownerAc.statements,
  project: ["create", "delete"],
  billing: ["read", "manage"],
});

export const roles = { owner, admin, member } as const;
export type OrgRole = keyof typeof roles;
export const ORG_ROLES = Object.keys(roles) as OrgRole[];

export type Permissions = {
  [K in keyof typeof statement]?: Array<(typeof statement)[K][number]>;
};

export function isOrgRole(value: string): value is OrgRole {
  return value in roles;
}

/**
 * Better Auth stores multiple roles as a comma-separated string ("admin,member").
 * Access is granted when any of the member's roles grants every permission requested.
 */
export function roleHasPermission(roleString: string | null | undefined, permissions: Permissions): boolean {
  if (!roleString) return false;
  return roleString
    .split(",")
    .map((r) => r.trim())
    .filter(isOrgRole)
    .some((r) => roles[r].authorize(permissions as never).success);
}

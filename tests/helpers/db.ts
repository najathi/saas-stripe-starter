import postgres from "postgres";
import { createDatabase, type DatabaseHandle } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import * as s from "@/db/schema";

/**
 * Fresh database with the real migrations applied.
 *
 * - Default: in-memory PGlite (no setup needed).
 * - `TEST_DATABASE_URL=postgres://...`: a throwaway database is created on that
 *   server for each test file and dropped afterwards. CI runs both modes.
 */
export async function createTestDb(): Promise<DatabaseHandle> {
  const serverUrl = process.env.TEST_DATABASE_URL;
  if (!serverUrl) {
    const handle = createDatabase({ url: "", dataDir: "memory://" });
    await runMigrations(handle);
    return handle;
  }

  const name = `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const admin = postgres(serverUrl, { max: 1, onnotice: () => {} });
  await admin.unsafe(`create database "${name}"`);
  await admin.end();

  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  const handle = createDatabase({ url: url.toString() });
  await runMigrations(handle);

  return {
    ...handle,
    close: async () => {
      await handle.close();
      const cleanup = postgres(serverUrl, { max: 1, onnotice: () => {} });
      await cleanup.unsafe(`drop database if exists "${name}" with (force)`);
      await cleanup.end();
    },
  };
}

let seq = 0;
const nextId = (prefix: string) => `${prefix}_${++seq}_${Math.random().toString(36).slice(2, 8)}`;

export async function createUser(handle: DatabaseHandle, overrides: Partial<typeof s.user.$inferInsert> = {}) {
  const id = overrides.id ?? nextId("user");
  const [row] = await handle.db
    .insert(s.user)
    .values({ id, name: "Test User", email: `${id}@example.com`, ...overrides })
    .returning();
  return row!;
}

export async function createOrg(handle: DatabaseHandle, overrides: Partial<typeof s.organization.$inferInsert> = {}) {
  const id = overrides.id ?? nextId("org");
  const [row] = await handle.db
    .insert(s.organization)
    .values({ id, name: "Test Org", slug: id, ...overrides })
    .returning();
  return row!;
}

export async function addMember(handle: DatabaseHandle, organizationId: string, userId: string, role = "member") {
  const [row] = await handle.db
    .insert(s.member)
    .values({ id: nextId("mem"), organizationId, userId, role })
    .returning();
  return row!;
}

/** An organisation with an owner, ready for plan/role tests. */
export async function createOrgWithOwner(handle: DatabaseHandle) {
  const owner = await createUser(handle);
  const org = await createOrg(handle);
  await addMember(handle, org.id, owner.id, "owner");
  return { org, owner };
}

export async function setSubscription(
  handle: DatabaseHandle,
  organizationId: string,
  values: Partial<typeof s.subscription.$inferInsert>,
) {
  await handle.db.insert(s.subscription).values({ organizationId, plan: "free", status: "active", ...values });
}

import path from "node:path";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import type { DatabaseHandle } from "./client";

export const MIGRATIONS_FOLDER = path.resolve(process.cwd(), "drizzle");

/** Applies all pending SQL migrations in ./drizzle. Idempotent. */
export async function runMigrations(handle: DatabaseHandle, migrationsFolder = MIGRATIONS_FOLDER) {
  if (handle.driver === "pglite") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await migratePglite(handle.db as any, { migrationsFolder });
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await migratePostgres(handle.db as any, { migrationsFolder });
  }
}

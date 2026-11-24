import "server-only";
import { createDatabase, type Database, type DatabaseHandle } from "./client";

export type { Database } from "./client";
export * as schema from "./schema";

// One connection per server process, reused across hot reloads in dev.
const globalForDb = globalThis as unknown as { __dbHandle?: DatabaseHandle };

export function getDb(): Database {
  if (!globalForDb.__dbHandle) globalForDb.__dbHandle = createDatabase();
  return globalForDb.__dbHandle.db;
}

/**
 * Lazy proxy so importing this module never opens a connection
 * (keeps `next build` working without a database).
 */
export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(real) : value;
  },
});

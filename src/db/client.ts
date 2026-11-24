import { mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/** Driver-agnostic database type: works for both postgres-js and PGlite. */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DatabaseHandle {
  db: Database;
  driver: "postgres" | "pglite";
  close: () => Promise<void>;
}

export function isPostgresUrl(url: string | undefined): url is string {
  return !!url && /^postgres(ql)?:\/\//.test(url);
}

/**
 * Creates a database connection.
 *
 * - `DATABASE_URL=postgres://...` uses postgres-js (Neon, RDS, Docker...).
 * - Otherwise an embedded PGlite (Postgres compiled to WASM) is used, stored
 *   on disk at `PGLITE_DIR` (default `./.data/pglite`), or in memory when
 *   `dataDir` is `"memory://"` (tests).
 */
export function createDatabase(options: { url?: string; dataDir?: string } = {}): DatabaseHandle {
  const url = options.url ?? process.env.DATABASE_URL;

  if (isPostgresUrl(url)) {
    const client = postgres(url, {
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      prepare: false, // safe with PgBouncer / Neon pooled connections
    });
    const db = drizzlePostgres(client, { schema }) as unknown as Database;
    return { db, driver: "postgres", close: () => client.end() };
  }

  if (process.env.VERCEL && options.dataDir !== "memory://") {
    // Serverless filesystems are ephemeral: an embedded database would lose data.
    throw new Error("DATABASE_URL must be a postgres:// URL when deployed (e.g. Neon).");
  }

  const dataDir =
    options.dataDir ??
    // turbopackIgnore: runtime-only path, keeps Next from tracing the whole project.
    path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.PGLITE_DIR ?? ".data/pglite");
  if (dataDir !== "memory://") mkdirSync(dataDir, { recursive: true });
  const client = dataDir === "memory://" ? new PGlite() : new PGlite(dataDir);
  const db = drizzlePglite(client, { schema }) as unknown as Database;
  return { db, driver: "pglite", close: () => client.close() };
}

/**
 * Applies SQL migrations from ./drizzle to DATABASE_URL (or the local PGlite DB).
 *   npm run db:migrate
 */
import { createDatabase } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";

async function main() {
  const handle = createDatabase();
  console.log(`Running migrations (${handle.driver})…`);
  await runMigrations(handle);
  await handle.close();
  console.log("Migrations complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

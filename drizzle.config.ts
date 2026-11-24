import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL;
const usePostgres = !!url && /^postgres(ql)?:\/\//.test(url);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  ...(usePostgres
    ? { dbCredentials: { url: url! } }
    : { driver: "pglite", dbCredentials: { url: process.env.PGLITE_DIR ?? "./.data/pglite" } }),
});

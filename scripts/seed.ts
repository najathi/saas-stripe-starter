/**
 * Seeds demo data (idempotent):
 *   owner@example.com / password123  -> owner of "Acme Inc" (Free, 2 projects) and "Globex" (Pro)
 *   member@example.com / password123 -> member of "Acme Inc"
 * plus one pending invitation.
 *
 *   npm run db:seed
 *
 * With PGlite, stop `npm run dev` first (PGlite allows one process at a time).
 * The Globex subscription row is fake (no Stripe objects are created).
 */
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { createDatabase } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";
import * as s from "../src/db/schema";

const PASSWORD = "password123";

async function main() {
  const handle = createDatabase();
  await runMigrations(handle);
  const { db } = handle;

  const existing = await db.select().from(s.user).where(eq(s.user.email, "owner@example.com")).limit(1);
  if (existing.length > 0) {
    console.log("Seed data already present — skipping.");
    await handle.close();
    return;
  }

  const password = await hashPassword(PASSWORD);
  const now = new Date();

  const users = [
    { id: "user_owner", name: "Olivia Owner", email: "owner@example.com" },
    { id: "user_member", name: "Max Member", email: "member@example.com" },
  ];

  await db.transaction(async (tx) => {
    for (const u of users) {
      await tx.insert(s.user).values({ ...u, emailVerified: true });
      await tx.insert(s.account).values({
        id: `acc_${u.id}`,
        accountId: u.id,
        providerId: "credential",
        userId: u.id,
        password,
      });
    }

    await tx.insert(s.organization).values([
      { id: "org_acme", name: "Acme Inc", slug: "acme" },
      { id: "org_globex", name: "Globex", slug: "globex" },
    ]);
    await tx.insert(s.member).values([
      { id: "mem_1", organizationId: "org_acme", userId: "user_owner", role: "owner" },
      { id: "mem_2", organizationId: "org_acme", userId: "user_member", role: "member" },
      { id: "mem_3", organizationId: "org_globex", userId: "user_owner", role: "owner" },
    ]);
    await tx.insert(s.invitation).values({
      id: "inv_demo",
      organizationId: "org_acme",
      email: "new.hire@example.com",
      role: "member",
      status: "pending",
      inviterId: "user_owner",
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    });
    await tx.insert(s.project).values([
      { id: crypto.randomUUID(), organizationId: "org_acme", name: "Marketing site", createdById: "user_owner" },
      { id: crypto.randomUUID(), organizationId: "org_acme", name: "Mobile app", createdById: "user_member" },
      { id: crypto.randomUUID(), organizationId: "org_globex", name: "Data platform", createdById: "user_owner" },
    ]);
    // Simulates what the webhook writes after a successful Pro checkout.
    await tx.insert(s.subscription).values({
      organizationId: "org_globex",
      stripeCustomerId: "cus_seed_globex",
      stripeSubscriptionId: "sub_seed_globex",
      plan: "pro",
      status: "active",
      currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    });
  });

  await handle.close();
  console.log(`Seeded. Sign in as owner@example.com or member@example.com (password: ${PASSWORD}).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

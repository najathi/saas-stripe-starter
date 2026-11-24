import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { env } from "@/env";
import { getLimit } from "@/config/plans";
import { getInvitationAllowance, getOrganizationPlan } from "@/lib/billing/plan";
import { ac, roles } from "./permissions";

export const auth = betterAuth({
  appName: "SaaS Stripe Starter",
  baseURL: env.read("BETTER_AUTH_URL") ?? env.appUrl,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
  },
  socialProviders: env.googleEnabled
    ? {
        google: {
          clientId: env.googleClientId!,
          clientSecret: env.googleClientSecret!,
        },
      }
    : {},
  databaseHooks: {
    session: {
      create: {
        // Land users in their first organisation after signing in.
        before: async (newSession) => {
          const [first] = await db
            .select({ organizationId: schema.member.organizationId })
            .from(schema.member)
            .where(eq(schema.member.userId, newSession.userId))
            .orderBy(asc(schema.member.createdAt))
            .limit(1);
          return { data: { ...newSession, activeOrganizationId: first?.organizationId ?? null } };
        },
      },
    },
  },
  plugins: [
    organization({
      ac,
      roles,
      creatorRole: "owner",
      invitationExpiresIn: 60 * 60 * 24 * 7, // 7 days
      cancelPendingInvitationsOnReInvite: true,
      // Seat limit comes from the organisation's plan (src/config/plans.ts).
      membershipLimit: async (_user, org) => {
        const { plan } = await getOrganizationPlan(db, org.id);
        return getLimit(plan, "members") ?? Number.MAX_SAFE_INTEGER;
      },
      // Pending invitations may not exceed the seats left on the plan.
      invitationLimit: async ({ organization: org }) => getInvitationAllowance(db, org.id),
      async sendInvitationEmail({ id, email, organization: org, inviter }) {
        // Plug in Resend/Postmark/SES here. For the demo the link is logged
        // and also shown (copyable) on the organisation settings page.
        const url = `${env.appUrl}/accept-invitation/${id}`;
        console.info(`[invite] ${inviter.user.email} invited ${email} to "${org.name}": ${url}`);
      },
    }),
    nextCookies(), // must be last: lets server actions set auth cookies
  ],
});

export type Session = typeof auth.$Infer.Session;

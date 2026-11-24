# SaaS Stripe Starter

A production-shaped, multi-tenant SaaS foundation: **sign-up, organisations with roles, and Stripe subscription billing per organisation**.
Built with Next.js 16, Better Auth, Drizzle ORM, PostgreSQL and Stripe. It is tested, CI-checked, and small enough to read in an afternoon.

![CI](https://github.com/najathi/saas-stripe-starter/actions/workflows/ci.yml/badge.svg)
![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)

---

## How it fits together

```mermaid
flowchart LR
    U([User]) -->|sign up / sign in| APP[Next.js 16 app<br/>App Router + Server Actions]
    APP <-->|sessions, orgs, roles, invites| BA[Better Auth<br/>+ organization plugin]
    APP -->|POST /api/billing/checkout| SC[Stripe Checkout]
    U -->|pays with card| SC
    SC -->|redirect ?checkout=success| APP
    APP -->|POST /api/billing/portal| CP[Stripe Customer Portal]
    SC -. events .-> WH[/api/stripe/webhook<br/>verify signature → dedupe → apply/]
    CP -. events .-> WH
    WH -->|subscription + processed event IDs| DB[(PostgreSQL<br/>Drizzle ORM)]
    BA --> DB
    APP -->|requirePlan / assertWithinLimit| DB
```

The browser never tells the server what plan it is on. Plans change **only** when a signed Stripe webhook arrives, and every gate is checked on the server against the database.

## Features

- **Authentication** with [Better Auth](https://better-auth.com): email and password, plus optional Google OAuth (turned on by env vars). Sessions are stored in the database.
- **Organisations (multi-tenancy)**: create organisations, switch between them, invite members and accept invitations, and give members the roles **owner / admin / member**. Access control uses Better Auth's `createAccessControl`, extended with app-specific `project` and `billing` permissions.
- **Billing per organisation**:
  - Stripe Checkout (subscription mode) and the Customer Portal.
  - A webhook handler for `checkout.session.completed`, `customer.subscription.created/updated/deleted` and `invoice.payment_failed`.
  - **Signature verification**, **idempotency** (processed event IDs stored in the same transaction as the side effects) and **out-of-order protection**.
- **One plans config** ([`src/config/plans.ts`](src/config/plans.ts)): it drives the pricing table, Checkout, seat limits and feature gates.
- **Plan gating**:
  - `requirePlan()`, `requireFeature()` and `assertWithinLimit()` server helpers.
  - Example gated features: "Projects" (3 on Free, enforced under a row lock so concurrent requests can't overshoot) and Pro-only CSV export.
  - The dashboard shows usage meters.
- **Pages**: landing page with pricing, `/pricing`, sign-in and sign-up, onboarding, dashboard, organisation settings (members, roles, invitations), billing, and invitation acceptance.
- **Database**:
  - Drizzle schema with SQL migrations and an idempotent seed script.
  - **PostgreSQL** in production (Neon, RDS, Docker).
  - Zero-setup **PGlite** (Postgres compiled to WASM) for local development and tests.
- **Quality**:
  - 72 Vitest tests, run against both PGlite and real PostgreSQL 17. They use Stripe-signed webhook fixtures.
  - GitHub Actions runs lint, typecheck, tests, migration drift check and build.
- **UI**: Tailwind CSS v4 with shadcn/ui-style components (Button, Card, Badge and others). Dark mode follows the OS.

## Tech stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack, Server Actions, `proxy.ts`) |
| Auth & orgs | Better Auth 1.7 + organization plugin |
| Database | PostgreSQL via Drizzle ORM 0.45 (`postgres` driver) · PGlite locally |
| Payments | Stripe Node SDK 23 (API `2026-11-18`) |
| UI | Tailwind CSS 4, Radix Slot, CVA, lucide-react |
| Tests | Vitest 4 |

## Quick start

Requirements: Node.js 20.9+ (22 LTS recommended). Docker is optional.

```bash
git clone https://github.com/najathi/saas-stripe-starter.git
cd saas-stripe-starter
npm install
cp .env.example .env.local
```

Set a secret in `.env.local`:

```bash
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
```

Then seed and run:

```bash
npm run db:seed   # demo users, orgs and projects (also runs migrations)
npm run dev       # runs migrations, then starts http://localhost:3000
```

Sign in as `owner@example.com` / `password123`. The owner belongs to **Acme Inc** (Free) and **Globex** (Pro). `member@example.com` is a plain member of Acme.

> **Database choice.** With `DATABASE_URL` empty, the app uses an embedded PGlite database in `./.data/pglite`. PGlite allows one process at a time, so stop `npm run dev` before running `npm run db:seed`.
>
> To use real Postgres instead, run `docker compose up -d` and set:
>
> ```bash
> DATABASE_URL=postgres://postgres:postgres@localhost:5432/saas_starter
> ```

### Stripe (test mode)

Everything below uses **test mode** keys. No real money moves.

1. **API key.** Copy your test secret key (`sk_test_...`) from the Stripe Dashboard into `STRIPE_SECRET_KEY`.
2. **Products and prices.** Create a product for each paid plan, each with a monthly recurring price. Use the Dashboard or the [Stripe CLI](https://docs.stripe.com/stripe-cli):

   ```bash
   stripe products create --name "Pro"
   stripe prices create --product prod_XXX --unit-amount 1900 --currency usd -d "recurring[interval]=month"
   stripe products create --name "Team"
   stripe prices create --product prod_YYY --unit-amount 4900 --currency usd -d "recurring[interval]=month"
   ```

   Put the two `price_...` IDs in `STRIPE_PRICE_PRO` and `STRIPE_PRICE_TEAM`.
3. **Customer Portal.** In test mode, open *Settings → Billing → Customer portal*. Enable it and allow switching between the Pro and Team prices.
4. **Forward webhooks to your machine:**

   ```bash
   stripe login
   stripe listen \
     --forward-to localhost:3000/api/stripe/webhook \
     --events checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.payment_failed
   ```

   Copy the printed signing secret (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`, then restart `npm run dev`.
5. **Test the flow.** As an organisation **owner**, go to *Dashboard → Billing → Upgrade* and pay with a test card:

| Card number | Result |
| --- | --- |
| `4242 4242 4242 4242` | Succeeds |
| `4000 0025 0000 3155` | Requires 3-D Secure authentication |
| `4000 0000 0000 9995` | Declined (insufficient funds) |
| `4000 0000 0000 0341` | Attaches, but charges fail. Set it as the default card in the Customer Portal; the next renewal then sends `invoice.payment_failed`. |

For all cards, use any future expiry date, any CVC and any postcode. To prove idempotency, replay a delivered event with `stripe events resend evt_...`. The duplicate is acknowledged and ignored.

## Plan configuration

All plan data lives in [`src/config/plans.ts`](src/config/plans.ts):

```ts
pro: {
  id: "pro",
  name: "Pro",
  priceMonthly: 19,
  stripePriceEnv: "STRIPE_PRICE_PRO",          // env var holding the Stripe Price ID
  limits: { projects: 25, members: 5 },        // null = unlimited
  features: ["projects", "invites", "csv-export"],
  highlights: ["Up to 25 projects", "Up to 5 team members", "CSV export", "Email support"],
  popular: true,
},
```

| | Free | Pro | Team |
| --- | --- | --- | --- |
| Price | $0 | $19/mo | $49/mo |
| Projects | 3 | 25 | Unlimited |
| Members | 2 | 5 | 25 |
| CSV export | — | ✓ | ✓ |

Use the helpers in server code (route handlers, server actions, server components):

```ts
import { requirePlan, requireFeature, assertWithinLimit } from "@/lib/billing/plan";

await requirePlan(db, orgId, "pro");               // throws PlanRequiredError (HTTP 402)
await requireFeature(db, orgId, "csv-export");     // feature flag from plans.ts
await assertWithinLimit(db, orgId, "projects");    // throws PlanLimitError at the limit
```

The **effective plan** is the subscription's plan while its status is `active`, `trialing` or `past_due`. `past_due` is a grace period while Stripe retries the card. Every other status, or no subscription at all, means **Free**.

### Roles

| Permission | owner | admin | member |
| --- | :-: | :-: | :-: |
| Create projects | ✓ | ✓ | ✓ |
| Delete projects | ✓ | ✓ | — |
| Invite / remove members, change roles | ✓ | ✓ | — |
| Manage billing (Checkout, Portal) | ✓ | — | — |
| Delete organisation | ✓ | — | — |

Roles are defined once in [`src/lib/auth/permissions.ts`](src/lib/auth/permissions.ts). Better Auth uses them for its own organisation endpoints, and `requireOrgPermission()` uses them for app routes.

## Webhook design

[`src/lib/billing/webhook.ts`](src/lib/billing/webhook.ts) handles each event in these steps:

1. **Verify.** `stripe.webhooks.constructEvent` checks the signature against the raw request body. This includes the 5-minute timestamp tolerance, which blocks replays. Invalid requests get **400**.
2. **Dedupe.** The handler runs `INSERT INTO stripe_event (id) ... ON CONFLICT DO NOTHING` inside a transaction. A redelivered event returns `duplicate` and changes nothing. Concurrent deliveries of the same event block on the primary key, so exactly one is processed. This is tested against real Postgres.
3. **Apply.** The handler updates the organisation's `subscription` row in the **same transaction**. If anything throws, the event record rolls back too and the route returns **500**, so Stripe's retry is processed cleanly.
4. **Order.** Stripe does not guarantee delivery order. The row stores `last_event_at`, and older state changes are skipped.

Handlers read only the event payload and never call the Stripe API. That keeps webhooks fast and makes them testable with signed fixtures (`stripe.webhooks.generateTestHeaderString`).

### Why not the Better Auth Stripe plugin?

[`@better-auth/stripe`](https://www.npmjs.com/package/@better-auth/stripe) is good, and it supports organisation customers. This repo integrates Stripe directly for three reasons:

- The plugin does **not record processed event IDs**. Stripe delivers events *at least once*, so dedupe would have to be added around its handlers anyway.
- `invoice.payment_failed` is only reachable through a generic `onEvent` callback, which runs *after* the built-in handlers.
- Its handlers are bound to the auth endpoint. Owning the handler (about 230 lines) makes billing behaviour explicit, transaction-safe and unit-testable with signed payloads.

Use the plugin if you want less code and accept those trade-offs. Auth, sessions, organisations and roles all still use Better Auth.

## Testing

```bash
npm test                         # PGlite in-memory, no setup
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm test   # real Postgres
```

| Suite | Covers |
| --- | --- |
| `plans.test.ts` | Plan config, tier comparison, limits, features, effective-plan resolution, price ↔ plan mapping |
| `plan-gating.test.ts` | `requirePlan`, `requireFeature`, the Free 3-project limit, upgrade lifts the limit, concurrent-create race, per-org isolation, seat allowance |
| `permissions.test.ts` | Owner/admin/member matrix, multi-role strings, DB-backed checks, tenant isolation |
| `webhook.test.ts` | Missing, wrong, tampered and expired signatures; every handled event; stale events; unknown organisations |
| `idempotency.test.ts` | Redelivery, five concurrent deliveries, rollback-then-retry, distinct event IDs |
| `webhook-route.test.ts` | The actual `POST /api/stripe/webhook` route handler |

## Deploying (Vercel + Neon)

1. Create a [Neon](https://neon.tech) Postgres database and copy the **pooled** connection string. The driver runs with `prepare: false`, so it works with PgBouncer.
2. Run the migrations once:

   ```bash
   DATABASE_URL="postgres://..." npm run db:migrate
   ```

   Alternatively, set Vercel's Build Command to `npm run db:migrate && npm run build`.
3. Import the repo in Vercel and set these environment variables:
   - `DATABASE_URL`
   - `BETTER_AUTH_SECRET`
   - `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` (your production URL)
   - `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_TEAM`
   - Optionally, the `GOOGLE_*` variables
4. In the Stripe Dashboard, open *Developers → Webhooks → Add endpoint*.
   - URL: `https://your-domain/api/stripe/webhook`
   - Events: the five listed above
   - Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
5. For Google sign-in, add `https://your-domain/api/auth/callback/google` as an authorised redirect URI.

The app refuses to fall back to PGlite on Vercel, because serverless file systems are ephemeral.

## Project structure

```
src/
  app/
    page.tsx, pricing/            marketing pages + pricing table
    (auth)/sign-in, sign-up       auth forms (email/password, Google)
    onboarding/                   create or pick an organisation
    dashboard/                    overview (usage, projects), settings (members/invites), billing
    accept-invitation/[id]/       invitation acceptance
    api/auth/[...all]             Better Auth handler
    api/billing/checkout|portal   Stripe Checkout + Customer Portal
    api/stripe/webhook            verified, idempotent webhook endpoint
    api/projects/export           Pro-gated CSV export
  config/plans.ts                 single source of truth for plans
  db/                             Drizzle schema, Postgres/PGlite client, migrator
  lib/auth/                       Better Auth config, roles/permissions, session helpers
  lib/billing/                    plan gating, Stripe client, webhook processing
  lib/projects.ts                 example gated resource
  proxy.ts                        signed-out redirect for /dashboard
drizzle/                          SQL migrations
scripts/                          migrate + seed
tests/                            Vitest suites, Stripe event fixtures
```

## Known limitations

- **No email provider.** Invitation links are logged to the console and shown on the settings page with a copy button. Plug Resend, Postmark or SES into `sendInvitationEmail` in `src/lib/auth/index.ts`. Email verification and password reset are not wired up for the same reason.
- **One subscription item per organisation.** There is no per-seat quantity sync, metered usage or annual pricing toggle. All are straightforward extensions of `plans.ts` and the webhook handler.
- **Plan changes go through the Customer Portal.** That keeps proration logic in Stripe.
- **Rate limiting** uses Better Auth's in-memory default. Use a shared store (database or Redis) when running several instances.

---

**Need a SaaS MVP built?** I build production SaaS products with this stack: auth, multi-tenancy, billing and the product on top. → [github.com/najathi](https://github.com/najathi)

Released under the [MIT License](LICENSE) © Mohamed Najathi.

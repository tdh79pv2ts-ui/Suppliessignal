# SupplySignal

SupplySignal is a customer-specific, evidence-first supply-chain intelligence platform. The repository implements the foundation, customer supply-chain graph, global source intelligence, schema-validated claim extraction, the Phase 4.5 validation POC, deterministic event intelligence, and deterministic customer exposure matching. Risk scoring, alerts, Daily Briefs, and notifications remain explicitly unimplemented.

## Architecture

Phase documentation includes [the extraction validation POC](docs/extraction-validation-poc.md), [event intelligence](docs/event-intelligence.md), and the [manual staging deployment runbook](docs/staging-deployment.md).

- `apps/web` — React, TypeScript, Vite, Tailwind application shell
- `apps/api` — Express REST API with structured logging and server-side authorization
- `packages/db` — Prisma client boundary
- `packages/shared` — shared Zod schemas and TypeScript contracts
- `packages/ingestion` — deterministic RSS/Atom collection, URL/text normalization, hashing, and SSRF-safe network boundary
- `packages/ai` — versioned claim schema/prompt and injectable OpenAI/fake provider boundary
- `packages/scoring` — explicit future-phase placeholder
- `prisma` — PostgreSQL schema, migration, and development seed
- `tests` — unit and integration tests

## Prerequisites

- Node.js 22+
- pnpm 11.16+
- Docker (recommended for local PostgreSQL)
- A Supabase project with email/password authentication enabled

## Setup

```bash
cp .env.example .env
pnpm install
docker compose up -d postgres
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The web app runs at `http://localhost:5173`; the API runs at `http://localhost:4000`.

## Authentication setup

1. Create a Supabase Auth user.
2. Set server-side `SUPABASE_URL` and `SUPABASE_ANON_KEY`, plus browser-safe `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, in `.env`.
3. Update the seeded application user's `id` to exactly match the Supabase Auth user UUID, or insert a corresponding `users` row.
4. Create an explicit `customer_memberships` row for every customer workspace the user may access. Reviewer access is membership-based; only administrators have platform-wide access.
5. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. It is reserved for later administrative provisioning and must never use a public prefix.

For API-only local testing, `ALLOW_DEV_AUTH=true` permits an `x-dev-user-id` header outside production. The API rejects this mode when `NODE_ENV=production`.

## Commands

```bash
pnpm dev             # web and API development servers
pnpm build           # production builds
pnpm typecheck       # strict TypeScript checks
pnpm lint            # ESLint
pnpm test            # unit and integration tests
pnpm db:generate     # generate Prisma client
pnpm db:migrate      # apply/create development migrations
pnpm db:deploy       # apply existing migrations without reset (staging/production)
pnpm db:seed         # seed the fictional Phase 1 customer/user
pnpm db:verify-migrations # clean and Phase 5 hardening upgrade verification
pnpm --filter @suppliesignal/api start:worker # scheduled source collector process
pnpm --filter @suppliesignal/api start:extraction-worker # eligible article extraction process
pnpm --filter @suppliesignal/api start:event-worker # eligible Claim event processing
pnpm --filter @suppliesignal/api start:exposure-worker # Event/customer-graph reconciliation
```

## Production configuration

Use a managed PostgreSQL database, set `NODE_ENV=production` plus an explicit `APP_ENV`, configure exact `WEB_ORIGIN`, and supply secrets through the deployment platform. `ALLOW_DEV_AUTH` must remain `false`. Build with `pnpm build`, migrate with `pnpm db:deploy`, and start the API with `pnpm --filter @suppliesignal/api start`. Serve `apps/web/dist` from a static host and route it to the API configured by `VITE_API_URL`. See the staging runbook for the exact Vercel, Railway, and Supabase configuration.

## Phase status

Phase 6 is implemented: verified external identifiers and exact structured geography deterministically reconcile unresolved Events with explicit customer graph data. One exposure is stored per Customer × Event, with auditable paths and separate ambiguity review. No AI or fuzzy identity matching is used. Risk scoring, alerts, briefs, notifications, and all Phase 7 work remain unimplemented.

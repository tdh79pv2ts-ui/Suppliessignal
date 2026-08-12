# SupplySignal

SupplySignal is a customer-specific, evidence-first supply-chain intelligence platform. This repository currently implements **Phase 1: Foundation** and **Phase 2: Supply-chain knowledge graph**. Source ingestion, AI processing, events, exposure scoring, review workflows, and alerts remain explicitly not configured.

## Architecture

- `apps/web` — React, TypeScript, Vite, Tailwind application shell
- `apps/api` — Express REST API with structured logging and server-side authorization
- `packages/db` — Prisma client boundary
- `packages/shared` — shared Zod schemas and TypeScript contracts
- `packages/ai`, `packages/scoring`, `packages/ingestion` — explicit phase placeholders with no fake functionality
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
2. Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY` in `.env`.
3. Update the seeded application user's `id` to exactly match the Supabase Auth user UUID, or insert a corresponding `users` row.
4. Create an explicit `customer_memberships` row for every customer workspace the user may access. Reviewer access is membership-based; only administrators have platform-wide access.
5. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. It is reserved for later administrative provisioning and must never use the `VITE_` prefix.

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
pnpm db:seed         # seed the fictional Phase 1 customer/user
```

## Production configuration

Use a managed PostgreSQL database, set `NODE_ENV=production`, configure exact `WEB_ORIGIN`, and supply secrets through the deployment platform. `ALLOW_DEV_AUTH` must remain `false`. Build with `pnpm build`, migrate with `pnpm prisma migrate deploy`, and start the API with `pnpm --filter @suppliesignal/api start`. Serve `apps/web/dist` from a static host and route it to the API configured by `VITE_API_URL`.

## Phase status

The authenticated foundation and customer-scoped supply-chain graph are available. The graph contains explicit master-data relationships only; it performs no inference, risk, or exposure calculation. The exact next task, after approval, is **Phase 3 — Source layer: source registry, articles, RSS collection, source administration, and deterministic deduplication.**

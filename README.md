# SupplySignal

SupplySignal is a customer-specific, evidence-first supply-chain intelligence POC. Its active product loop combines an explicit customer supply-chain graph, RSS/Atom monitoring, deterministic article-to-asset matching, explainable potential exposures and an in-app Daily Supply Chain Brief. See [the POC architecture, scope and limitations](docs/supply-chain-intelligence-poc.md).

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
2. Set server-side `SUPABASE_URL` and `SUPABASE_ANON_KEY`, plus browser-safe `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, in `.env`. Set the same `VITE_*` values in Vercel for every staging environment before building.
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
pnpm db:deploy       # apply existing migrations without reset (staging/production)
pnpm db:seed         # seed demo graph/users and verified real-news source configuration
pnpm db:verify-migrations # clean and Phase 5 hardening upgrade verification
pnpm --filter @suppliesignal/api start:worker # scheduled source collector process
pnpm --filter @suppliesignal/api start:extraction-worker # eligible article extraction process
pnpm --filter @suppliesignal/api start:event-worker # eligible Claim event processing
pnpm --filter @suppliesignal/api start:exposure-worker # Event/customer-graph reconciliation
pnpm --filter @suppliesignal/api start:news-radar-worker # direct Article/customer-graph POC matching
```

## Production configuration

Use a managed PostgreSQL database, set `NODE_ENV=production` plus an explicit `APP_ENV`, configure exact `WEB_ORIGIN`, and supply secrets through the deployment platform. `ALLOW_DEV_AUTH` must remain `false`. Build with `pnpm build`, migrate with `pnpm db:deploy`, and start the API with `pnpm --filter @suppliesignal/api start`. Serve `apps/web/dist` from a static host and route it to the API configured by `VITE_API_URL`. See the staging runbook for the exact Vercel, Railway, and Supabase configuration.

## Phase status

The active POC reuses RSS/Atom evidence and matches SourceArticles directly to explicit customer graph data without Claims, Events, identity resolution, review workflows, scoring, alerts, or automated decisions. The radar worker also generates due in-app daily briefs for explicitly enabled preferences.

The seed also contains a [BSK Fashion public-data workspace](docs/bsk-fashion-poc.md) with four published facilities, public product categories, and public material names. Unknown suppliers, routes, ports, and graph relationships are intentionally left empty.

Enterprise-phase tables remain in migration history to preserve data, but Claims, extraction, Events, candidate review, identity governance and enterprise exposure routes are not registered in the active POC application.

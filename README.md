# SupplySignal

SupplySignal is a customer-specific, evidence-first supply-chain intelligence POC. The active BSK Fashion experience combines a sourced supply-chain graph, a graph-derived regional monitoring profile, trusted RSS/Atom monitoring, and deterministic article relevance filtering. It answers two questions: “What is our supply chain?” and “What relevant things are happening in the world?”

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
pnpm poc:validate-data # database-backed BSK source, evidence and tenant-integrity audit
pnpm poc:verify-data # clean disposable PostgreSQL migration + seed + BSK data audit
pnpm poc:benchmark benchmarks/bsk-news-radar.json # >=100 human-labelled real articles; requires >=95% precision
pnpm --filter @suppliesignal/api start:poc-worker # five-minute collection + BSK relevance cycle
pnpm --filter @suppliesignal/api start:worker # scheduled source collector process
pnpm --filter @suppliesignal/api start:extraction-worker # eligible article extraction process
pnpm --filter @suppliesignal/api start:event-worker # eligible Claim event processing
pnpm --filter @suppliesignal/api start:exposure-worker # Event/customer-graph reconciliation
pnpm --filter @suppliesignal/api start:news-radar-worker # direct Article/customer-graph POC matching
```

## BSK intelligence configuration

The database-coordinated POC worker checks only RSS/Atom sources enabled by at least one customer preference. Its first successful run performs an initial full read of every enabled feed, normal runs perform five-minute deltas, and the first run of each UTC day performs a forced reconciliation of every enabled feed. “Full” means the complete history currently exposed by each publisher feed; it never bypasses a publisher's retention window or access controls. Article translation and relevance batches drain until no eligible work remains or progress safely stops. Every run records source/article totals, duplicates, failures and remaining backlog in PostgreSQL. `GET /api/admin/poc-ingestion/status` exposes this evidence to ADMIN; a material backlog produces `PARTIAL`, never “up to date”.

Original publisher URLs remain unchanged. Direct verified graph matches become Direct impact, explicit location/country dependencies become Potential impact, and processed material supply-chain signals without a direct match can appear as Broader developments only when a deterministic trade, logistics, materials, energy, regulatory, environmental or infrastructure pathway exists. Generic politics, crime, sport, entertainment and lifestyle coverage is excluded. A source's country is discovery metadata, not proof that every article concerns that country.

The monitoring profile supports English (`en`), Dutch (`nl`), German (`de`), French (`fr`), Spanish (`es`), Chinese (`zh`), Japanese (`ja`), Korean (`ko`), and Vietnamese (`vi`). Set `ARTICLE_TRANSLATION_ENABLED=true`, a server-only `OPENAI_API_KEY`, and optionally `ARTICLE_TRANSLATION_MODEL` to create schema-validated translations. Original titles, summaries, languages, and URLs are never overwritten. Translation is disabled safely when no provider is configured.

Daily email is disabled by default. To activate it, set `DAILY_BRIEF_EMAIL_ENABLED=true`, server-only `RESEND_API_KEY`, and `DAILY_BRIEF_FROM_EMAIL`. Users then opt in per customer membership with an address, IANA timezone, delivery time, and supported language. Delivery rows have tenant-safe database references and are idempotent per preference and brief. Never expose `OPENAI_API_KEY`, `RESEND_API_KEY`, or `SUPABASE_SERVICE_ROLE_KEY` through a `VITE_` variable.

## Production configuration

Use a managed PostgreSQL database, set `NODE_ENV=production` plus an explicit `APP_ENV`, configure exact `WEB_ORIGIN`, and supply secrets through the deployment platform. `ALLOW_DEV_AUTH` must remain `false`. Build with `pnpm build`, migrate with `pnpm db:deploy`, and start the API with `pnpm --filter @suppliesignal/api start`. Serve `apps/web/dist` from a static host and route it to the API configured by `VITE_API_URL`. See the staging runbook for the exact Vercel, Railway, and Supabase configuration.

## Phase status

The active POC navigation is Dashboard, Supply chain, Intelligence, and Sources. Watch topics live inside Intelligence; language and Daily Brief preferences live under Settings. The system derives monitoring tags, explainable suggestions, language needs, and source recommendations from each customer's graph without exposing a separate Monitoring destination. Its curated public-source universe provides deep China, Myanmar, and Bangladesh coverage plus global trade/weather fallbacks; public WEB references are never presented as automatically collected feeds. A deterministic lightweight Development view groups similar reporting while preserving every original article URL. It does not restore Claims, extraction, Events, candidate/identity/review workflows, scoring, alerts, or automated decisions.

The seed also contains a [BSK Fashion public-data workspace](docs/bsk-fashion-poc.md) with four published facilities, public product categories, and public material names. Unknown suppliers, routes, ports, and graph relationships are intentionally left empty.

Enterprise-phase tables and APIs remain in migration history to preserve existing functionality and data, but they are not exposed in the active POC navigation.

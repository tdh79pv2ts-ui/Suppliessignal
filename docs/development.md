# Development

## Quality gate

Before a phase is considered ready, run:

```bash
pnpm db:generate
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Integration tests cover injected Express authorization and real supply-chain, source-ingestion, and claim-extraction services against Prisma/PostgreSQL. AI tests use a deterministic fake provider and never require or call OpenAI. `pnpm test` creates, migrates, and removes a dedicated local PostgreSQL cluster. It fails fast unless the database is local, named `suppliesignal_test_*`, and `NODE_ENV` is not production. PostgreSQL 16 command-line tools are required.

Run `pnpm db:verify-migrations` for migration verification. It uses disposable PostgreSQL clusters for a clean install plus seed and an in-place Phase 3→4 upgrade with preserved customer, membership, graph, source article, and collection-run fixtures. It never resets existing developer data.

## Adding API routes

Route handlers must authenticate, enforce roles and tenant ownership server-side, validate inputs with Zod, return explicit errors, and log operational identifiers without customer-sensitive payloads.

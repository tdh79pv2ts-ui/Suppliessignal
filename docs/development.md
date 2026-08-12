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

Integration tests cover both injected Express authorization and the real `SupplyChainService` against Prisma/PostgreSQL. `pnpm test` creates, migrates, and removes a dedicated local PostgreSQL cluster. It fails fast unless the database is local, named `suppliesignal_test_*`, and `NODE_ENV` is not production. PostgreSQL 16 command-line tools are required.

Run `pnpm db:verify-migrations` for Phase 2 migration verification. It uses two disposable PostgreSQL clusters: all migrations plus seed on a clean database, followed by an in-place upgrade of a Phase 1 database containing customer, user, and membership fixtures. It never resets existing developer data.

## Adding API routes

Route handlers must authenticate, enforce roles and tenant ownership server-side, validate inputs with Zod, return explicit errors, and log operational identifiers without customer-sensitive payloads.

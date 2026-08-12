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

Integration tests construct the Express application with injected identity resolution, so authentication and tenant authorization can be checked without a live Supabase or database connection. Migration and seed execution require PostgreSQL.

For Phase 2 migration verification, use two disposable PostgreSQL databases: apply all migrations and the seed to one clean database; apply only the Phase 1 migrations and fixture membership data to the second, then apply the Phase 2 migration. This verifies both installation and non-destructive upgrade paths without relying on developer state.

## Adding API routes

Route handlers must authenticate, enforce roles and tenant ownership server-side, validate inputs with Zod, return explicit errors, and log operational identifiers without customer-sensitive payloads.

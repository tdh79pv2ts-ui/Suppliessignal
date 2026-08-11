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

## Adding API routes

Route handlers must authenticate, enforce roles and tenant ownership server-side, validate inputs with Zod, return explicit errors, and log operational identifiers without customer-sensitive payloads.

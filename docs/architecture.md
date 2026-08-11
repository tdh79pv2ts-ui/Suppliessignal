# Architecture

## Phase 1 boundaries

The repository is a pnpm workspace. Browser code, API code, persistence, and shared contracts are separate packages. PostgreSQL is the system of record; Supabase only verifies identities. An authenticated Supabase UUID must resolve to an application `User` before API access is granted.

```text
Browser → Supabase Auth → Bearer token → API token verification
                                      → application User lookup
                                      → role/customer authorization
                                      → Prisma → PostgreSQL
```

Customer users carry a `customerId`; API handlers must validate it server-side. Reviewers and administrators can cross customer boundaries only where a route explicitly permits their role.

The AI, ingestion, and scoring packages deliberately expose only `NOT_CONFIGURED` status constants until their approved phases. There are no fake queues, collectors, or model calls.

## Security decisions

- Helmet security headers and exact-origin CORS are enabled.
- JSON bodies are limited to 1 MB.
- Authorization headers and common secret fields are redacted from structured logs.
- Environment variables are validated at startup.
- Development-header authentication cannot be enabled in production.
- Browser code receives only the Supabase anonymous key; service credentials remain server-side.

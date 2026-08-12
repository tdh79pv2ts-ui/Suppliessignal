# Architecture

## Phase 1–3 boundaries

The repository is a pnpm workspace. Browser code, API code, persistence, and shared contracts are separate packages. PostgreSQL is the system of record; Supabase only verifies identities. An authenticated Supabase UUID must resolve to an application `User` before API access is granted.

```text
Browser → Supabase Auth → Bearer token → API token verification
                                      → application User lookup
                                      → role/customer authorization
                                      → Prisma → PostgreSQL
```

Users receive customer access through explicit `CustomerMembership` records and can belong to multiple customer workspaces. API handlers validate the requested customer against those memberships server-side. Reviewers receive no implicit cross-customer access; they require membership just like customer users. Administrators retain platform-wide access.

Phase 2 adds a factual customer-owned supply-chain graph behind a service layer. Phase 3 adds a separate global source registry and evidence corpus. ADMIN manages sources; REVIEWER reads sources/articles; CUSTOMER has no unrestricted corpus access. The layers are deliberately not connected.

```text
SOURCE REGISTRY → COLLECTORS → RAW ITEM → NORMALIZATION → DEDUPLICATION → SOURCE ARTICLE → [PHASE 4]

CUSTOMER → SUPPLY CHAIN GRAPH
```

## Security decisions

- Helmet security headers and exact-origin CORS are enabled.
- JSON bodies are limited to 1 MB.
- Authorization headers and common secret fields are redacted from structured logs.
- Environment variables are validated at startup.
- Development-header authentication cannot be enabled in production.
- Browser code receives only the Supabase anonymous key; service credentials remain server-side.

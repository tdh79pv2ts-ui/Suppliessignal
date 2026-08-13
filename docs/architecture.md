# Architecture

## Phase 1–6 boundaries

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
SOURCE REGISTRY → COLLECTORS → RAW ITEM → NORMALIZATION → DEDUPLICATION → SOURCE ARTICLE → EXTRACTION RUN → CLAIMS → EVENTS

CUSTOMER → SUPPLY CHAIN GRAPH → DETERMINISTIC CUSTOMER EXPOSURE

SOURCE ARTICLE → DIRECT DETERMINISTIC NEWS RADAR → CUSTOMER GRAPH PATH
```
Claims, extracted entities, and locations are global derived data. They never mutate or resolve into customer graph records. Evidence text is matched deterministically to the exact bounded article input, while provider output is strict-schema validated.

The news-radar POC is a separate direct Article-to-graph path. It does not use Claims, Events, identity governance, candidates, or reviewer workflows. Typed database references keep direct radar exposures tenant-safe and the original SourceArticle URL remains authoritative evidence.

## Security decisions

Phase 4.5 is an evaluation-only layer above immutable Phase 4 extraction history. It freezes explicit articles to exact extraction runs and stores human assessments separately. Deterministic metrics do not create events, risk, alerts, or customer relationships.

Phase 5 adds a global Event layer above immutable Claims. Event construction is deterministic, database-coordinated, and evidence-preserving. It never sends the customer graph to AI and does not connect global Events to customer assets. Production activation requires an auditable Phase 4.5 GO but is a separate operational action.

Phase 6 connects Events to customer assets only through verified identifiers or exact structured geographic rules. PostgreSQL composite foreign keys keep every path and identity tenant-safe. Ambiguous results are stored separately for ADMIN or assigned REVIEWER action and are never shown as confirmed customer exposures. See [customer exposure](customer-exposure.md).

- Helmet security headers and exact-origin CORS are enabled.
- JSON bodies are limited to 1 MB.
- Authorization headers and common secret fields are redacted from structured logs.
- Environment variables are validated at startup.
- Development-header authentication cannot be enabled in staging or production.
- Browser code receives only the Supabase anonymous key; service credentials remain server-side.

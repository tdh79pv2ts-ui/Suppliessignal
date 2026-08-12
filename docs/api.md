# API

Base URL: `/api`. Successful responses use `{ "data": ... }` where applicable. Errors use `{ "error": { "code", "message", "requestId?" } }`.

## Foundation routes

- `GET /api/health` — public process health with the non-secret application environment
- `GET /api/me` — authenticated application profile
- `GET /api/customers/:customerId/foundation` — authenticated tenant-bound phase status

Send a Supabase access token as `Authorization: Bearer <token>`. Customer access is resolved from the authenticated user's memberships; reviewer status alone grants no customer access. In non-production local development only, `ALLOW_DEV_AUTH=true` allows `x-dev-user-id: <uuid>`. Startup fails when development auth is enabled in staging or production.

## Supply-chain routes

Customer-scoped collections support `GET` (pagination/filtering), `POST`, `GET /:id`, `PATCH /:id`, and `POST /:id/archive`:

- `/api/customers/:customerId/suppliers`
- `/api/customers/:customerId/factories`
- `/api/customers/:customerId/products`
- `/api/customers/:customerId/materials`
- `/api/customers/:customerId/routes`

Relationship endpoints attach and detach products, materials, suppliers, factories, and ordered ports beneath their owning resource. `GET /api/customers/:customerId/supply-chain` returns the complete normalized factual graph. Lists accept `page`, `pageSize` (maximum 100), `active`, `search`, and entity-specific filters.

`GET /api/ports` exposes global reference data to authenticated users. Only administrators may `POST /api/ports` or `PATCH /api/ports/:id`. Customer-relevant ports are available at `/api/customers/:customerId/ports`.

## Source intelligence routes

ADMIN and REVIEWER may read `GET /api/sources`, `/api/sources/:sourceId`, `/api/sources/:sourceId/runs`, `/api/source-articles`, and `/api/source-articles/:articleId`. Only ADMIN may create/update sources, `POST /api/sources/:sourceId/collect`, or `POST /api/source-articles/manual`. CUSTOMER requests receive `FORBIDDEN`. Lists use page/pageSize pagination and documented source/article filters.

## AI extraction routes

The Phase 4.5 routes under `/api/poc/extraction/datasets` cover dataset creation, explicit article membership, preflight, execution, progress, article and claim evaluation, results, and JSON/CSV export. Administration actions require `ADMIN`; reads and reviews allow `ADMIN` and `REVIEWER`; `CUSTOMER` is denied.

ADMIN triggers `POST /api/source-articles/:articleId/extract` and `/reprocess`. ADMIN and REVIEWER read `/api/source-articles/:articleId/extractions`, `/api/extractions`, `/api/extractions/:extractionId`, `/api/claims`, `/api/claims/:claimId`, and `/api/extraction-metrics`. CUSTOMER access is denied. Extraction and claim lists are paginated and filterable.

## Event intelligence routes

`ADMIN` and `REVIEWER` may list `GET /api/events` and inspect `GET /api/events/:eventId`, including full Claim, extraction run, article, original URL, and source provenance. Lists support page/pageSize plus event type, status, severity, assertion mode, entity, location, country, and date filters. Only `ADMIN` may process an eligible Claim with `POST /api/events/process-claim/:claimId` or apply an explicit lifecycle transition with `PATCH /api/events/:eventId/status`. `CUSTOMER` is denied access to this global corpus.

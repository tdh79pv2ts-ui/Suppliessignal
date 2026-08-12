# API

Base URL: `/api`. Successful responses use `{ "data": ... }` where applicable. Errors use `{ "error": { "code", "message", "requestId?" } }`.

## Foundation routes

- `GET /api/health` — public process health
- `GET /api/me` — authenticated application profile
- `GET /api/customers/:customerId/foundation` — authenticated tenant-bound phase status

Send a Supabase access token as `Authorization: Bearer <token>`. Customer access is resolved from the authenticated user's memberships; reviewer status alone grants no customer access. In non-production local development only, `ALLOW_DEV_AUTH=true` allows `x-dev-user-id: <uuid>`. Startup fails when development auth is enabled in production.

## Supply-chain routes

Customer-scoped collections support `GET` (pagination/filtering), `POST`, `GET /:id`, `PATCH /:id`, and `POST /:id/archive`:

- `/api/customers/:customerId/suppliers`
- `/api/customers/:customerId/factories`
- `/api/customers/:customerId/products`
- `/api/customers/:customerId/materials`
- `/api/customers/:customerId/routes`

Relationship endpoints attach and detach products, materials, suppliers, factories, and ordered ports beneath their owning resource. `GET /api/customers/:customerId/supply-chain` returns the complete normalized factual graph. Lists accept `page`, `pageSize` (maximum 100), `active`, `search`, and entity-specific filters.

`GET /api/ports` exposes global reference data to authenticated users. Only administrators may `POST /api/ports` or `PATCH /api/ports/:id`. Customer-relevant ports are available at `/api/customers/:customerId/ports`.

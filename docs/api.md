# API

Base URL: `/api`. Successful responses use `{ "data": ... }` where applicable. Errors use `{ "error": { "code", "message", "requestId?" } }`.

## Foundation routes

- `GET /api/health` — public process health
- `GET /api/me` — authenticated application profile
- `GET /api/customers/:customerId/foundation` — authenticated tenant-bound phase status

Send a Supabase access token as `Authorization: Bearer <token>`. In non-production local development only, `ALLOW_DEV_AUTH=true` allows `x-dev-user-id: <uuid>`.

The product routes listed in the master specification are introduced in their relevant phases, not as nonfunctional endpoints.

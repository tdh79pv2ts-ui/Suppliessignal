# Staging deployment

This runbook prepares one stable, browser-accessible staging environment. It does not create production infrastructure, deploy workers, or activate source collection, extraction, or Event processing.

## Topology and prerequisites

- Web: one Vercel project from this repository.
- API: one Railway service from this repository.
- Database and Auth: one dedicated Supabase staging project that is never shared with production.
- Runtime: Node.js 22+ and the repository-pinned `pnpm@11.16.0` (Corepack/package-manager detection uses `packageManager` in the root `package.json`).
- Deploy only a revision for which GitHub CI has passed.

Create the Supabase project first, then Railway, and Vercel last. Keep every credential in the relevant platform's environment-variable store; never put it in Git, a build command, or a log.

## 1. Supabase database

This API is a persistent Railway process and Prisma already provides application-side connection pooling. Use Supabase's **direct connection** as `DATABASE_URL` and enable Railway's outbound IPv6 setting for the API service. The direct endpoint is the preferred Supabase connection for long-lived backends and migrations. It lets the same URL serve the runtime and Railway pre-deploy migration without adding `DIRECT_URL` complexity.

If outbound IPv6 cannot be enabled, use the Supabase **shared pooler in session mode** (port 5432) for both runtime and migration. Do not use transaction mode (port 6543) for this persistent API/migration setup. Copy either connection string from Supabase's Connect panel, preserve its TLS parameters, and store it only as Railway `DATABASE_URL`.

Railway executes this lifecycle from the repository root:

```text
install dependencies
→ pnpm db:generate && pnpm build
→ pnpm db:deploy
→ pnpm --filter @suppliesignal/api start
```

`db:deploy` runs `prisma migrate deploy`; it neither resets nor seeds data. Railway's pre-deploy phase stops the release if migration fails and runs before the new API container starts. Use one staging API service so migrations are not duplicated by worker deployments.

After the first successful migration, initialize the fictional demonstration data exactly once from a trusted local shell with the staging `DATABASE_URL` supplied temporarily:

```bash
pnpm db:seed
```

The current seed is repeatable: application records use stable IDs/upserts, named reference sources are created only when absent, all intelligence fixtures are explicitly fictional, and every seeded source has `collectionEnabled=false`. Re-running it does not create duplicate graph, article, Claim, or Event fixtures, but it is intentionally not part of deployment or restart.

## 2. Supabase Auth and staging user

In the dedicated staging Supabase project:

1. Keep email/password authentication enabled.
2. Set Auth **Site URL** to the stable Vercel staging URL, for example `https://suppliesignal-staging.vercel.app`.
3. Add that exact HTTPS origin to Auth **Redirect URLs** if password recovery or email-confirmation links will be used. The current login uses password authentication and does not require a wildcard redirect.
4. Create the reviewer account in Auth without committing or sharing its password in the repository.
5. Copy its Auth user UUID.
6. In Supabase SQL Editor, replace all angle-bracket values below and execute the transaction. The seeded customer UUID is safe to reuse for the fictional demo workspace.

```sql
begin;

insert into public.users (id, email, name, role, created_at, updated_at)
values (
  '<SUPABASE_AUTH_UUID>'::uuid,
  '<STAGING_USER_EMAIL>',
  'Staging Reviewer',
  'ADMIN'::"UserRole",
  now(),
  now()
)
on conflict (id) do update
set email = excluded.email,
    name = excluded.name,
    role = excluded.role,
    updated_at = now();

insert into public.customer_memberships
  (id, user_id, customer_id, created_at, updated_at)
values (
  gen_random_uuid(),
  '<SUPABASE_AUTH_UUID>'::uuid,
  '5a6ce6b4-0d65-4d16-90dc-04b751f5169b'::uuid,
  now(),
  now()
)
on conflict (user_id, customer_id) do nothing;

commit;
```

The membership is explicit even for this staging ADMIN so the demo workspace appears in the browser. For a `REVIEWER` or `CUSTOMER`, change the role and add only the customer memberships that person is allowed to access. Reviewer status never grants global customer access.

## 3. Railway API

Create one Railway service from the Git repository, using the repository root (`.`). Do not add a Railway PostgreSQL service. `railway.json` supplies the reliable defaults:

| Setting | Value |
| --- | --- |
| Root Directory | `.` |
| Install | Railpack detects Node `>=22`, the root pnpm workspace, and `pnpm@11.16.0` |
| Build | `pnpm db:generate && pnpm build` |
| Pre-deploy | `pnpm db:deploy` |
| Start | `pnpm --filter @suppliesignal/api start` |
| Health check | `/api/health` |
| Restart | on failure, maximum 3 retries |

Generate one stable public Railway domain. The API uses Railway's injected `PORT` before local `API_PORT`, validates it as a positive integer, and listens on `0.0.0.0`. Do not set `PORT` manually.

Set these Railway variables:

```text
NODE_ENV=production
APP_ENV=staging
DATABASE_URL=<Supabase staging direct URL or session-pooler URL>
SUPABASE_URL=https://<staging-project-ref>.supabase.co
SUPABASE_ANON_KEY=<staging anon key>
WEB_ORIGIN=https://<stable-vercel-staging-domain>
ALLOW_DEV_AUTH=false
LOG_LEVEL=info
AI_EXTRACTION_ENABLED=false
OPENAI_EXTRACTION_MODEL=gpt-5-mini
EXTRACTION_BATCH_SIZE=5
EVENT_PROCESSING_ENABLED=false
EVENT_BATCH_SIZE=5
EVENT_POLL_MS=60000
EVENT_MIN_CLAIM_CONFIDENCE=0.60
```

`SUPABASE_SERVICE_ROLE_KEY` is not used by the current API and should be omitted. `OPENAI_API_KEY` is not required while extraction is disabled; enabling extraction still makes it mandatory. The API fails fast if Supabase settings are missing or development auth is enabled. `APP_ENV=staging` also requires `NODE_ENV=production`.

Deploy only this API process. Do not create Railway services for `start:worker`, `start:extraction-worker`, or `start:event-worker`. The source worker has no activation environment flag: it selects database Sources with `active=true` and `collectionEnabled=true`, so keeping all staging Sources collection-disabled is authoritative. Extraction and Event worker activation flags remain false.

After Vercel has its stable domain, update `WEB_ORIGIN` to that exact origin and redeploy the API. Never use `*` or a `*.vercel.app` pattern. If the stable frontend domain changes, update `WEB_ORIGIN` again.

## 4. Vercel web application

Create one Vercel project from the same repository. Use these exact values:

| Setting | Value |
| --- | --- |
| Framework Preset | Vite |
| Root Directory | `.` (repository root) |
| Install Command | `pnpm install --frozen-lockfile` |
| Build Command | `pnpm --filter @suppliesignal/shared build && pnpm --filter @suppliesignal/web build` |
| Output Directory | `apps/web/dist` |

The repository-root `vercel.json` records those values and rewrites every browser route to `index.html`, so direct refreshes of `/dashboard`, `/supply-chain`, `/sources`, `/claims`, `/events`, and `/poc/extraction` stay in React Router.

Set only these Vercel variables for the stable staging environment:

```text
VITE_API_URL=https://<stable-railway-api-domain>/api
VITE_SUPABASE_URL=https://<staging-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<staging anon key>
VITE_APP_ENV=staging
```

Vite variables are compiled into public browser assets. Never add `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, or any password with a `VITE_` prefix. `VITE_APP_ENV=staging` renders the small STAGING badge; production omits it.

Use one stable Vercel deployment URL. Random preview domains are deliberately not trusted by API CORS. Promoting a new revision to the same stable staging domain avoids broadening that boundary.

## 5. Verification checklist

Before deployment, run the repository quality gate:

```bash
pnpm db:generate
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm db:verify-migrations
```

After deployment:

1. `GET https://<api>/api/health` returns only status, service, `environment: "staging"`, and timestamp.
2. Sign in through the Vercel URL and confirm the STAGING badge and seeded customer workspace.
3. Refresh deep links such as `/supply-chain`, `/claims`, `/events`, and `/poc/extraction` directly.
4. Confirm the fictional graph, source/article/Claim fixtures, extraction data, and Events are inspectable for the assigned role.
5. Confirm an unauthenticated protected API call returns `401`.
6. Confirm `x-dev-user-id` cannot authenticate and a Railway start with `ALLOW_DEV_AUTH=true` fails.
7. Confirm a `CUSTOMER` cannot read global sources, Claims, POC, or Events; reviewers retain only explicit customer memberships; ADMIN retains platform-wide access.
8. Send a browser request from an unexpected Origin and confirm the response has no matching `Access-Control-Allow-Origin`; do not broaden CORS.
9. Search `apps/web/dist` for a known test marker used temporarily for each server secret and confirm no marker is present. Never print real secret values during this check.
10. Confirm Railway has no worker service and all Source records remain `collection_enabled=false`.

The health endpoint is process liveness, not database readiness. No second readiness route is added because Railway's migration gate plus authenticated application smoke tests cover database availability without adding another public database probe.

## Known operational limits

- Deployment is manual; this repository does not provision Vercel, Railway, or Supabase.
- One exact CORS origin means arbitrary Vercel preview URLs cannot call the API.
- Workers are intentionally absent from staging; collection, extraction, and Event processing require later explicit operational approval.
- The staging database still needs normal Supabase backup, retention, access-control, and cost monitoring decisions.
- Staging is a review environment, not production. Phase 6 remains unimplemented.

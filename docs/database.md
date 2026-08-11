# Database

Phase 1 contains `customers` and `users`. User IDs intentionally match Supabase Auth UUIDs. A nullable `customer_id` supports administrators/reviewers while giving customer users a database-backed tenant boundary.

Run migrations with `pnpm db:migrate`, seed with `pnpm db:seed`, and inspect locally with `pnpm db:studio`. The seed customer and user are fictional. No password is stored in PostgreSQL.

Phase 2 will add the supply-chain graph. Later migrations will add sources, articles, claims, events, exposures, scores, alerts, reviews, and briefs in their corresponding phases.

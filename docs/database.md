# Database

Phase 1 contains `customers`, `users`, and `customer_memberships`. User IDs intentionally match Supabase Auth UUIDs. The membership join model provides a database-backed many-to-many tenant boundary. Customer users and reviewers can access only customers represented by memberships; administrators may operate platform-wide.

Run migrations with `pnpm db:migrate`, seed with `pnpm db:seed`, and inspect locally with `pnpm db:studio`. The seed customer and user are fictional. No password is stored in PostgreSQL.

Phase 2 will add the supply-chain graph. Later migrations will add sources, articles, claims, events, exposures, scores, alerts, reviews, and briefs in their corresponding phases.

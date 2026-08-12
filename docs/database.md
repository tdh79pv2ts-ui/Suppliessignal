# Database

Phase 1 contains `customers`, `users`, and `customer_memberships`. User IDs intentionally match Supabase Auth UUIDs. The membership join model provides a database-backed many-to-many tenant boundary. Customer users and reviewers can access only customers represented by memberships; administrators may operate platform-wide.

Run migrations with `pnpm db:migrate`, seed with `pnpm db:seed`, and inspect locally with `pnpm db:studio`. The seed customer and user are fictional. No password is stored in PostgreSQL.

Phase 2 adds `suppliers`, `factories`, `products`, `materials`, `routes`, and global `ports`, plus explicit join tables. Customer-owned join rows carry `customer_id` and use composite foreign keys so both endpoints must belong to the same tenant. Later migrations add intelligence entities only in their approved phases.

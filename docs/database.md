# Database

Phase 4.5 adds `PocEvaluationDataset`, `PocEvaluationArticle`, `ArticleEvaluation`, and `ClaimEvaluation`. A composite foreign key on extraction run and source article guarantees that a frozen run belongs to its selected article. Dataset membership is unique and application-immutable after draft.

Phase 1 contains `customers`, `users`, and `customer_memberships`. User IDs intentionally match Supabase Auth UUIDs. The membership join model provides a database-backed many-to-many tenant boundary. Customer users and reviewers can access only customers represented by memberships; administrators may operate platform-wide.

Run migrations with `pnpm db:migrate`, seed with `pnpm db:seed`, and inspect locally with `pnpm db:studio`. The seed customer and user are fictional. No password is stored in PostgreSQL.

Phase 2 adds `suppliers`, `factories`, `products`, `materials`, `routes`, and global `ports`, plus explicit join tables. Customer-owned join rows carry `customer_id` and use composite foreign keys so both endpoints must belong to the same tenant. Later migrations add intelligence entities only in their approved phases.

Phase 3 adds global `sources`, `source_articles`, and `source_collection_runs`. They intentionally have no `customer_id`. Original URLs are immutable evidence fields; canonical URLs, URL hashes, content hashes, raw text and normalized text remain distinct. Unique source/external-ID and source/URL-hash constraints support idempotency without cross-publisher event clustering.

Phase 4 adds global `article_extraction_runs`, `claims`, `claim_entities`, `claim_locations`, and recoverable `article_extraction_leases`. Runs preserve provider/model/prompt/schema/input versions and usage. Claims carry verified evidence offsets and retain direct SourceArticle provenance. Extracted entities are not customer Supplier/Factory records. PostgreSQL lease rows provide atomic cross-process extraction ownership and expire after a bounded timeout.

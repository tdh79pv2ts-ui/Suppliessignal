CREATE TABLE "article_extraction_leases" (
  "source_article_id" UUID NOT NULL,
  "owner_token" UUID NOT NULL,
  "lease_expires_at" TIMESTAMP(3) NOT NULL,
  "acquired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "article_extraction_leases_pkey" PRIMARY KEY ("source_article_id")
);

CREATE INDEX "article_extraction_leases_lease_expires_at_idx"
  ON "article_extraction_leases"("lease_expires_at");

ALTER TABLE "article_extraction_leases"
  ADD CONSTRAINT "article_extraction_leases_source_article_id_fkey"
  FOREIGN KEY ("source_article_id") REFERENCES "source_articles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

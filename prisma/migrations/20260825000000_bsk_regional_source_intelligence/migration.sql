-- Regional source and article metadata for the BSK POC. All changes are
-- forward-only and existing source/article records remain valid.
ALTER TYPE "SourceCategory" ADD VALUE IF NOT EXISTS 'LOCAL_NEWS';
ALTER TYPE "SourceCategory" ADD VALUE IF NOT EXISTS 'MARKET';
ALTER TYPE "SourceCategory" ADD VALUE IF NOT EXISTS 'SUPPLIER';

ALTER TABLE "sources" ADD COLUMN "industry" TEXT;

ALTER TABLE "source_articles"
  ADD COLUMN "country" TEXT,
  ADD COLUMN "region" TEXT,
  ADD COLUMN "category" "SourceCategory";

UPDATE "source_articles" AS article
SET "country" = source."country",
    "region" = source."region",
    "category" = source."category"
FROM "sources" AS source
WHERE article."source_id" = source."id";

CREATE INDEX "sources_country_region_category_idx"
  ON "sources"("country", "region", "category");
CREATE INDEX "source_articles_country_region_category_idx"
  ON "source_articles"("country", "region", "category");

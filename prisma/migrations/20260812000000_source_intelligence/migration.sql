CREATE TYPE "SourceType" AS ENUM ('RSS','ATOM','API','WEB','MANUAL');
CREATE TYPE "SourceCategory" AS ENUM ('NEWS','GOVERNMENT','REGULATOR','INDUSTRY','PORT','LOGISTICS','LABOUR','TRADE','WEATHER','OTHER');
CREATE TYPE "SourceReliability" AS ENUM ('LOW','MEDIUM','HIGH','PRIMARY');
CREATE TYPE "SourceArticleStatus" AS ENUM ('COLLECTED','NORMALIZED','FAILED','IGNORED');
CREATE TYPE "CollectionRunStatus" AS ENUM ('RUNNING','SUCCESS','PARTIAL','FAILED');

CREATE TABLE "sources" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "name" TEXT NOT NULL, "source_type" "SourceType" NOT NULL,
  "base_url" TEXT NOT NULL, "feed_url" TEXT, "country" TEXT, "region" TEXT, "language" TEXT,
  "category" "SourceCategory" NOT NULL, "reliability" "SourceReliability" NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true,
  "collection_enabled" BOOLEAN NOT NULL DEFAULT false, "collection_interval_minutes" INTEGER,
  "last_collected_at" TIMESTAMP(3), "last_successful_collection_at" TIMESTAMP(3), "last_failure_at" TIMESTAMP(3),
  "consecutive_failures" INTEGER NOT NULL DEFAULT 0, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "source_articles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "source_id" UUID NOT NULL, "original_url" TEXT NOT NULL,
  "canonical_url" TEXT, "external_id" TEXT, "title" TEXT NOT NULL, "author" TEXT, "published_at" TIMESTAMP(3),
  "discovered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "collected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "language" TEXT, "raw_text" TEXT, "normalized_text" TEXT, "excerpt" TEXT, "content_hash" TEXT NOT NULL,
  "url_hash" TEXT NOT NULL, "status" "SourceArticleStatus" NOT NULL DEFAULT 'COLLECTED',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "source_articles_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "source_collection_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "source_id" UUID NOT NULL, "collector_type" "SourceType" NOT NULL,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completed_at" TIMESTAMP(3),
  "status" "CollectionRunStatus" NOT NULL DEFAULT 'RUNNING', "items_discovered" INTEGER NOT NULL DEFAULT 0,
  "items_created" INTEGER NOT NULL DEFAULT 0, "items_updated" INTEGER NOT NULL DEFAULT 0, "items_skipped" INTEGER NOT NULL DEFAULT 0,
  "items_failed" INTEGER NOT NULL DEFAULT 0, "error_code" TEXT, "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "source_collection_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sources_active_collection_enabled_idx" ON "sources"("active","collection_enabled");
CREATE INDEX "sources_source_type_category_idx" ON "sources"("source_type","category");
CREATE UNIQUE INDEX "source_articles_source_id_external_id_key" ON "source_articles"("source_id","external_id");
CREATE UNIQUE INDEX "source_articles_source_id_url_hash_key" ON "source_articles"("source_id","url_hash");
CREATE INDEX "source_articles_source_id_content_hash_idx" ON "source_articles"("source_id","content_hash");
CREATE INDEX "source_articles_collected_at_status_idx" ON "source_articles"("collected_at","status");
CREATE INDEX "source_collection_runs_source_id_started_at_idx" ON "source_collection_runs"("source_id","started_at");
ALTER TABLE "source_articles" ADD CONSTRAINT "source_articles_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "source_collection_runs" ADD CONSTRAINT "source_collection_runs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

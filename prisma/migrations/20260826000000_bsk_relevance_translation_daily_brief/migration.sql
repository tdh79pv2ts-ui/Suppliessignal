CREATE TYPE "NewsRadarRelevanceLevel" AS ENUM ('HIGH', 'MEDIUM', 'LOW');
CREATE TYPE "ArticleTranslationStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');
CREATE TYPE "DailyBriefDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');
ALTER TYPE "NewsRadarMatchMethod" ADD VALUE IF NOT EXISTS 'INDUSTRY_CONTEXT';

ALTER TABLE "news_radar_exposures"
  ADD COLUMN "relevance_level" "NewsRadarRelevanceLevel" NOT NULL DEFAULT 'LOW',
  ADD COLUMN "policy_version" TEXT NOT NULL DEFAULT '1.0';

ALTER TABLE "news_radar_article_processing"
  ADD COLUMN "policy_version" TEXT NOT NULL DEFAULT '1.0';

UPDATE "news_radar_exposures"
SET "relevance_level" = CASE
  WHEN "confidence" >= 0.800 THEN 'HIGH'::"NewsRadarRelevanceLevel"
  WHEN "confidence" >= 0.650 THEN 'MEDIUM'::"NewsRadarRelevanceLevel"
  ELSE 'LOW'::"NewsRadarRelevanceLevel"
END;

ALTER TABLE "news_radar_exposures"
  ALTER COLUMN "relevance_level" DROP DEFAULT,
  ALTER COLUMN "policy_version" DROP DEFAULT;

ALTER TABLE "news_radar_article_processing"
  ALTER COLUMN "policy_version" DROP DEFAULT;

DROP INDEX "news_radar_exposures_customer_article_match_key";
CREATE UNIQUE INDEX "news_radar_exposures_customer_article_match_policy_key"
  ON "news_radar_exposures"("customer_id", "source_article_id", "match_key", "policy_version");

CREATE INDEX "news_radar_exposures_customer_id_relevance_level_created_idx"
  ON "news_radar_exposures"("customer_id", "relevance_level", "created_at");

CREATE TABLE "source_article_translations" (
  "id" UUID NOT NULL,
  "source_article_id" UUID NOT NULL,
  "target_language" TEXT NOT NULL,
  "translated_title" TEXT,
  "translated_summary" TEXT,
  "provider" TEXT,
  "model" TEXT,
  "status" "ArticleTranslationStatus" NOT NULL DEFAULT 'PENDING',
  "error_code" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "source_article_translations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "source_article_translations_language_check"
    CHECK ("target_language" IN ('en','nl','de','fr','es','zh','ja','ko','vi')),
  CONSTRAINT "source_article_translations_completed_content_check"
    CHECK ("status" <> 'COMPLETED' OR
      (length(trim(COALESCE("translated_title", ''))) > 0 AND length(trim(COALESCE("translated_summary", ''))) > 0)),
  CONSTRAINT "source_article_translations_source_article_id_fkey"
    FOREIGN KEY ("source_article_id") REFERENCES "source_articles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "source_article_translations_article_language_key"
  ON "source_article_translations"("source_article_id", "target_language");
CREATE INDEX "source_article_translations_status_language_idx"
  ON "source_article_translations"("status", "target_language");

ALTER TABLE "newsletter_preferences" RENAME TO "daily_brief_preferences";
ALTER TABLE "daily_brief_preferences" RENAME CONSTRAINT "newsletter_preferences_pkey" TO "daily_brief_preferences_pkey";
ALTER TABLE "daily_brief_preferences" RENAME CONSTRAINT "newsletter_preferences_user_id_fkey" TO "daily_brief_preferences_user_id_fkey";
ALTER TABLE "daily_brief_preferences" RENAME CONSTRAINT "newsletter_preferences_customer_id_fkey" TO "daily_brief_preferences_customer_id_fkey";
ALTER TABLE "daily_brief_preferences" RENAME CONSTRAINT "newsletter_preferences_membership_fkey" TO "daily_brief_preferences_membership_fkey";
ALTER TABLE "daily_brief_preferences" RENAME CONSTRAINT "newsletter_preferences_delivery_time_check" TO "daily_brief_preferences_delivery_time_check";
ALTER INDEX "newsletter_preferences_user_id_customer_id_key" RENAME TO "daily_brief_preferences_user_id_customer_id_key";
ALTER INDEX "newsletter_preferences_customer_id_enabled_idx" RENAME TO "daily_brief_preferences_customer_id_enabled_idx";
ALTER TABLE "daily_brief_preferences"
  ADD COLUMN "language" TEXT NOT NULL DEFAULT 'en',
  ADD CONSTRAINT "daily_brief_preferences_language_check"
    CHECK ("language" IN ('en','nl','de','fr','es','zh','ja','ko','vi'));
ALTER TABLE "daily_brief_preferences"
  ADD CONSTRAINT "daily_brief_preferences_id_customer_id_user_id_key"
  UNIQUE ("id", "customer_id", "user_id");

CREATE TABLE "daily_brief_deliveries" (
  "id" UUID NOT NULL,
  "preference_id" UUID NOT NULL,
  "brief_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "status" "DailyBriefDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "provider" TEXT,
  "provider_id" TEXT,
  "sent_at" TIMESTAMP(3),
  "error_code" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "daily_brief_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "daily_brief_deliveries_language_check"
    CHECK ("language" IN ('en','nl','de','fr','es','zh','ja','ko','vi')),
  CONSTRAINT "daily_brief_deliveries_preference_tenant_fkey"
    FOREIGN KEY ("preference_id", "customer_id", "user_id")
    REFERENCES "daily_brief_preferences"("id", "customer_id", "user_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "daily_brief_deliveries_brief_tenant_fkey"
    FOREIGN KEY ("brief_id", "customer_id")
    REFERENCES "daily_briefs"("id", "customer_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "daily_brief_deliveries_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "daily_brief_deliveries_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "daily_brief_deliveries_preference_id_brief_id_key"
  ON "daily_brief_deliveries"("preference_id", "brief_id");
CREATE INDEX "daily_brief_deliveries_customer_status_created_idx"
  ON "daily_brief_deliveries"("customer_id", "status", "created_at");

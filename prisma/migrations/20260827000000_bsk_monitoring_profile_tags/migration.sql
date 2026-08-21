CREATE TYPE "MonitoringTagType" AS ENUM ('AUTO', 'SUGGESTED', 'CUSTOM');
CREATE TYPE "MonitoringTagStatus" AS ENUM ('PENDING', 'ACTIVE', 'DISABLED', 'IGNORED');
CREATE TYPE "MonitoringTagCategory" AS ENUM (
  'SUPPLIER', 'FACTORY', 'PRODUCT', 'MATERIAL', 'LOCATION', 'COUNTRY',
  'REGION', 'PORT', 'ROUTE', 'INDUSTRY', 'THEME'
);

CREATE TABLE "customer_monitoring_tags" (
  "id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "type" "MonitoringTagType" NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "normalized_label" TEXT NOT NULL,
  "category" "MonitoringTagCategory" NOT NULL,
  "status" "MonitoringTagStatus" NOT NULL,
  "reason" TEXT NOT NULL,
  "derived_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_user_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_monitoring_tags_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_monitoring_tags_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "customer_monitoring_tags_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "customer_monitoring_tags_key_check"
    CHECK (length(trim("key")) > 0 AND length(trim("label")) > 0 AND length(trim("normalized_label")) > 0),
  CONSTRAINT "customer_monitoring_tags_status_check"
    CHECK (
      ("type" = 'AUTO' AND "status" IN ('ACTIVE', 'DISABLED')) OR
      ("type" = 'SUGGESTED' AND "status" IN ('PENDING', 'ACTIVE', 'IGNORED', 'DISABLED')) OR
      ("type" = 'CUSTOM' AND "status" IN ('ACTIVE', 'DISABLED'))
    )
);

CREATE UNIQUE INDEX "customer_monitoring_tags_customer_type_key_key"
  ON "customer_monitoring_tags"("customer_id", "type", "key");
CREATE INDEX "customer_monitoring_tags_customer_type_status_derived_idx"
  ON "customer_monitoring_tags"("customer_id", "type", "status", "derived_active");

CREATE TABLE "customer_source_preferences" (
  "customer_id" UUID NOT NULL,
  "source_id" UUID NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "recommended" BOOLEAN NOT NULL DEFAULT false,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_source_preferences_pkey" PRIMARY KEY ("customer_id", "source_id"),
  CONSTRAINT "customer_source_preferences_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "customer_source_preferences_source_id_fkey"
    FOREIGN KEY ("source_id") REFERENCES "sources"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "customer_source_preferences_source_enabled_idx"
  ON "customer_source_preferences"("source_id", "enabled");

-- Preserve the existing POC behaviour while making future source controls
-- customer-scoped. Global collection remains enabled only for sources that
-- were already enabled before this migration.
INSERT INTO "customer_source_preferences" (
  "customer_id", "source_id", "enabled", "recommended", "reason", "updated_at"
)
SELECT c."id", s."id", s."collection_enabled", s."collection_enabled",
  'Migrated from the existing verified source configuration.', CURRENT_TIMESTAMP
FROM "customers" c
CROSS JOIN "sources" s
WHERE s."active" = true
ON CONFLICT ("customer_id", "source_id") DO NOTHING;

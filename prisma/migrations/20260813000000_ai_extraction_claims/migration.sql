CREATE TYPE "ExtractionRunStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED');
CREATE TYPE "ClaimType" AS ENUM ('LABOUR_DISRUPTION','STRIKE','FACTORY_DISRUPTION','FACTORY_CLOSURE','PORT_DISRUPTION','LOGISTICS_DISRUPTION','TRANSPORT_DISRUPTION','WEATHER_DISRUPTION','NATURAL_HAZARD','FIRE','FLOOD','EARTHQUAKE','CYCLONE','TYPHOON','POLITICAL_DISRUPTION','CIVIL_UNREST','TRADE_RESTRICTION','IMPORT_RESTRICTION','EXPORT_RESTRICTION','SANCTION','REGULATORY_CHANGE','CUSTOMS_CHANGE','TARIFF_CHANGE','MATERIAL_SHORTAGE','ENERGY_DISRUPTION','INFRASTRUCTURE_DISRUPTION','SECURITY_INCIDENT','OTHER');
CREATE TYPE "AssertionMode" AS ENUM ('OBSERVED','REPORTED','ANNOUNCED','FORECAST','PLANNED','ESTIMATED');
CREATE TYPE "ClaimEntityType" AS ENUM ('ORGANIZATION','COMPANY','GOVERNMENT','REGULATOR','INDUSTRY_ASSOCIATION','LABOUR_UNION','FACTORY','PORT','AIRPORT','CITY','REGION','COUNTRY','PRODUCT','MATERIAL','COMMODITY','TRANSPORT_ROUTE','OTHER');

CREATE TABLE "article_extraction_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "source_article_id" UUID NOT NULL,
  "status" "ExtractionRunStatus" NOT NULL DEFAULT 'PROCESSING', "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL, "prompt_version" TEXT NOT NULL, "schema_version" TEXT NOT NULL,
  "input_hash" TEXT NOT NULL, "input_characters" INTEGER NOT NULL, "input_truncated" BOOLEAN NOT NULL DEFAULT false,
  "input_tokens" INTEGER, "output_tokens" INTEGER, "claims_extracted" INTEGER NOT NULL DEFAULT 0,
  "article_relevant" BOOLEAN, "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3), "error_code" TEXT, "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "article_extraction_runs_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "claims" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "source_article_id" UUID NOT NULL, "extraction_run_id" UUID NOT NULL,
  "claim_type" "ClaimType" NOT NULL, "assertion_mode" "AssertionMode" NOT NULL, "statement" TEXT NOT NULL,
  "confidence" DECIMAL(4,3) NOT NULL, "occurred_at" TIMESTAMP(3), "valid_from" TIMESTAMP(3), "valid_until" TIMESTAMP(3),
  "evidence_text" TEXT NOT NULL, "evidence_start" INTEGER NOT NULL, "evidence_end" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "claim_entities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "claim_id" UUID NOT NULL, "entity_type" "ClaimEntityType" NOT NULL,
  "name" TEXT NOT NULL, "normalized_name" TEXT, "role" TEXT, "confidence" DECIMAL(4,3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "claim_entities_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "claim_locations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "claim_id" UUID NOT NULL, "name" TEXT NOT NULL,
  "country" TEXT, "region" TEXT, "city" TEXT, "confidence" DECIMAL(4,3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "claim_locations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "article_extraction_runs_source_article_id_started_at_idx" ON "article_extraction_runs"("source_article_id", "started_at");
CREATE INDEX "article_extraction_runs_status_started_at_idx" ON "article_extraction_runs"("status", "started_at");
CREATE INDEX "claims_source_article_id_created_at_idx" ON "claims"("source_article_id", "created_at");
CREATE INDEX "claims_extraction_run_id_idx" ON "claims"("extraction_run_id");
CREATE INDEX "claims_claim_type_occurred_at_idx" ON "claims"("claim_type", "occurred_at");
CREATE INDEX "claim_entities_claim_id_idx" ON "claim_entities"("claim_id");
CREATE INDEX "claim_entities_entity_type_name_idx" ON "claim_entities"("entity_type", "name");
CREATE INDEX "claim_locations_claim_id_idx" ON "claim_locations"("claim_id");
CREATE INDEX "claim_locations_country_name_idx" ON "claim_locations"("country", "name");
ALTER TABLE "article_extraction_runs" ADD CONSTRAINT "article_extraction_runs_source_article_id_fkey" FOREIGN KEY ("source_article_id") REFERENCES "source_articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "claims" ADD CONSTRAINT "claims_source_article_id_fkey" FOREIGN KEY ("source_article_id") REFERENCES "source_articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "claims" ADD CONSTRAINT "claims_extraction_run_id_fkey" FOREIGN KEY ("extraction_run_id") REFERENCES "article_extraction_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "claim_entities" ADD CONSTRAINT "claim_entities_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "claim_locations" ADD CONSTRAINT "claim_locations_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "EventType" AS ENUM ('FACTORY_DISRUPTION','FACTORY_CLOSURE','FACTORY_EXPANSION','PRODUCTION_REDUCTION','PRODUCTION_INCREASE','PORT_DISRUPTION','PORT_CLOSURE','PORT_CONGESTION','SHIPPING_DISRUPTION','LOGISTICS_DISRUPTION','STRIKE','LABOR_DISRUPTION','NATURAL_HAZARD','WEATHER_DISRUPTION','FIRE','EXPLOSION','ACCIDENT','POWER_OUTAGE','CYBER_INCIDENT','REGULATORY_CHANGE','TRADE_RESTRICTION','SANCTION','TARIFF_CHANGE','EXPORT_RESTRICTION','IMPORT_RESTRICTION','SUPPLIER_DISRUPTION','MATERIAL_SHORTAGE','CAPACITY_CHANGE','OTHER');
CREATE TYPE "EventStatus" AS ENUM ('DETECTED','ACTIVE','RESOLVED','CANCELLED');
CREATE TYPE "EventSeverity" AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL');
CREATE TYPE "EventEntityType" AS ENUM ('SUPPLIER','COMPANY','FACTORY','PORT','AIRPORT','WAREHOUSE','DISTRIBUTION_CENTER','MATERIAL','PRODUCT','TRANSPORT_ROUTE','VESSEL','REGION','COUNTRY','OTHER');
CREATE TYPE "EventLocationType" AS ENUM ('CITY','REGION','COUNTRY','PORT','FACTORY','OTHER');
CREATE TYPE "EventTemporalPrecision" AS ENUM ('UNKNOWN','DAY','RANGE');
CREATE TYPE "EventConflictState" AS ENUM ('NONE','DETECTED');
CREATE TYPE "EventMatchDecision" AS ENUM ('CREATE_NEW','MATCH_EXISTING','AMBIGUOUS');
CREATE TYPE "ClaimEventProcessingStatus" AS ENUM ('PENDING','PROCESSING','COMPLETED','SKIPPED','FAILED');

CREATE TABLE "events" (
  "id" UUID NOT NULL, "event_type" "EventType" NOT NULL, "status" "EventStatus" NOT NULL DEFAULT 'DETECTED',
  "title" TEXT NOT NULL, "summary" TEXT NOT NULL, "severity" "EventSeverity" NOT NULL,
  "confidence" DECIMAL(4,3) NOT NULL, "assertion_mode" "AssertionMode" NOT NULL,
  "start_date" TIMESTAMP(3), "end_date" TIMESTAMP(3), "occurred_at" TIMESTAMP(3), "observed_at" TIMESTAMP(3),
  "temporal_precision" "EventTemporalPrecision" NOT NULL DEFAULT 'UNKNOWN',
  "first_seen_at" TIMESTAMP(3) NOT NULL, "last_seen_at" TIMESTAMP(3) NOT NULL,
  "fingerprint" TEXT NOT NULL, "conflict_state" "EventConflictState" NOT NULL DEFAULT 'NONE', "conflict_reason" TEXT,
  "supporting_claim_count" INTEGER NOT NULL DEFAULT 0, "supporting_article_count" INTEGER NOT NULL DEFAULT 0,
  "supporting_source_count" INTEGER NOT NULL DEFAULT 0, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "events_confidence_check" CHECK ("confidence" >= 0 AND "confidence" <= 1)
);
CREATE UNIQUE INDEX "events_fingerprint_key" ON "events"("fingerprint");
CREATE INDEX "events_event_type_status_last_seen_at_idx" ON "events"("event_type","status","last_seen_at");
CREATE INDEX "events_severity_last_seen_at_idx" ON "events"("severity","last_seen_at");
CREATE INDEX "events_assertion_mode_start_date_idx" ON "events"("assertion_mode","start_date");

CREATE TABLE "event_claims" (
  "event_id" UUID NOT NULL, "claim_id" UUID NOT NULL, "match_decision" "EventMatchDecision" NOT NULL,
  "match_reason" TEXT NOT NULL, "attached_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_claims_pkey" PRIMARY KEY ("event_id","claim_id")
);
CREATE INDEX "event_claims_claim_id_idx" ON "event_claims"("claim_id");
CREATE INDEX "event_claims_event_id_idx" ON "event_claims"("event_id");

CREATE TABLE "event_entities" (
  "id" UUID NOT NULL, "event_id" UUID NOT NULL, "entity_type" "EventEntityType" NOT NULL,
  "name" TEXT NOT NULL, "normalized_name" TEXT NOT NULL, "normalized_key" TEXT NOT NULL, "role" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "event_entities_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "event_entities_event_id_normalized_key_key" ON "event_entities"("event_id","normalized_key");
CREATE INDEX "event_entities_entity_type_normalized_name_idx" ON "event_entities"("entity_type","normalized_name");

CREATE TABLE "event_locations" (
  "id" UUID NOT NULL, "event_id" UUID NOT NULL, "location_type" "EventLocationType" NOT NULL DEFAULT 'OTHER',
  "name" TEXT NOT NULL, "country" TEXT, "region" TEXT, "city" TEXT, "latitude" DECIMAL(9,6), "longitude" DECIMAL(9,6),
  "normalized_key" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_locations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "event_locations_event_id_normalized_key_key" ON "event_locations"("event_id","normalized_key");
CREATE INDEX "event_locations_country_region_city_idx" ON "event_locations"("country","region","city");

CREATE TABLE "claim_event_processing" (
  "claim_id" UUID NOT NULL, "status" "ClaimEventProcessingStatus" NOT NULL DEFAULT 'PENDING', "owner_token" UUID,
  "lease_expires_at" TIMESTAMP(3), "attempts" INTEGER NOT NULL DEFAULT 0, "processed_at" TIMESTAMP(3),
  "next_attempt_at" TIMESTAMP(3), "error_code" TEXT, "error_message" TEXT,
  "match_decision" "EventMatchDecision", "candidate_event_ids" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "claim_event_processing_pkey" PRIMARY KEY ("claim_id")
);
CREATE INDEX "claim_event_processing_status_next_attempt_at_idx" ON "claim_event_processing"("status","next_attempt_at");
CREATE INDEX "claim_event_processing_lease_expires_at_idx" ON "claim_event_processing"("lease_expires_at");

ALTER TABLE "event_claims" ADD CONSTRAINT "event_claims_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_claims" ADD CONSTRAINT "event_claims_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_entities" ADD CONSTRAINT "event_entities_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_locations" ADD CONSTRAINT "event_locations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "claim_event_processing" ADD CONSTRAINT "claim_event_processing_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

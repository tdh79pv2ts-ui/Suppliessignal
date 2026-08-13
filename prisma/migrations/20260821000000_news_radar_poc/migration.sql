CREATE TYPE "NewsRadarTopic" AS ENUM (
  'GEOPOLITICAL', 'ECONOMIC', 'OPERATIONAL', 'LOGISTICS', 'ENVIRONMENTAL', 'TRADE'
);

CREATE TYPE "NewsRadarEntityType" AS ENUM (
  'SUPPLIER', 'FACTORY', 'PRODUCT', 'MATERIAL', 'ROUTE', 'PORT'
);

CREATE TYPE "NewsRadarMatchMethod" AS ENUM (
  'EXACT_LEGAL_NAME', 'UNIQUE_EXACT_NAME', 'NAME_AND_LOCATION',
  'EXACT_CITY_COUNTRY', 'EXACT_COUNTRY', 'EXACT_PORT_NAME',
  'EXACT_PORT_CODE', 'ROUTE_ENDPOINTS'
);

CREATE TYPE "NewsRadarProcessingStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

ALTER TABLE "sources"
  ALTER COLUMN "collection_interval_minutes" SET DEFAULT 15;

UPDATE "sources"
SET "collection_interval_minutes" = 15
WHERE "collection_interval_minutes" IS NULL;

ALTER TABLE "route_ports"
  ADD CONSTRAINT "route_ports_route_id_port_id_customer_id_key"
  UNIQUE ("route_id", "port_id", "customer_id");

CREATE TABLE "news_radar_article_processing" (
  "source_article_id" UUID NOT NULL,
  "status" "NewsRadarProcessingStatus" NOT NULL DEFAULT 'RUNNING',
  "owner_token" UUID NOT NULL,
  "lease_expires_at" TIMESTAMP(3) NOT NULL,
  "attempt_count" INTEGER NOT NULL DEFAULT 1,
  "topics" "NewsRadarTopic"[] NOT NULL,
  "detected_terms" TEXT[] NOT NULL,
  "detected_locations" TEXT[] NOT NULL,
  "completed_at" TIMESTAMP(3),
  "error_code" TEXT,
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "news_radar_article_processing_pkey" PRIMARY KEY ("source_article_id"),
  CONSTRAINT "news_radar_article_processing_source_article_id_fkey"
    FOREIGN KEY ("source_article_id") REFERENCES "source_articles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "news_radar_article_processing_status_lease_expires_at_idx"
  ON "news_radar_article_processing"("status", "lease_expires_at");

CREATE TABLE "news_radar_exposures" (
  "id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "source_article_id" UUID NOT NULL,
  "match_key" TEXT NOT NULL,
  "entity_type" "NewsRadarEntityType" NOT NULL,
  "topic" "NewsRadarTopic" NOT NULL,
  "match_method" "NewsRadarMatchMethod" NOT NULL,
  "confidence" DECIMAL(4,3) NOT NULL,
  "reason" TEXT NOT NULL,
  "matched_terms" TEXT[] NOT NULL,
  "path_snapshot" JSONB NOT NULL,
  "supplier_id" UUID,
  "factory_id" UUID,
  "product_id" UUID,
  "material_id" UUID,
  "route_id" UUID,
  "route_port_route_id" UUID,
  "port_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "news_radar_exposures_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "news_radar_exposures_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "news_radar_exposures_source_article_id_fkey"
    FOREIGN KEY ("source_article_id") REFERENCES "source_articles"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "news_radar_exposures_supplier_id_customer_id_fkey"
    FOREIGN KEY ("supplier_id", "customer_id") REFERENCES "suppliers"("id", "customer_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "news_radar_exposures_factory_id_customer_id_fkey"
    FOREIGN KEY ("factory_id", "customer_id") REFERENCES "factories"("id", "customer_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "news_radar_exposures_product_id_customer_id_fkey"
    FOREIGN KEY ("product_id", "customer_id") REFERENCES "products"("id", "customer_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "news_radar_exposures_material_id_customer_id_fkey"
    FOREIGN KEY ("material_id", "customer_id") REFERENCES "materials"("id", "customer_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "news_radar_exposures_route_id_customer_id_fkey"
    FOREIGN KEY ("route_id", "customer_id") REFERENCES "routes"("id", "customer_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "news_radar_exposures_route_port_fkey"
    FOREIGN KEY ("route_port_route_id", "port_id", "customer_id")
    REFERENCES "route_ports"("route_id", "port_id", "customer_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "news_radar_exposures_subject_type_check" CHECK (
    ("entity_type" = 'SUPPLIER' AND "supplier_id" IS NOT NULL AND "factory_id" IS NULL AND "product_id" IS NULL AND "material_id" IS NULL AND "route_id" IS NULL AND "route_port_route_id" IS NULL AND "port_id" IS NULL) OR
    ("entity_type" = 'FACTORY' AND "supplier_id" IS NULL AND "factory_id" IS NOT NULL AND "product_id" IS NULL AND "material_id" IS NULL AND "route_id" IS NULL AND "route_port_route_id" IS NULL AND "port_id" IS NULL) OR
    ("entity_type" = 'PRODUCT' AND "supplier_id" IS NULL AND "factory_id" IS NULL AND "product_id" IS NOT NULL AND "material_id" IS NULL AND "route_id" IS NULL AND "route_port_route_id" IS NULL AND "port_id" IS NULL) OR
    ("entity_type" = 'MATERIAL' AND "supplier_id" IS NULL AND "factory_id" IS NULL AND "product_id" IS NULL AND "material_id" IS NOT NULL AND "route_id" IS NULL AND "route_port_route_id" IS NULL AND "port_id" IS NULL) OR
    ("entity_type" = 'ROUTE' AND "supplier_id" IS NULL AND "factory_id" IS NULL AND "product_id" IS NULL AND "material_id" IS NULL AND "route_id" IS NOT NULL AND "route_port_route_id" IS NULL AND "port_id" IS NULL) OR
    ("entity_type" = 'PORT' AND "supplier_id" IS NULL AND "factory_id" IS NULL AND "product_id" IS NULL AND "material_id" IS NULL AND "route_id" IS NULL AND "route_port_route_id" IS NOT NULL AND "port_id" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "news_radar_exposures_customer_article_match_key"
  ON "news_radar_exposures"("customer_id", "source_article_id", "match_key");
CREATE INDEX "news_radar_exposures_customer_created_at_idx"
  ON "news_radar_exposures"("customer_id", "created_at");
CREATE INDEX "news_radar_exposures_source_article_id_idx"
  ON "news_radar_exposures"("source_article_id");
CREATE INDEX "news_radar_exposures_customer_entity_type_idx"
  ON "news_radar_exposures"("customer_id", "entity_type");

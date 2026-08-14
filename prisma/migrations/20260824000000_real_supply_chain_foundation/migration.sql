-- Evidence-first supply-chain graph entities and provenance. Existing columns
-- remain nullable so this forward-only migration preserves all historic data.
ALTER TABLE "suppliers"
  ADD COLUMN "category" TEXT,
  ADD COLUMN "source_name" TEXT,
  ADD COLUMN "source_url" TEXT,
  ADD COLUMN "verified_at" TIMESTAMP(3);

ALTER TABLE "factories"
  ADD COLUMN "category" TEXT,
  ADD COLUMN "source_name" TEXT,
  ADD COLUMN "source_url" TEXT,
  ADD COLUMN "verified_at" TIMESTAMP(3),
  ADD COLUMN "supplier_relation_source_name" TEXT,
  ADD COLUMN "supplier_relation_source_url" TEXT,
  ADD COLUMN "supplier_relation_collected_at" TIMESTAMP(3),
  ADD COLUMN "supplier_relation_confidence" DECIMAL(4,3);

ALTER TABLE "products"
  ADD COLUMN "country" TEXT,
  ADD COLUMN "location" TEXT,
  ADD COLUMN "source_name" TEXT,
  ADD COLUMN "source_url" TEXT,
  ADD COLUMN "verified_at" TIMESTAMP(3);

ALTER TABLE "materials"
  ADD COLUMN "country" TEXT,
  ADD COLUMN "location" TEXT,
  ADD COLUMN "source_name" TEXT,
  ADD COLUMN "source_url" TEXT,
  ADD COLUMN "verified_at" TIMESTAMP(3);

ALTER TABLE "ports"
  ADD COLUMN "location" TEXT,
  ADD COLUMN "category" TEXT,
  ADD COLUMN "source_name" TEXT,
  ADD COLUMN "source_url" TEXT,
  ADD COLUMN "verified_at" TIMESTAMP(3);

ALTER TABLE "routes"
  ADD COLUMN "country" TEXT,
  ADD COLUMN "location" TEXT,
  ADD COLUMN "category" TEXT,
  ADD COLUMN "source_name" TEXT,
  ADD COLUMN "source_url" TEXT,
  ADD COLUMN "verified_at" TIMESTAMP(3);

ALTER TABLE "factory_products" ADD COLUMN "source_name" TEXT, ADD COLUMN "source_url" TEXT, ADD COLUMN "collected_at" TIMESTAMP(3), ADD COLUMN "confidence" DECIMAL(4,3);
ALTER TABLE "product_materials" ADD COLUMN "source_name" TEXT, ADD COLUMN "source_url" TEXT, ADD COLUMN "collected_at" TIMESTAMP(3), ADD COLUMN "confidence" DECIMAL(4,3);
ALTER TABLE "supplier_products" ADD COLUMN "source_name" TEXT, ADD COLUMN "source_url" TEXT, ADD COLUMN "collected_at" TIMESTAMP(3), ADD COLUMN "confidence" DECIMAL(4,3);
ALTER TABLE "route_ports" ADD COLUMN "source_name" TEXT, ADD COLUMN "source_url" TEXT, ADD COLUMN "collected_at" TIMESTAMP(3), ADD COLUMN "confidence" DECIMAL(4,3);
ALTER TABLE "route_suppliers" ADD COLUMN "source_name" TEXT, ADD COLUMN "source_url" TEXT, ADD COLUMN "collected_at" TIMESTAMP(3), ADD COLUMN "confidence" DECIMAL(4,3);
ALTER TABLE "route_factories" ADD COLUMN "source_name" TEXT, ADD COLUMN "source_url" TEXT, ADD COLUMN "collected_at" TIMESTAMP(3), ADD COLUMN "confidence" DECIMAL(4,3);

ALTER TABLE "factories" ADD CONSTRAINT "factories_supplier_relation_confidence_check" CHECK ("supplier_relation_confidence" IS NULL OR ("supplier_relation_confidence" >= 0 AND "supplier_relation_confidence" <= 1));
ALTER TABLE "factory_products" ADD CONSTRAINT "factory_products_confidence_check" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1));
ALTER TABLE "product_materials" ADD CONSTRAINT "product_materials_confidence_check" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1));
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_confidence_check" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1));
ALTER TABLE "route_ports" ADD CONSTRAINT "route_ports_confidence_check" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1));
ALTER TABLE "route_suppliers" ADD CONSTRAINT "route_suppliers_confidence_check" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1));
ALTER TABLE "route_factories" ADD CONSTRAINT "route_factories_confidence_check" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1));

CREATE TABLE "companies" (
  "id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "legal_name" TEXT,
  "country" TEXT,
  "location" TEXT,
  "category" TEXT,
  "source_name" TEXT NOT NULL,
  "source_url" TEXT NOT NULL,
  "verified_at" TIMESTAMP(3) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "countries" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "iso2" CHAR(2) NOT NULL,
  "source_name" TEXT NOT NULL,
  "source_url" TEXT NOT NULL,
  "verified_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "locations" (
  "id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "country" TEXT NOT NULL,
  "location" TEXT,
  "category" TEXT,
  "latitude" DECIMAL(9,6),
  "longitude" DECIMAL(9,6),
  "source_name" TEXT NOT NULL,
  "source_url" TEXT NOT NULL,
  "verified_at" TIMESTAMP(3) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "company_suppliers" (
  "customer_id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "supplier_id" UUID NOT NULL,
  "source_name" TEXT NOT NULL,
  "source_url" TEXT NOT NULL,
  "collected_at" TIMESTAMP(3) NOT NULL,
  "confidence" DECIMAL(4,3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "company_suppliers_pkey" PRIMARY KEY ("company_id", "supplier_id"),
  CONSTRAINT "company_suppliers_confidence_check" CHECK ("confidence" >= 0 AND "confidence" <= 1)
);

CREATE TABLE "factory_locations" (
  "customer_id" UUID NOT NULL,
  "factory_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "source_name" TEXT NOT NULL,
  "source_url" TEXT NOT NULL,
  "collected_at" TIMESTAMP(3) NOT NULL,
  "confidence" DECIMAL(4,3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "factory_locations_pkey" PRIMARY KEY ("factory_id", "location_id"),
  CONSTRAINT "factory_locations_confidence_check" CHECK ("confidence" >= 0 AND "confidence" <= 1)
);

CREATE UNIQUE INDEX "companies_id_customer_id_key" ON "companies"("id", "customer_id");
CREATE UNIQUE INDEX "companies_customer_id_name_key" ON "companies"("customer_id", "name");
CREATE INDEX "companies_customer_id_active_idx" ON "companies"("customer_id", "active");
CREATE UNIQUE INDEX "countries_name_key" ON "countries"("name");
CREATE UNIQUE INDEX "countries_iso2_key" ON "countries"("iso2");
CREATE UNIQUE INDEX "locations_id_customer_id_key" ON "locations"("id", "customer_id");
CREATE UNIQUE INDEX "locations_customer_id_name_country_id_key" ON "locations"("customer_id", "name", "country_id");
CREATE INDEX "locations_customer_id_active_idx" ON "locations"("customer_id", "active");
CREATE INDEX "company_suppliers_customer_id_idx" ON "company_suppliers"("customer_id");
CREATE INDEX "factory_locations_customer_id_idx" ON "factory_locations"("customer_id");

ALTER TABLE "companies" ADD CONSTRAINT "companies_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "locations" ADD CONSTRAINT "locations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "locations" ADD CONSTRAINT "locations_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_suppliers" ADD CONSTRAINT "company_suppliers_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_suppliers" ADD CONSTRAINT "company_suppliers_company_id_customer_id_fkey" FOREIGN KEY ("company_id", "customer_id") REFERENCES "companies"("id", "customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_suppliers" ADD CONSTRAINT "company_suppliers_supplier_id_customer_id_fkey" FOREIGN KEY ("supplier_id", "customer_id") REFERENCES "suppliers"("id", "customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "factory_locations" ADD CONSTRAINT "factory_locations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "factory_locations" ADD CONSTRAINT "factory_locations_factory_id_customer_id_fkey" FOREIGN KEY ("factory_id", "customer_id") REFERENCES "factories"("id", "customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "factory_locations" ADD CONSTRAINT "factory_locations_location_id_customer_id_fkey" FOREIGN KEY ("location_id", "customer_id") REFERENCES "locations"("id", "customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

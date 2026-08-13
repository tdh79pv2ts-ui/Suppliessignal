CREATE TYPE "ExposureType" AS ENUM ('DIRECT_SUPPLIER', 'DIRECT_FACTORY', 'DIRECT_PORT', 'DIRECT_ROUTE', 'DIRECT_MATERIAL', 'DIRECT_PRODUCT', 'INDIRECT_SUPPLIER', 'INDIRECT_FACTORY', 'INDIRECT_ROUTE', 'GEOGRAPHIC_PROXIMITY');
CREATE TYPE "ExposureStatus" AS ENUM ('POTENTIAL', 'CONFIRMED', 'DISMISSED', 'STALE', 'RESOLVED');
CREATE TYPE "ExposureDecision" AS ENUM ('MATCH', 'AMBIGUOUS', 'NO_MATCH');
CREATE TYPE "ExposureMatchMethod" AS ENUM ('VERIFIED_IDENTIFIER', 'REVIEWED_IDENTITY_MAPPING', 'GLOBAL_PORT_ID', 'PORT_CODE', 'COMPOSITE_EXACT_IDENTITY', 'EXACT_STRUCTURED_LOCATION', 'COORDINATE_PROXIMITY', 'EXPLICIT_GRAPH_PATH');
CREATE TYPE "ExposureMatchState" AS ENUM ('VERIFIED_DIRECT', 'VERIFIED_INDIRECT', 'GEOGRAPHIC', 'AMBIGUOUS');
CREATE TYPE "ExposureNodeType" AS ENUM ('SUPPLIER', 'FACTORY', 'PRODUCT', 'MATERIAL', 'ROUTE', 'PORT');
CREATE TYPE "IdentitySubjectType" AS ENUM ('SUPPLIER', 'FACTORY', 'PRODUCT', 'MATERIAL', 'ROUTE', 'PORT');
CREATE TYPE "IdentityVerificationStatus" AS ENUM ('PROPOSED', 'VERIFIED', 'UNVERIFIED', 'REJECTED');
CREATE TYPE "ExposureCandidateStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'SUPERSEDED');
CREATE TYPE "ExposureReasonCode" AS ENUM ('EXACT_SUPPLIER_IDENTIFIER', 'EXACT_FACTORY_IDENTIFIER', 'EXACT_PRODUCT_IDENTIFIER', 'EXACT_MATERIAL_IDENTIFIER', 'EXACT_ROUTE_IDENTIFIER', 'EXACT_PORT_ID', 'EXACT_PORT_CODE', 'COMPOSITE_SUPPLIER_IDENTITY', 'COMPOSITE_FACTORY_IDENTITY', 'ROUTE_CONTAINS_ORIGIN_PORT', 'ROUTE_CONTAINS_DESTINATION_PORT', 'ROUTE_CONTAINS_INTERMEDIATE_PORT', 'EXPLICIT_SUPPLIER_PRODUCT_PATH', 'EXPLICIT_FACTORY_PRODUCT_PATH', 'EXPLICIT_PRODUCT_MATERIAL_PATH', 'EXPLICIT_ROUTE_SUPPLIER_PATH', 'EXPLICIT_ROUTE_FACTORY_PATH', 'EXACT_COORDINATE_PROXIMITY', 'EXACT_CITY_REGION_COUNTRY', 'EXACT_REGION_COUNTRY', 'COUNTRY_ONLY_PROXIMITY', 'AMBIGUOUS_ENTITY_IDENTITY', 'AMBIGUOUS_LOCATION', 'NAME_ONLY_MATCH_REJECTED', 'COUNTRY_MISMATCH', 'PORT_COUNTRY_MISMATCH', 'FACTORY_NOT_IN_CUSTOMER_GRAPH', 'NO_EXPLICIT_GRAPH_PATH', 'NODE_ARCHIVED', 'NO_SUPPORTED_MATCH');

ALTER TABLE "customers" ADD COLUMN "graph_revision" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "events" ADD COLUMN "exposure_version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "customer_exposures" (
  "id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "status" "ExposureStatus" NOT NULL DEFAULT 'POTENTIAL',
  "primary_exposure_type" "ExposureType" NOT NULL,
  "match_confidence" DECIMAL(4,3) NOT NULL,
  "match_state" "ExposureMatchState" NOT NULL,
  "event_policy_version" TEXT NOT NULL,
  "exposure_policy_version" TEXT NOT NULL,
  "event_version" INTEGER NOT NULL,
  "graph_revision" BIGINT NOT NULL,
  "first_detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_matched_at" TIMESTAMP(3) NOT NULL,
  "resolved_at" TIMESTAMP(3),
  "stale_at" TIMESTAMP(3),
  "dismissed_at" TIMESTAMP(3),
  "reviewed_by_user_id" UUID,
  "review_reason_code" "ExposureReasonCode",
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_exposures_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_exposures_confidence_check" CHECK ("match_confidence" >= 0 AND "match_confidence" <= 1)
);

CREATE TABLE "exposure_paths" (
  "id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "exposure_id" UUID NOT NULL,
  "path_key" TEXT NOT NULL,
  "exposure_type" "ExposureType" NOT NULL,
  "decision" "ExposureDecision" NOT NULL,
  "match_method" "ExposureMatchMethod" NOT NULL,
  "match_confidence" DECIMAL(4,3) NOT NULL,
  "reason_codes" "ExposureReasonCode"[],
  "active_match" BOOLEAN NOT NULL DEFAULT true,
  "first_matched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_matched_at" TIMESTAMP(3) NOT NULL,
  "invalidated_at" TIMESTAMP(3),
  "graph_revision" BIGINT NOT NULL,
  "event_version" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "exposure_paths_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "exposure_paths_confidence_check" CHECK ("match_confidence" >= 0 AND "match_confidence" <= 1)
);

CREATE TABLE "exposure_path_steps" (
  "id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "path_id" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "node_type" "ExposureNodeType" NOT NULL,
  "edge_from_previous" TEXT,
  "supplier_id" UUID,
  "factory_id" UUID,
  "product_id" UUID,
  "material_id" UUID,
  "route_id" UUID,
  "port_id" UUID,
  "label_snapshot" TEXT NOT NULL,
  "attributes_snapshot" JSONB,
  "active_snapshot" BOOLEAN,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "exposure_path_steps_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "exposure_path_steps_one_subject_check" CHECK (num_nonnulls("supplier_id", "factory_id", "product_id", "material_id", "route_id", "port_id") = 1),
  CONSTRAINT "exposure_path_steps_subject_type_check" CHECK (
    ("node_type" = 'SUPPLIER' AND "supplier_id" IS NOT NULL) OR
    ("node_type" = 'FACTORY' AND "factory_id" IS NOT NULL) OR
    ("node_type" = 'PRODUCT' AND "product_id" IS NOT NULL) OR
    ("node_type" = 'MATERIAL' AND "material_id" IS NOT NULL) OR
    ("node_type" = 'ROUTE' AND "route_id" IS NOT NULL) OR
    ("node_type" = 'PORT' AND "port_id" IS NOT NULL)
  )
);

CREATE TABLE "customer_graph_identities" (
  "id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "subject_type" "IdentitySubjectType" NOT NULL,
  "supplier_id" UUID,
  "factory_id" UUID,
  "product_id" UUID,
  "material_id" UUID,
  "route_id" UUID,
  "port_id" UUID,
  "namespace" TEXT NOT NULL,
  "identifier" TEXT NOT NULL,
  "normalized_identifier" TEXT NOT NULL,
  "verification_status" "IdentityVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
  "provenance_source" TEXT NOT NULL,
  "provenance_ref" TEXT,
  "evidence_note" TEXT,
  "verified_at" TIMESTAMP(3),
  "verified_by_user_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_graph_identities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_graph_identities_one_subject_check" CHECK (num_nonnulls("supplier_id", "factory_id", "product_id", "material_id", "route_id", "port_id") = 1),
  CONSTRAINT "customer_graph_identities_subject_type_check" CHECK (
    ("subject_type" = 'SUPPLIER' AND "supplier_id" IS NOT NULL) OR
    ("subject_type" = 'FACTORY' AND "factory_id" IS NOT NULL) OR
    ("subject_type" = 'PRODUCT' AND "product_id" IS NOT NULL) OR
    ("subject_type" = 'MATERIAL' AND "material_id" IS NOT NULL) OR
    ("subject_type" = 'ROUTE' AND "route_id" IS NOT NULL) OR
    ("subject_type" = 'PORT' AND "port_id" IS NOT NULL)
  ),
  CONSTRAINT "customer_graph_identities_verification_check" CHECK (
    ("verification_status" = 'VERIFIED' AND "verified_at" IS NOT NULL AND "verified_by_user_id" IS NOT NULL) OR
    ("verification_status" <> 'VERIFIED' AND "verified_at" IS NULL AND "verified_by_user_id" IS NULL)
  )
);

CREATE TABLE "event_entity_identifiers" (
  "id" UUID NOT NULL,
  "event_entity_id" UUID NOT NULL,
  "namespace" TEXT NOT NULL,
  "identifier" TEXT NOT NULL,
  "normalized_identifier" TEXT NOT NULL,
  "verification_status" "IdentityVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
  "provenance_source" TEXT NOT NULL,
  "provenance_ref" TEXT,
  "evidence_note" TEXT,
  "source_claim_id" UUID,
  "proposed_at" TIMESTAMP(3),
  "proposed_by_user_id" UUID,
  "verified_at" TIMESTAMP(3),
  "verified_by_user_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_entity_identifiers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_entity_identifiers_verification_check" CHECK (
    ("verification_status" = 'VERIFIED' AND "verified_at" IS NOT NULL AND "verified_by_user_id" IS NOT NULL) OR
    ("verification_status" <> 'VERIFIED' AND "verified_at" IS NULL AND "verified_by_user_id" IS NULL)
  ),
  CONSTRAINT "event_entity_identifiers_proposal_check" CHECK (
    ("verification_status" = 'PROPOSED' AND "proposed_at" IS NOT NULL AND "proposed_by_user_id" IS NOT NULL) OR
    "verification_status" <> 'PROPOSED'
  )
);

CREATE TABLE "exposure_candidates" (
  "id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "candidate_key" TEXT NOT NULL,
  "status" "ExposureCandidateStatus" NOT NULL DEFAULT 'PENDING',
  "confidence" DECIMAL(4,3),
  "match_methods" "ExposureMatchMethod"[],
  "reason_codes" "ExposureReasonCode"[],
  "event_entity_ids" UUID[],
  "event_location_ids" UUID[],
  "snapshot" JSONB NOT NULL,
  "exposure_policy_version" TEXT NOT NULL,
  "graph_revision" BIGINT NOT NULL,
  "event_version" INTEGER NOT NULL,
  "reviewed_at" TIMESTAMP(3),
  "reviewed_by_user_id" UUID,
  "review_reason_code" "ExposureReasonCode",
  "resulting_identity_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "exposure_candidates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "exposure_candidates_confidence_check" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1)),
  CONSTRAINT "exposure_candidates_review_check" CHECK (
    ("status" = 'PENDING' AND "reviewed_at" IS NULL AND "reviewed_by_user_id" IS NULL) OR
    ("status" <> 'PENDING' AND "reviewed_at" IS NOT NULL AND "reviewed_by_user_id" IS NOT NULL)
  )
);

CREATE TABLE "exposure_candidate_nodes" (
  "id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "candidate_id" UUID NOT NULL,
  "supplier_id" UUID,
  "factory_id" UUID,
  "product_id" UUID,
  "material_id" UUID,
  "route_id" UUID,
  "port_id" UUID,
  "snapshot" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "exposure_candidate_nodes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "exposure_candidate_nodes_one_subject_check" CHECK (num_nonnulls("supplier_id", "factory_id", "product_id", "material_id", "route_id", "port_id") = 1)
);

CREATE UNIQUE INDEX "customer_exposures_customer_id_event_id_key" ON "customer_exposures"("customer_id", "event_id");
CREATE UNIQUE INDEX "customer_exposures_id_customer_id_key" ON "customer_exposures"("id", "customer_id");
CREATE INDEX "customer_exposures_customer_id_status_last_matched_at_idx" ON "customer_exposures"("customer_id", "status", "last_matched_at");
CREATE INDEX "customer_exposures_customer_id_primary_exposure_type_status_idx" ON "customer_exposures"("customer_id", "primary_exposure_type", "status");
CREATE INDEX "customer_exposures_event_id_status_idx" ON "customer_exposures"("event_id", "status");
CREATE UNIQUE INDEX "exposure_paths_exposure_id_path_key_key" ON "exposure_paths"("exposure_id", "path_key");
CREATE UNIQUE INDEX "exposure_paths_id_customer_id_key" ON "exposure_paths"("id", "customer_id");
CREATE INDEX "exposure_paths_customer_id_active_match_exposure_type_idx" ON "exposure_paths"("customer_id", "active_match", "exposure_type");
CREATE INDEX "exposure_paths_exposure_id_decision_idx" ON "exposure_paths"("exposure_id", "decision");
CREATE UNIQUE INDEX "exposure_path_steps_path_id_sequence_key" ON "exposure_path_steps"("path_id", "sequence");
CREATE INDEX "exposure_path_steps_customer_id_supplier_id_idx" ON "exposure_path_steps"("customer_id", "supplier_id");
CREATE INDEX "exposure_path_steps_customer_id_factory_id_idx" ON "exposure_path_steps"("customer_id", "factory_id");
CREATE INDEX "exposure_path_steps_customer_id_product_id_idx" ON "exposure_path_steps"("customer_id", "product_id");
CREATE INDEX "exposure_path_steps_customer_id_material_id_idx" ON "exposure_path_steps"("customer_id", "material_id");
CREATE INDEX "exposure_path_steps_customer_id_route_id_idx" ON "exposure_path_steps"("customer_id", "route_id");
CREATE INDEX "exposure_path_steps_port_id_idx" ON "exposure_path_steps"("port_id");
CREATE UNIQUE INDEX "customer_graph_identities_id_customer_id_key" ON "customer_graph_identities"("id", "customer_id");
CREATE INDEX "customer_graph_identities_namespace_normalized_identifier_ver_idx" ON "customer_graph_identities"("namespace", "normalized_identifier", "verification_status");
CREATE INDEX "customer_graph_identities_customer_id_supplier_id_idx" ON "customer_graph_identities"("customer_id", "supplier_id");
CREATE INDEX "customer_graph_identities_customer_id_factory_id_idx" ON "customer_graph_identities"("customer_id", "factory_id");
CREATE INDEX "customer_graph_identities_customer_id_product_id_idx" ON "customer_graph_identities"("customer_id", "product_id");
CREATE INDEX "customer_graph_identities_customer_id_material_id_idx" ON "customer_graph_identities"("customer_id", "material_id");
CREATE INDEX "customer_graph_identities_customer_id_route_id_idx" ON "customer_graph_identities"("customer_id", "route_id");
CREATE INDEX "customer_graph_identities_port_id_idx" ON "customer_graph_identities"("port_id");
CREATE UNIQUE INDEX "customer_graph_identity_supplier_identifier_key" ON "customer_graph_identities"("customer_id", "supplier_id", "namespace", "normalized_identifier") WHERE "supplier_id" IS NOT NULL;
CREATE UNIQUE INDEX "customer_graph_identity_factory_identifier_key" ON "customer_graph_identities"("customer_id", "factory_id", "namespace", "normalized_identifier") WHERE "factory_id" IS NOT NULL;
CREATE UNIQUE INDEX "customer_graph_identity_product_identifier_key" ON "customer_graph_identities"("customer_id", "product_id", "namespace", "normalized_identifier") WHERE "product_id" IS NOT NULL;
CREATE UNIQUE INDEX "customer_graph_identity_material_identifier_key" ON "customer_graph_identities"("customer_id", "material_id", "namespace", "normalized_identifier") WHERE "material_id" IS NOT NULL;
CREATE UNIQUE INDEX "customer_graph_identity_route_identifier_key" ON "customer_graph_identities"("customer_id", "route_id", "namespace", "normalized_identifier") WHERE "route_id" IS NOT NULL;
CREATE UNIQUE INDEX "customer_graph_identity_port_identifier_key" ON "customer_graph_identities"("customer_id", "port_id", "namespace", "normalized_identifier") WHERE "port_id" IS NOT NULL;
CREATE UNIQUE INDEX "event_entity_identifiers_event_entity_id_namespace_normalized_key" ON "event_entity_identifiers"("event_entity_id", "namespace", "normalized_identifier");
CREATE INDEX "event_entity_identifiers_namespace_normalized_identifier_ver_idx" ON "event_entity_identifiers"("namespace", "normalized_identifier", "verification_status");
CREATE INDEX "event_entity_identifiers_source_claim_id_idx" ON "event_entity_identifiers"("source_claim_id");
CREATE UNIQUE INDEX "exposure_candidates_customer_event_key_policy_key" ON "exposure_candidates"("customer_id", "event_id", "candidate_key", "exposure_policy_version");
CREATE UNIQUE INDEX "exposure_candidates_id_customer_id_key" ON "exposure_candidates"("id", "customer_id");
CREATE INDEX "exposure_candidates_customer_id_status_created_at_idx" ON "exposure_candidates"("customer_id", "status", "created_at");
CREATE INDEX "exposure_candidates_event_id_status_idx" ON "exposure_candidates"("event_id", "status");
CREATE INDEX "exposure_candidates_resulting_identity_id_customer_id_idx" ON "exposure_candidates"("resulting_identity_id", "customer_id");
CREATE INDEX "exposure_candidate_nodes_candidate_id_customer_id_idx" ON "exposure_candidate_nodes"("candidate_id", "customer_id");
CREATE INDEX "exposure_candidate_nodes_customer_id_supplier_id_idx" ON "exposure_candidate_nodes"("customer_id", "supplier_id");
CREATE INDEX "exposure_candidate_nodes_customer_id_factory_id_idx" ON "exposure_candidate_nodes"("customer_id", "factory_id");
CREATE INDEX "exposure_candidate_nodes_customer_id_product_id_idx" ON "exposure_candidate_nodes"("customer_id", "product_id");
CREATE INDEX "exposure_candidate_nodes_customer_id_material_id_idx" ON "exposure_candidate_nodes"("customer_id", "material_id");
CREATE INDEX "exposure_candidate_nodes_customer_id_route_id_idx" ON "exposure_candidate_nodes"("customer_id", "route_id");
CREATE INDEX "exposure_candidate_nodes_port_id_idx" ON "exposure_candidate_nodes"("port_id");

ALTER TABLE "customer_exposures" ADD CONSTRAINT "customer_exposures_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_exposures" ADD CONSTRAINT "customer_exposures_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_exposures" ADD CONSTRAINT "customer_exposures_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exposure_paths" ADD CONSTRAINT "exposure_paths_exposure_id_customer_id_fkey" FOREIGN KEY ("exposure_id", "customer_id") REFERENCES "customer_exposures"("id", "customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exposure_path_steps" ADD CONSTRAINT "exposure_path_steps_path_id_customer_id_fkey" FOREIGN KEY ("path_id", "customer_id") REFERENCES "exposure_paths"("id", "customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exposure_path_steps" ADD CONSTRAINT "exposure_path_steps_supplier_id_customer_id_fkey" FOREIGN KEY ("supplier_id", "customer_id") REFERENCES "suppliers"("id", "customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exposure_path_steps" ADD CONSTRAINT "exposure_path_steps_factory_id_customer_id_fkey" FOREIGN KEY ("factory_id", "customer_id") REFERENCES "factories"("id", "customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exposure_path_steps" ADD CONSTRAINT "exposure_path_steps_product_id_customer_id_fkey" FOREIGN KEY ("product_id", "customer_id") REFERENCES "products"("id", "customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exposure_path_steps" ADD CONSTRAINT "exposure_path_steps_material_id_customer_id_fkey" FOREIGN KEY ("material_id", "customer_id") REFERENCES "materials"("id", "customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exposure_path_steps" ADD CONSTRAINT "exposure_path_steps_route_id_customer_id_fkey" FOREIGN KEY ("route_id", "customer_id") REFERENCES "routes"("id", "customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exposure_path_steps" ADD CONSTRAINT "exposure_path_steps_port_id_fkey" FOREIGN KEY ("port_id") REFERENCES "ports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_graph_identities" ADD CONSTRAINT "customer_graph_identities_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_graph_identities" ADD CONSTRAINT "customer_graph_identities_supplier_id_customer_id_fkey" FOREIGN KEY ("supplier_id", "customer_id") REFERENCES "suppliers"("id", "customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_graph_identities" ADD CONSTRAINT "customer_graph_identities_factory_id_customer_id_fkey" FOREIGN KEY ("factory_id", "customer_id") REFERENCES "factories"("id", "customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_graph_identities" ADD CONSTRAINT "customer_graph_identities_product_id_customer_id_fkey" FOREIGN KEY ("product_id", "customer_id") REFERENCES "products"("id", "customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_graph_identities" ADD CONSTRAINT "customer_graph_identities_material_id_customer_id_fkey" FOREIGN KEY ("material_id", "customer_id") REFERENCES "materials"("id", "customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_graph_identities" ADD CONSTRAINT "customer_graph_identities_route_id_customer_id_fkey" FOREIGN KEY ("route_id", "customer_id") REFERENCES "routes"("id", "customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_graph_identities" ADD CONSTRAINT "customer_graph_identities_port_id_fkey" FOREIGN KEY ("port_id") REFERENCES "ports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_graph_identities" ADD CONSTRAINT "customer_graph_identities_verified_by_user_id_fkey" FOREIGN KEY ("verified_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_entity_identifiers" ADD CONSTRAINT "event_entity_identifiers_event_entity_id_fkey" FOREIGN KEY ("event_entity_id") REFERENCES "event_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_entity_identifiers" ADD CONSTRAINT "event_entity_identifiers_source_claim_id_fkey" FOREIGN KEY ("source_claim_id") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_entity_identifiers" ADD CONSTRAINT "event_entity_identifiers_proposed_by_user_id_fkey" FOREIGN KEY ("proposed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_entity_identifiers" ADD CONSTRAINT "event_entity_identifiers_verified_by_user_id_fkey" FOREIGN KEY ("verified_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exposure_candidates" ADD CONSTRAINT "exposure_candidates_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exposure_candidates" ADD CONSTRAINT "exposure_candidates_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exposure_candidates" ADD CONSTRAINT "exposure_candidates_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exposure_candidates" ADD CONSTRAINT "exposure_candidates_resulting_identity_customer_fkey" FOREIGN KEY ("resulting_identity_id", "customer_id") REFERENCES "customer_graph_identities"("id", "customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exposure_candidate_nodes" ADD CONSTRAINT "exposure_candidate_nodes_candidate_id_customer_id_fkey" FOREIGN KEY ("candidate_id", "customer_id") REFERENCES "exposure_candidates"("id", "customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exposure_candidate_nodes" ADD CONSTRAINT "exposure_candidate_nodes_supplier_id_customer_id_fkey" FOREIGN KEY ("supplier_id", "customer_id") REFERENCES "suppliers"("id", "customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exposure_candidate_nodes" ADD CONSTRAINT "exposure_candidate_nodes_factory_id_customer_id_fkey" FOREIGN KEY ("factory_id", "customer_id") REFERENCES "factories"("id", "customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exposure_candidate_nodes" ADD CONSTRAINT "exposure_candidate_nodes_product_id_customer_id_fkey" FOREIGN KEY ("product_id", "customer_id") REFERENCES "products"("id", "customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exposure_candidate_nodes" ADD CONSTRAINT "exposure_candidate_nodes_material_id_customer_id_fkey" FOREIGN KEY ("material_id", "customer_id") REFERENCES "materials"("id", "customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exposure_candidate_nodes" ADD CONSTRAINT "exposure_candidate_nodes_route_id_customer_id_fkey" FOREIGN KEY ("route_id", "customer_id") REFERENCES "routes"("id", "customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exposure_candidate_nodes" ADD CONSTRAINT "exposure_candidate_nodes_port_id_fkey" FOREIGN KEY ("port_id") REFERENCES "ports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION enforce_identity_status_transition() RETURNS trigger AS $$
BEGIN
  IF OLD.verification_status = NEW.verification_status THEN RETURN NEW; END IF;
  IF OLD.verification_status IN ('PROPOSED', 'UNVERIFIED') AND NEW.verification_status IN ('VERIFIED', 'REJECTED') THEN RETURN NEW; END IF;
  IF OLD.verification_status = 'VERIFIED' AND NEW.verification_status = 'REJECTED' THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'invalid identity verification status transition from % to %', OLD.verification_status, NEW.verification_status USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "customer_graph_identity_status_transition" BEFORE UPDATE OF "verification_status" ON "customer_graph_identities" FOR EACH ROW EXECUTE FUNCTION enforce_identity_status_transition();
CREATE TRIGGER "event_entity_identifier_status_transition" BEFORE UPDATE OF "verification_status" ON "event_entity_identifiers" FOR EACH ROW EXECUTE FUNCTION enforce_identity_status_transition();

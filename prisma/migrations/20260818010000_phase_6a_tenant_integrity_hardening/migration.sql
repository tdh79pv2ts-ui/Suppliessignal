ALTER TABLE "exposure_candidate_nodes"
ADD COLUMN "node_type" "ExposureNodeType";

UPDATE "exposure_candidate_nodes"
SET "node_type" = CASE
  WHEN "supplier_id" IS NOT NULL THEN 'SUPPLIER'::"ExposureNodeType"
  WHEN "factory_id" IS NOT NULL THEN 'FACTORY'::"ExposureNodeType"
  WHEN "product_id" IS NOT NULL THEN 'PRODUCT'::"ExposureNodeType"
  WHEN "material_id" IS NOT NULL THEN 'MATERIAL'::"ExposureNodeType"
  WHEN "route_id" IS NOT NULL THEN 'ROUTE'::"ExposureNodeType"
  WHEN "port_id" IS NOT NULL THEN 'PORT'::"ExposureNodeType"
END;

ALTER TABLE "exposure_candidate_nodes"
ALTER COLUMN "node_type" SET NOT NULL;

ALTER TABLE "exposure_candidate_nodes"
ADD CONSTRAINT "exposure_candidate_nodes_subject_type_check" CHECK (
  ("node_type" = 'SUPPLIER' AND "supplier_id" IS NOT NULL) OR
  ("node_type" = 'FACTORY' AND "factory_id" IS NOT NULL) OR
  ("node_type" = 'PRODUCT' AND "product_id" IS NOT NULL) OR
  ("node_type" = 'MATERIAL' AND "material_id" IS NOT NULL) OR
  ("node_type" = 'ROUTE' AND "route_id" IS NOT NULL) OR
  ("node_type" = 'PORT' AND "port_id" IS NOT NULL)
);

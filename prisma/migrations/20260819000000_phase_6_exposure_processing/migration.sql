CREATE UNIQUE INDEX "verified_customer_identity_collision_key"
ON "customer_graph_identities"("customer_id", "namespace", "normalized_identifier")
WHERE "verification_status" = 'VERIFIED';

CREATE UNIQUE INDEX "verified_event_identifier_collision_key"
ON "event_entity_identifiers"("namespace", "normalized_identifier")
WHERE "verification_status" = 'VERIFIED';

CREATE FUNCTION increment_customer_graph_revision() RETURNS trigger AS $$
DECLARE affected_customer UUID;
BEGIN
  affected_customer := COALESCE(NEW.customer_id, OLD.customer_id);
  UPDATE customers SET graph_revision = graph_revision + 1 WHERE id = affected_customer;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "supplier_graph_revision" AFTER INSERT OR UPDATE OR DELETE ON "suppliers" FOR EACH ROW EXECUTE FUNCTION increment_customer_graph_revision();
CREATE TRIGGER "factory_graph_revision" AFTER INSERT OR UPDATE OR DELETE ON "factories" FOR EACH ROW EXECUTE FUNCTION increment_customer_graph_revision();
CREATE TRIGGER "product_graph_revision" AFTER INSERT OR UPDATE OR DELETE ON "products" FOR EACH ROW EXECUTE FUNCTION increment_customer_graph_revision();
CREATE TRIGGER "material_graph_revision" AFTER INSERT OR UPDATE OR DELETE ON "materials" FOR EACH ROW EXECUTE FUNCTION increment_customer_graph_revision();
CREATE TRIGGER "route_graph_revision" AFTER INSERT OR UPDATE OR DELETE ON "routes" FOR EACH ROW EXECUTE FUNCTION increment_customer_graph_revision();
CREATE TRIGGER "supplier_product_graph_revision" AFTER INSERT OR UPDATE OR DELETE ON "supplier_products" FOR EACH ROW EXECUTE FUNCTION increment_customer_graph_revision();
CREATE TRIGGER "factory_product_graph_revision" AFTER INSERT OR UPDATE OR DELETE ON "factory_products" FOR EACH ROW EXECUTE FUNCTION increment_customer_graph_revision();
CREATE TRIGGER "product_material_graph_revision" AFTER INSERT OR UPDATE OR DELETE ON "product_materials" FOR EACH ROW EXECUTE FUNCTION increment_customer_graph_revision();
CREATE TRIGGER "route_supplier_graph_revision" AFTER INSERT OR UPDATE OR DELETE ON "route_suppliers" FOR EACH ROW EXECUTE FUNCTION increment_customer_graph_revision();
CREATE TRIGGER "route_factory_graph_revision" AFTER INSERT OR UPDATE OR DELETE ON "route_factories" FOR EACH ROW EXECUTE FUNCTION increment_customer_graph_revision();
CREATE TRIGGER "route_port_graph_revision" AFTER INSERT OR UPDATE OR DELETE ON "route_ports" FOR EACH ROW EXECUTE FUNCTION increment_customer_graph_revision();
CREATE TRIGGER "graph_identity_revision" AFTER INSERT OR UPDATE OR DELETE ON "customer_graph_identities" FOR EACH ROW EXECUTE FUNCTION increment_customer_graph_revision();

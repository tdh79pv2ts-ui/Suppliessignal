-- An authoritative identifier may legitimately appear on EventEntities from
-- multiple Events. Customer-side verified identity remains collision-safe per
-- customer; Event-side lookup is non-unique and still requires VERIFIED state.
DROP INDEX IF EXISTS "verified_event_identifier_collision_key";

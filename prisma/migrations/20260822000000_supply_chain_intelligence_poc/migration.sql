-- Daily brief preferences are constrained to an existing customer membership.
CREATE TABLE "newsletter_preferences" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "delivery_time" TEXT NOT NULL DEFAULT '08:00',
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "email" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "newsletter_preferences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "newsletter_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "newsletter_preferences_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "newsletter_preferences_membership_fkey" FOREIGN KEY ("user_id", "customer_id") REFERENCES "customer_memberships"("user_id", "customer_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "newsletter_preferences_delivery_time_check" CHECK ("delivery_time" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$')
);

CREATE UNIQUE INDEX "newsletter_preferences_user_id_customer_id_key" ON "newsletter_preferences"("user_id", "customer_id");
CREATE INDEX "newsletter_preferences_customer_id_enabled_idx" ON "newsletter_preferences"("customer_id", "enabled");

CREATE UNIQUE INDEX "news_radar_exposures_id_customer_id_key" ON "news_radar_exposures"("id", "customer_id");

CREATE TABLE "daily_briefs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "customer_id" UUID NOT NULL,
  "brief_date" DATE NOT NULL,
  "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "graph_revision" BIGINT NOT NULL,
  "supply_chain_snapshot" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "daily_briefs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "daily_briefs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "daily_briefs_customer_id_brief_date_key" ON "daily_briefs"("customer_id", "brief_date");
CREATE UNIQUE INDEX "daily_briefs_id_customer_id_key" ON "daily_briefs"("id", "customer_id");
CREATE INDEX "daily_briefs_customer_id_generated_at_idx" ON "daily_briefs"("customer_id", "generated_at");

CREATE TABLE "daily_brief_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "customer_id" UUID NOT NULL,
  "brief_id" UUID NOT NULL,
  "exposure_id" UUID NOT NULL,
  "section" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "daily_brief_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "daily_brief_items_brief_fkey" FOREIGN KEY ("brief_id", "customer_id") REFERENCES "daily_briefs"("id", "customer_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "daily_brief_items_exposure_fkey" FOREIGN KEY ("exposure_id", "customer_id") REFERENCES "news_radar_exposures"("id", "customer_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "daily_brief_items_position_check" CHECK ("position" > 0)
);

CREATE UNIQUE INDEX "daily_brief_items_brief_id_exposure_id_key" ON "daily_brief_items"("brief_id", "exposure_id");
CREATE UNIQUE INDEX "daily_brief_items_brief_id_position_key" ON "daily_brief_items"("brief_id", "position");
CREATE INDEX "daily_brief_items_customer_id_exposure_id_idx" ON "daily_brief_items"("customer_id", "exposure_id");

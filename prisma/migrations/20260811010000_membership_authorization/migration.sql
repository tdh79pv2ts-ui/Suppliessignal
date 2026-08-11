CREATE TABLE "customer_memberships" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customer_memberships_pkey" PRIMARY KEY ("id")
);

-- Preserve every existing tenant assignment before removing the one-customer column.
INSERT INTO "customer_memberships" ("id", "user_id", "customer_id", "created_at", "updated_at")
SELECT gen_random_uuid(), "id", "customer_id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users"
WHERE "customer_id" IS NOT NULL;

CREATE UNIQUE INDEX "customer_memberships_user_id_customer_id_key"
ON "customer_memberships"("user_id", "customer_id");

CREATE INDEX "customer_memberships_customer_id_idx"
ON "customer_memberships"("customer_id");

ALTER TABLE "customer_memberships"
ADD CONSTRAINT "customer_memberships_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_memberships"
ADD CONSTRAINT "customer_memberships_customer_id_fkey"
FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "users" DROP CONSTRAINT "users_customer_id_fkey";
DROP INDEX "users_customer_id_idx";
ALTER TABLE "users" DROP COLUMN "customer_id";

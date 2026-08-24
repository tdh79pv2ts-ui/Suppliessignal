CREATE TYPE "PocIngestionMode" AS ENUM (
  'INITIAL_FULL_LOAD',
  'DELTA',
  'DAILY_RECONCILIATION'
);

CREATE TYPE "PocIngestionRunStatus" AS ENUM (
  'RUNNING',
  'COMPLETED',
  'PARTIAL',
  'FAILED'
);

CREATE TABLE "poc_ingestion_state" (
  "id" TEXT NOT NULL DEFAULT 'POC_V1',
  "owner_token" UUID,
  "lease_expires_at" TIMESTAMP(3),
  "last_run_started_at" TIMESTAMP(3),
  "last_run_completed_at" TIMESTAMP(3),
  "last_run_status" "PocIngestionRunStatus",
  "last_full_load_at" TIMESTAMP(3),
  "last_successful_delta_at" TIMESTAMP(3),
  "last_full_reconciliation_at" TIMESTAMP(3),
  "pending_backlog" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "poc_ingestion_state_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "poc_ingestion_state_backlog_check" CHECK ("pending_backlog" >= 0)
);

CREATE TABLE "poc_ingestion_runs" (
  "id" UUID NOT NULL,
  "mode" "PocIngestionMode" NOT NULL,
  "status" "PocIngestionRunStatus" NOT NULL DEFAULT 'RUNNING',
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "sources_expected" INTEGER NOT NULL DEFAULT 0,
  "sources_checked" INTEGER NOT NULL DEFAULT 0,
  "sources_collected" INTEGER NOT NULL DEFAULT 0,
  "sources_failed" INTEGER NOT NULL DEFAULT 0,
  "discovery_queries_expected" INTEGER NOT NULL DEFAULT 0,
  "discovery_queries_completed" INTEGER NOT NULL DEFAULT 0,
  "articles_discovered" INTEGER NOT NULL DEFAULT 0,
  "articles_processed" INTEGER NOT NULL DEFAULT 0,
  "articles_failed" INTEGER NOT NULL DEFAULT 0,
  "duplicates_prevented" INTEGER NOT NULL DEFAULT 0,
  "pending_backlog" INTEGER NOT NULL DEFAULT 0,
  "error_code" TEXT,
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "poc_ingestion_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "poc_ingestion_runs_counts_check" CHECK (
    "sources_expected" >= 0 AND "sources_checked" >= 0 AND
    "sources_collected" >= 0 AND "sources_failed" >= 0 AND
    "discovery_queries_expected" >= 0 AND "discovery_queries_completed" >= 0 AND
    "articles_discovered" >= 0 AND "articles_processed" >= 0 AND
    "articles_failed" >= 0 AND "duplicates_prevented" >= 0 AND
    "pending_backlog" >= 0
  )
);

CREATE INDEX "poc_ingestion_runs_started_at_idx"
  ON "poc_ingestion_runs"("started_at");
CREATE INDEX "poc_ingestion_runs_mode_status_completed_at_idx"
  ON "poc_ingestion_runs"("mode", "status", "completed_at");

INSERT INTO "poc_ingestion_state" ("id", "updated_at")
VALUES ('POC_V1', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

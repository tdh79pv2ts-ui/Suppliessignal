CREATE TYPE "PocDatasetStatus" AS ENUM ('DRAFT', 'RUNNING', 'REVIEWING', 'COMPLETED');
CREATE TYPE "PocArticleStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
CREATE TYPE "EvaluationScore" AS ENUM ('CORRECT', 'PARTIALLY_CORRECT', 'INCORRECT', 'NOT_APPLICABLE');
CREATE TYPE "EvaluationFailureReason" AS ENUM ('HALLUCINATION', 'MISINTERPRETATION', 'NEGATION_ERROR', 'FORECAST_OBSERVED_ERROR', 'DATE_ERROR', 'ENTITY_ERROR', 'LOCATION_ERROR', 'CLAIM_TOO_BROAD', 'CLAIM_TOO_FRAGMENTED', 'MISSING_CLAIM', 'IRRELEVANT_CLAIM', 'INSUFFICIENT_ARTICLE_TEXT', 'TRUNCATION', 'SOURCE_AMBIGUITY', 'OTHER');

CREATE UNIQUE INDEX "article_extraction_runs_id_source_article_id_key" ON "article_extraction_runs"("id", "source_article_id");

CREATE TABLE "poc_evaluation_datasets" (
  "id" UUID NOT NULL, "name" TEXT NOT NULL, "description" TEXT,
  "status" "PocDatasetStatus" NOT NULL DEFAULT 'DRAFT', "provider" TEXT, "model" TEXT,
  "prompt_version" TEXT, "schema_version" TEXT, "thresholds" JSONB NOT NULL,
  "minimum_articles_reviewed" INTEGER NOT NULL DEFAULT 100,
  "minimum_claim_review_percent" DECIMAL(5,2) NOT NULL DEFAULT 90,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "poc_evaluation_datasets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "poc_evaluation_datasets_min_articles_check" CHECK ("minimum_articles_reviewed" >= 100),
  CONSTRAINT "poc_evaluation_datasets_min_claim_review_check" CHECK ("minimum_claim_review_percent" >= 90 AND "minimum_claim_review_percent" <= 100)
);
CREATE INDEX "poc_evaluation_datasets_status_created_at_idx" ON "poc_evaluation_datasets"("status", "created_at");

CREATE TABLE "poc_evaluation_articles" (
  "id" UUID NOT NULL, "dataset_id" UUID NOT NULL, "source_article_id" UUID NOT NULL,
  "extraction_run_id" UUID, "status" "PocArticleStatus" NOT NULL DEFAULT 'PENDING',
  "error_code" TEXT, "error_message" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "poc_evaluation_articles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "poc_evaluation_articles_dataset_id_source_article_id_key" ON "poc_evaluation_articles"("dataset_id", "source_article_id");
CREATE INDEX "poc_evaluation_articles_dataset_id_status_idx" ON "poc_evaluation_articles"("dataset_id", "status");
CREATE INDEX "poc_evaluation_articles_extraction_run_id_idx" ON "poc_evaluation_articles"("extraction_run_id");

CREATE TABLE "claim_evaluations" (
  "id" UUID NOT NULL, "dataset_id" UUID NOT NULL, "claim_id" UUID NOT NULL, "reviewer_user_id" UUID NOT NULL,
  "claim_score" "EvaluationScore" NOT NULL, "evidence_score" "EvaluationScore" NOT NULL,
  "entity_score" "EvaluationScore" NOT NULL, "location_score" "EvaluationScore" NOT NULL,
  "date_score" "EvaluationScore" NOT NULL, "assertion_score" "EvaluationScore" NOT NULL,
  "unsupported" BOOLEAN NOT NULL DEFAULT false, "failure_reason" "EvaluationFailureReason", "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "claim_evaluations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "claim_evaluations_dataset_id_claim_id_key" ON "claim_evaluations"("dataset_id", "claim_id");
CREATE INDEX "claim_evaluations_reviewer_user_id_idx" ON "claim_evaluations"("reviewer_user_id");

CREATE TABLE "article_evaluations" (
  "id" UUID NOT NULL, "dataset_article_id" UUID NOT NULL, "reviewer_user_id" UUID NOT NULL,
  "expected_relevant" BOOLEAN NOT NULL, "extracted_relevant" BOOLEAN, "missed_claims" INTEGER NOT NULL DEFAULT 0,
  "missed_claim_notes" TEXT, "notes" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "article_evaluations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "article_evaluations_dataset_article_id_key" ON "article_evaluations"("dataset_article_id");
CREATE INDEX "article_evaluations_reviewer_user_id_idx" ON "article_evaluations"("reviewer_user_id");

ALTER TABLE "poc_evaluation_articles" ADD CONSTRAINT "poc_evaluation_articles_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "poc_evaluation_datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "poc_evaluation_articles" ADD CONSTRAINT "poc_evaluation_articles_source_article_id_fkey" FOREIGN KEY ("source_article_id") REFERENCES "source_articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "poc_evaluation_articles" ADD CONSTRAINT "poc_evaluation_articles_extraction_run_id_source_article_id_fkey" FOREIGN KEY ("extraction_run_id", "source_article_id") REFERENCES "article_extraction_runs"("id", "source_article_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "claim_evaluations" ADD CONSTRAINT "claim_evaluations_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "poc_evaluation_datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "claim_evaluations" ADD CONSTRAINT "claim_evaluations_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "claim_evaluations" ADD CONSTRAINT "claim_evaluations_reviewer_user_id_fkey" FOREIGN KEY ("reviewer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "article_evaluations" ADD CONSTRAINT "article_evaluations_dataset_article_id_fkey" FOREIGN KEY ("dataset_article_id") REFERENCES "poc_evaluation_articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "article_evaluations" ADD CONSTRAINT "article_evaluations_reviewer_user_id_fkey" FOREIGN KEY ("reviewer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

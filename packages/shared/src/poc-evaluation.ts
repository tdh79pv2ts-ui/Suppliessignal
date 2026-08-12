import { z } from 'zod';

export const POC_THRESHOLDS = {
  evidenceAccuracy: 0.99,
  unsupportedRate: 0.02,
  claimCorrectRate: 0.9,
  entityAccuracy: 0.9,
  locationAccuracy: 0.9,
  dateAccuracy: 0.9,
  assertionAccuracy: 0.95,
  extractionFailureRate: 0.02,
  relevancePrecision: 0.9,
  relevanceRecall: 0.85,
} as const;

export const evaluationScoreSchema = z.enum(['CORRECT', 'PARTIALLY_CORRECT', 'INCORRECT', 'NOT_APPLICABLE']);
export const evaluationFailureReasonSchema = z.enum([
  'HALLUCINATION', 'MISINTERPRETATION', 'NEGATION_ERROR', 'FORECAST_OBSERVED_ERROR', 'DATE_ERROR',
  'ENTITY_ERROR', 'LOCATION_ERROR', 'CLAIM_TOO_BROAD', 'CLAIM_TOO_FRAGMENTED', 'MISSING_CLAIM',
  'IRRELEVANT_CLAIM', 'INSUFFICIENT_ARTICLE_TEXT', 'TRUNCATION', 'SOURCE_AMBIGUITY', 'OTHER',
]);
export const pocDatasetIdSchema = z.object({ datasetId: z.string().uuid() });
export const createPocDatasetSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).nullable().optional(),
  minimumArticlesReviewed: z.number().int().min(100).max(1000).default(100),
  minimumClaimReviewPercent: z.number().min(90).max(100).default(90),
});
export const pocDatasetArticlesSchema = z.object({ articleIds: z.array(z.string().uuid()).min(1).max(500) });
export const claimEvaluationSchema = z.object({
  claimScore: evaluationScoreSchema,
  evidenceScore: evaluationScoreSchema,
  entityScore: evaluationScoreSchema,
  locationScore: evaluationScoreSchema,
  dateScore: evaluationScoreSchema,
  assertionScore: evaluationScoreSchema,
  unsupported: z.boolean(),
  failureReason: evaluationFailureReasonSchema.nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
});
export const articleEvaluationSchema = z.object({
  expectedRelevant: z.boolean(),
  missedClaims: z.number().int().min(0).max(1000),
  missedClaimNotes: z.string().trim().max(4000).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
});

export type EvaluationScoreValue = z.infer<typeof evaluationScoreSchema>;
export type PocMetricInput = {
  articles: Array<{ status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'; expectedRelevant?: boolean; extractedRelevant?: boolean | null; missedClaims?: number }>;
  claims: Array<{ claimType: string; confidence: number; source: string; evaluation?: { claimScore: EvaluationScoreValue; evidenceScore: EvaluationScoreValue; entityScore: EvaluationScoreValue; locationScore: EvaluationScoreValue; dateScore: EvaluationScoreValue; assertionScore: EvaluationScoreValue; unsupported: boolean } }>;
  minimumArticlesReviewed: number;
  minimumClaimReviewPercent: number;
};

function accuracy(scores: EvaluationScoreValue[], onlyCorrect = false): number | null {
  const applicable = scores.filter((score) => score !== 'NOT_APPLICABLE');
  if (!applicable.length) return null;
  const value = applicable.reduce((sum, score) => sum + (score === 'CORRECT' ? 1 : onlyCorrect ? 0 : score === 'PARTIALLY_CORRECT' ? 0.5 : 0), 0);
  return value / applicable.length;
}
function ratio(value: number, total: number): number | null { return total ? value / total : null; }

export function calculatePocResults(input: PocMetricInput) {
  const reviewedArticles = input.articles.filter((article) => article.expectedRelevant !== undefined);
  const reviewedClaims = input.claims.filter((claim) => claim.evaluation);
  const tp = reviewedArticles.filter((a) => a.expectedRelevant && a.extractedRelevant).length;
  const fp = reviewedArticles.filter((a) => !a.expectedRelevant && a.extractedRelevant).length;
  const fn = reviewedArticles.filter((a) => a.expectedRelevant && !a.extractedRelevant).length;
  const missed = reviewedArticles.reduce((sum, article) => sum + (article.missedClaims ?? 0), 0);
  const score = (key: keyof NonNullable<PocMetricInput['claims'][number]['evaluation']>) => reviewedClaims.map((c) => c.evaluation![key]).filter((v): v is EvaluationScoreValue => typeof v === 'string');
  const metrics = {
    relevancePrecision: ratio(tp, tp + fp), relevanceRecall: ratio(tp, tp + fn),
    claimCorrectRate: accuracy(score('claimScore'), true),
    claimPartialRate: ratio(reviewedClaims.filter((c) => c.evaluation!.claimScore === 'PARTIALLY_CORRECT').length, reviewedClaims.length),
    claimIncorrectRate: ratio(reviewedClaims.filter((c) => c.evaluation!.claimScore === 'INCORRECT').length, reviewedClaims.length),
    unsupportedRate: ratio(reviewedClaims.filter((c) => c.evaluation!.unsupported).length, reviewedClaims.length),
    evidenceAccuracy: accuracy(score('evidenceScore')), entityAccuracy: accuracy(score('entityScore')),
    locationAccuracy: accuracy(score('locationScore')), dateAccuracy: accuracy(score('dateScore')),
    assertionAccuracy: accuracy(score('assertionScore')),
    missedClaimRate: ratio(missed, input.claims.length + missed),
    extractionFailureRate: ratio(input.articles.filter((a) => a.status === 'FAILED').length, input.articles.length),
  };
  const coverage = { articlesReviewed: reviewedArticles.length, totalArticles: input.articles.length, claimsReviewed: reviewedClaims.length, totalClaims: input.claims.length, claimReviewPercent: input.claims.length ? reviewedClaims.length / input.claims.length * 100 : 0 };
  const enoughCoverage = coverage.articlesReviewed >= input.minimumArticlesReviewed && coverage.claimReviewPercent >= input.minimumClaimReviewPercent;
  const checks = {
    evidenceAccuracy: metrics.evidenceAccuracy !== null && metrics.evidenceAccuracy >= POC_THRESHOLDS.evidenceAccuracy,
    unsupportedRate: metrics.unsupportedRate !== null && metrics.unsupportedRate <= POC_THRESHOLDS.unsupportedRate,
    claimCorrectRate: metrics.claimCorrectRate !== null && metrics.claimCorrectRate >= POC_THRESHOLDS.claimCorrectRate,
    entityAccuracy: metrics.entityAccuracy !== null && metrics.entityAccuracy >= POC_THRESHOLDS.entityAccuracy,
    locationAccuracy: metrics.locationAccuracy !== null && metrics.locationAccuracy >= POC_THRESHOLDS.locationAccuracy,
    dateAccuracy: metrics.dateAccuracy !== null && metrics.dateAccuracy >= POC_THRESHOLDS.dateAccuracy,
    assertionAccuracy: metrics.assertionAccuracy !== null && metrics.assertionAccuracy >= POC_THRESHOLDS.assertionAccuracy,
    extractionFailureRate: metrics.extractionFailureRate !== null && metrics.extractionFailureRate <= POC_THRESHOLDS.extractionFailureRate,
    relevancePrecision: metrics.relevancePrecision !== null && metrics.relevancePrecision >= POC_THRESHOLDS.relevancePrecision,
    relevanceRecall: metrics.relevanceRecall !== null && metrics.relevanceRecall >= POC_THRESHOLDS.relevanceRecall,
  };
  return { coverage, metrics, checks, decision: !enoughCoverage ? 'INCOMPLETE' : Object.values(checks).every(Boolean) ? 'GO' : 'FIX_PHASE_4' } as const;
}

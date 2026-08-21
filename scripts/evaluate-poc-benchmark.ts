import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { db } from '../packages/db/src/index.js';
import { NEWS_RADAR_POLICY_VERSION } from '../apps/api/src/services/news-radar.js';

const rowSchema = z.object({
  articleId: z.string().uuid(),
  expectedRelevant: z.boolean(),
  expectedEntityIds: z.array(z.string().uuid()).default([]),
  expectedRelevanceLevel: z.enum(['HIGH', 'MEDIUM', 'WATCHLIST', 'NONE']),
  expectedReason: z.string().min(1),
});
const datasetSchema = z.object({ customerId: z.string().uuid(), articles: z.array(rowSchema).min(100) });
const path = process.argv[2] ?? 'benchmarks/bsk-news-radar.json';

async function main() {
try {
  const dataset = datasetSchema.parse(JSON.parse(await readFile(path, 'utf8')));
  const exposures = await db.newsRadarExposure.findMany({
    where: { customerId: dataset.customerId, policyVersion: NEWS_RADAR_POLICY_VERSION, sourceArticleId: { in: dataset.articles.map((item) => item.articleId) }, relevanceLevel: { in: ['HIGH', 'MEDIUM'] } },
  });
  const byArticle = new Map<string, typeof exposures>();
  for (const exposure of exposures) (byArticle.get(exposure.sourceArticleId) ?? (byArticle.set(exposure.sourceArticleId, []), byArticle.get(exposure.sourceArticleId)!)).push(exposure);
  let truePositive = 0, falsePositive = 0, trueNegative = 0, falseNegative = 0;
  for (const expected of dataset.articles) {
    const actual = (byArticle.get(expected.articleId)?.length ?? 0) > 0;
    if (expected.expectedRelevant && actual) truePositive++;
    else if (!expected.expectedRelevant && actual) falsePositive++;
    else if (!expected.expectedRelevant) trueNegative++;
    else falseNegative++;
  }
  const precision = truePositive + falsePositive ? truePositive / (truePositive + falsePositive) : 0;
  const recall = truePositive + falseNegative ? truePositive / (truePositive + falseNegative) : 0;
  const falsePositiveRate = falsePositive + trueNegative ? falsePositive / (falsePositive + trueNegative) : 0;
  const falseNegativeRate = falseNegative + truePositive ? falseNegative / (falseNegative + truePositive) : 0;
  console.log(JSON.stringify({ policyVersion: NEWS_RADAR_POLICY_VERSION, articles: dataset.articles.length, truePositive, falsePositive, trueNegative, falseNegative, precision, recall, falsePositiveRate, falseNegativeRate, releaseGate: precision >= 0.95 ? 'PASS' : 'FAIL' }, null, 2));
  if (precision < 0.95) process.exitCode = 1;
} finally {
  await db.$disconnect();
}
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

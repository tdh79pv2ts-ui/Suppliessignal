import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { db } from '../packages/db/src/index.js';
import { NEWS_RADAR_POLICY_VERSION } from '../apps/api/src/services/news-radar.js';
import { NewsRadarService } from '../apps/api/src/services/news-radar.js';

const intelligenceClass = z.enum(['DIRECT', 'POTENTIAL', 'BROADER', 'EXCLUDE']);
type IntelligenceClass = z.infer<typeof intelligenceClass>;

const rowSchema = z.object({
  articleId: z.string().uuid(), title: z.string().min(1), originalUrl: z.string().url(),
  expectedClass: intelligenceClass, expectedEntityType: z.string().nullable(), expectedEntityName: z.string().nullable(),
  expectedTopic: z.string().nullable(), expectedReason: z.string().min(1), reviewStatus: z.literal('HUMAN_REVIEWED'),
});
const datasetSchema = z.object({ articles: z.array(rowSchema).min(200) });
const path = process.argv[2] ?? 'benchmarks/bsk-news-intelligence-golden.json';
const ratio = (numerator: number, denominator: number) => denominator === 0 ? null : numerator / denominator;

async function main() {
  try {
    const dataset = datasetSchema.parse(JSON.parse(await readFile(path, 'utf8')));
    const customer = await db.customer.findFirst({
      where: { name: { equals: 'BSK Fashion', mode: 'insensitive' } },
      select: { id: true },
    });
    if (!customer) throw new Error('BSK Fashion customer is not available');

    // Evaluate the exact customer-scoped read model shown in Intelligence. This
    // prevents global processing metadata from being mistaken for BSK output.
    const intelligence = await new NewsRadarService().intelligence(customer.id);
    const actualByArticle = new Map<string, IntelligenceClass>();
    for (const development of intelligence.developments) {
      for (const evidence of development.evidence) {
        const current = actualByArticle.get(evidence.id);
        if (development.level === 'DIRECT' || current === undefined) {
          actualByArticle.set(evidence.id, development.level);
        } else if (development.level === 'POTENTIAL' && current !== 'DIRECT') {
          actualByArticle.set(evidence.id, development.level);
        }
      }
    }
    const actualClass = (articleId: string): IntelligenceClass => actualByArticle.get(articleId) ?? 'EXCLUDE';
    const classes = intelligenceClass.options;
    const confusion = Object.fromEntries(classes.map((expected) => [expected, Object.fromEntries(classes.map((actual) => [actual, 0]))])) as Record<IntelligenceClass, Record<IntelligenceClass, number>>;
    const failures: Array<{ articleId: string; title: string; expected: IntelligenceClass; actual: IntelligenceClass }> = [];
    for (const row of dataset.articles) {
      const actual = actualClass(row.articleId);
      confusion[row.expectedClass][actual]++;
      if (actual !== row.expectedClass) failures.push({ articleId: row.articleId, title: row.title, expected: row.expectedClass, actual });
    }
    const metrics = Object.fromEntries(classes.map((label) => {
      const truePositive = confusion[label][label];
      const predicted = classes.reduce((sum, expected) => sum + confusion[expected][label], 0);
      const expected = classes.reduce((sum, actual) => sum + confusion[label][actual], 0);
      return [label, { expected, predicted, truePositive, precision: ratio(truePositive, predicted), recall: ratio(truePositive, expected) }];
    })) as Record<IntelligenceClass, { expected: number; predicted: number; truePositive: number; precision: number | null; recall: number | null }>;
    const displayedExpected = dataset.articles.filter((row) => row.expectedClass === 'DIRECT' || row.expectedClass === 'POTENTIAL').length;
    const displayedPredicted = dataset.articles.filter((row) => ['DIRECT', 'POTENTIAL'].includes(actualClass(row.articleId))).length;
    const displayedTruePositive = dataset.articles.filter((row) => ['DIRECT', 'POTENTIAL'].includes(row.expectedClass) && ['DIRECT', 'POTENTIAL'].includes(actualClass(row.articleId))).length;
    const correct = classes.reduce((sum, label) => sum + confusion[label][label], 0);
    const result = {
      policyVersion: NEWS_RADAR_POLICY_VERSION,
      articles: dataset.articles.length,
      distribution: Object.fromEntries(classes.map((label) => [label, metrics[label].expected])),
      confusion, metrics,
      display: { expected: displayedExpected, predicted: displayedPredicted, truePositive: displayedTruePositive, precision: ratio(displayedTruePositive, displayedPredicted), classificationRecall: ratio(displayedTruePositive, displayedExpected) },
      overallAccuracy: correct / dataset.articles.length,
      falsePositives: failures.filter((item) => item.expected === 'EXCLUDE').length,
      falseNegatives: failures.filter((item) => item.expected !== 'EXCLUDE' && item.actual === 'EXCLUDE').length,
      failures,
      releaseGate: displayedPredicted > 0 && ratio(displayedTruePositive, displayedPredicted)! >= 0.95 && metrics.BROADER.precision !== null && metrics.BROADER.precision >= 0.95 ? 'PASS' : 'FAIL',
    };
    console.log(JSON.stringify(result, null, 2));
    if (result.releaseGate !== 'PASS') process.exitCode = 1;
  } finally { await db.$disconnect(); }
}

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });

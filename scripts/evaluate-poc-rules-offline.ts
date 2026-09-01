import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { isBroaderSupplyChainDevelopment } from '../apps/api/src/services/news-radar-matching.js';

const rowSchema = z.object({
  articleId: z.string().uuid(), title: z.string().min(1), expectedClass: z.enum(['DIRECT', 'POTENTIAL', 'BROADER', 'EXCLUDE']),
});
const datasetSchema = z.object({ articles: z.array(rowSchema).length(200) });
const ratio = (numerator: number, denominator: number) => denominator === 0 ? null : numerator / denominator;

async function main() {
  const dataset = datasetSchema.parse(JSON.parse(await readFile(process.argv[2] ?? 'benchmarks/bsk-news-intelligence-golden.json', 'utf8')));
  if (dataset.articles.some((row) => row.expectedClass === 'DIRECT' || row.expectedClass === 'POTENTIAL')) {
    throw new Error('Offline broader-rule evaluation is only valid for a corpus without customer-impact candidates. Use the database-backed benchmark for complete evaluation.');
  }
  const rows = dataset.articles.map((row) => ({
    ...row,
    actualClass: isBroaderSupplyChainDevelopment({ title: row.title }, undefined, {
      customer: { id: 'benchmark-bsk', name: 'BSK Fashion' },
      suppliers: [],
      factories: [
        { id: 'guangzhou', name: 'Guangzhou Bisakai Leather Co., Ltd', city: 'Guangzhou', country: 'China' },
        { id: 'welcombine', name: 'Welcombine Co., Ltd', city: 'Yangon', country: 'Myanmar' },
        { id: 'ylx', name: 'YLX Company Limited', city: 'Yangon', country: 'Myanmar' },
        { id: 'bsk-bangladesh', name: 'BSK Bangladesh', city: 'Cumilla', country: 'Bangladesh' },
      ],
      products: [], materials: [
        { id: 'faux-leather', name: 'Faux leather' }, { id: 'nylon', name: 'Nylon' },
        { id: 'polyester', name: 'Polyester' }, { id: 'pu', name: 'Polyurethane' },
      ], routes: [],
    }) ? 'BROADER' as const : 'EXCLUDE' as const,
  }));
  const truePositive = rows.filter((row) => row.expectedClass === 'BROADER' && row.actualClass === 'BROADER').length;
  const predicted = rows.filter((row) => row.actualClass === 'BROADER').length;
  const expected = rows.filter((row) => row.expectedClass === 'BROADER').length;
  const falsePositives = rows.filter((row) => row.expectedClass === 'EXCLUDE' && row.actualClass === 'BROADER');
  const falseNegatives = rows.filter((row) => row.expectedClass === 'BROADER' && row.actualClass === 'EXCLUDE');
  console.log(JSON.stringify({
    articles: rows.length,
    broader: { expected, predicted, truePositive, precision: ratio(truePositive, predicted), recall: ratio(truePositive, expected) },
    excludeRecall: ratio(rows.filter((row) => row.expectedClass === 'EXCLUDE' && row.actualClass === 'EXCLUDE').length, rows.filter((row) => row.expectedClass === 'EXCLUDE').length),
    falsePositives: falsePositives.map(({ articleId, title }) => ({ articleId, title })),
    falseNegatives: falseNegatives.map(({ articleId, title }) => ({ articleId, title })),
  }, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

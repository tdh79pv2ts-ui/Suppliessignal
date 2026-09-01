import { readFile } from 'node:fs/promises';
import { z } from 'zod';

const classSchema = z.enum(['DIRECT', 'POTENTIAL', 'BROADER']);
const benchmarkSchema = z.object({
  developments: z.array(z.object({
    title: z.string().min(1), url: z.string().url(), expectedClass: classSchema,
    expectedEntity: z.string().min(1), topic: z.string().min(1), localLanguageAvailable: z.boolean(),
  })).min(30),
});
const corpusSchema = z.object({ articles: z.array(z.object({
  id: z.string().uuid(), title: z.string(), originalUrl: z.string().url(), publishedAt: z.string().nullable(),
  source: z.object({ name: z.string() }),
})).min(1) });

function canonicalUrl(value: string) {
  const url = new URL(value);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith('utm_') || ['outputType', 'amp'].includes(key)) url.searchParams.delete(key);
  }
  url.pathname = url.pathname.replace(/\/amp\/?$/, '').replace(/\/$/, '') || '/';
  return url.toString();
}

const ratio = (numerator: number, denominator: number) => denominator === 0 ? null : numerator / denominator;

async function main() {
  const [benchmark, corpus] = await Promise.all([
    readFile(process.argv[2] ?? 'benchmarks/bsk-known-developments.json', 'utf8').then((value) => benchmarkSchema.parse(JSON.parse(value))),
    readFile(process.argv[3] ?? 'benchmarks/bsk-collected-articles.json', 'utf8').then((value) => corpusSchema.parse(JSON.parse(value))),
  ]);
  const byUrl = new Map(corpus.articles.map((article) => [canonicalUrl(article.originalUrl), article]));
  const rows = benchmark.developments.map((development) => {
    const article = byUrl.get(canonicalUrl(development.url));
    return { ...development, discovered: Boolean(article), discoveredBy: article?.source.name ?? null, articleId: article?.id ?? null };
  });
  const byClass = Object.fromEntries(classSchema.options.map((label) => {
    const expected = rows.filter((row) => row.expectedClass === label);
    const discovered = expected.filter((row) => row.discovered);
    return [label, { expected: expected.length, discovered: discovered.length, recall: ratio(discovered.length, expected.length) }];
  }));
  const discovered = rows.filter((row) => row.discovered).length;
  const result = {
    developments: rows.length,
    discovered,
    discoveryRecall: ratio(discovered, rows.length),
    byClass,
    localLanguageOpportunities: rows.filter((row) => row.localLanguageAvailable).length,
    misses: rows.filter((row) => !row.discovered).map((row) => ({ title: row.title, expectedClass: row.expectedClass, url: row.url, likelyCause: 'SOURCE_OR_FEED_RETENTION_GAP' })),
    releaseGate: discovered / rows.length >= 0.9 ? 'PASS' : 'FAIL',
  };
  console.log(JSON.stringify(result, null, 2));
  if (result.releaseGate !== 'PASS') process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

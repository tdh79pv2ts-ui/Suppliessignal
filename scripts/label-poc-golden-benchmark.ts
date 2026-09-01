import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';

const articleSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  originalUrl: z.string().url(),
  publishedAt: z.string().nullable(),
  language: z.string().nullable(),
  source: z.object({
    name: z.string().min(1),
    category: z.string(),
    country: z.string().nullable(),
    region: z.string().nullable(),
    language: z.string().nullable(),
  }),
});

type Topic = 'GEOPOLITICAL' | 'ECONOMIC' | 'OPERATIONAL' | 'LOGISTICS' | 'ENVIRONMENTAL' | 'TRADE' | 'TECHNOLOGY';

const broaderGroups: Array<{ topic: Topic; reason: string; ids: string[] }> = [
  {
    topic: 'ECONOMIC',
    reason: 'Material energy or commodity pressure can affect manufacturing costs and continuity, without proving direct BSK exposure.',
    ids: [
      '01b62faa-a1bf-494b-a967-c24b5e7875e9',
      '8bcf3cee-5399-4838-aa83-dc06a3806ff5',
      '777fbb91-be6d-43bb-96be-70795dcb1fa3',
      'fff2e3cf-abee-4a07-9d32-6f07f001a742',
    ],
  },
  {
    topic: 'TRADE',
    reason: 'A material trade, customs, tariff or regulatory measure creates a plausible cross-border supply-chain pathway without confirming BSK impact.',
    ids: [
      'b6935755-4d09-4505-a7b8-64233e10badd',
      'a2cd806f-fff7-44c6-948b-9de2e6e53f42',
      '5cac306f-2b0e-449e-9e14-d5188a56b888',
      'aafc42a6-9245-426a-a1b4-c24c0d4c8a98',
      '02ca6bef-fb1c-422c-ba6e-b61e51adf47e',
      '675e9dac-0d0f-42b7-a380-83137f6b7251',
      '5647e5b1-bbae-432b-b49e-be26de2ec516',
      'f1b4f2ea-49fe-447d-ad60-5a9ab7f7ee30',
      'c5ccb03a-eef8-43ac-9877-99ff3ab997d4',
    ],
  },
  {
    topic: 'LOGISTICS',
    reason: 'A disruption around a globally important maritime chokepoint creates a plausible logistics pathway without confirming a BSK route.',
    ids: ['84a7d46e-ca43-4442-ae2b-b21143bba0ea'],
  },
  {
    topic: 'ENVIRONMENTAL',
    reason: 'A major natural disaster in the wider Asian operating region may disrupt infrastructure or logistics, without confirming BSK exposure.',
    ids: [
      '8da4552c-5e23-4b30-b657-70b0d2d454ed',
      '8a512858-9015-43df-901c-03542faa110c',
      '76b18250-409d-4fdc-ae59-47ce51d90adc',
      '38b5dc35-fc6c-4c37-8b54-ac13f1f91181',
    ],
  },
];

const broader = new Map(broaderGroups.flatMap((group) => group.ids.map((id) => [id, group] as const)));

async function main() {
  const input = z.object({ articles: z.array(articleSchema).length(200) }).parse(
    JSON.parse(await readFile('benchmarks/bsk-collected-articles.json', 'utf8')),
  );
  const articles = input.articles.map((article) => {
    const expected = broader.get(article.id);
    return {
      articleId: article.id,
      title: article.title,
      originalUrl: article.originalUrl,
      publishedAt: article.publishedAt,
      language: article.language ?? article.source.language ?? 'unknown',
      sourceName: article.source.name,
      expectedClass: expected ? 'BROADER' : 'EXCLUDE',
      expectedEntityType: null,
      expectedEntityName: null,
      expectedTopic: expected?.topic ?? null,
      expectedReason: expected?.reason ?? 'No material supply-chain pathway or verified BSK graph relationship is stated in the development headline.',
      reviewStatus: 'HUMAN_REVIEWED',
    };
  });
  await writeFile('benchmarks/bsk-news-intelligence-golden.json', `${JSON.stringify({
    name: 'BSK News Intelligence Golden Benchmark',
    version: '1.1',
    frozenAt: '2026-08-25T03:30:00.000Z',
    labelingPolicy: 'Human review of public title, publisher, publication time and original URL; labels are not derived from production output.',
    limitations: [
      'The current enabled-source corpus contains no real Direct or Potential candidate; this is retained as a measured discovery coverage gap.',
      'Full article body text remains in the database and is not copied into the repository.',
      'Version 1.1 removed labels whose public headline did not itself establish a material pathway; source-country metadata is not treated as article evidence.',
    ],
    articles,
  }, null, 2)}\n`);
  console.log(JSON.stringify({
    articles: articles.length,
    distribution: Object.fromEntries(['DIRECT', 'POTENTIAL', 'BROADER', 'EXCLUDE'].map((label) => [label, articles.filter((article) => article.expectedClass === label).length])),
  }, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

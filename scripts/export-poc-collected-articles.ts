import { mkdir, writeFile } from 'node:fs/promises';
import { db } from '../packages/db/src/index.js';

async function main() {
  const customer = await db.customer.findFirst({ where: { name: 'BSK Fashion' } });
  if (!customer) throw new Error('BSK Fashion customer not found');
  const articles = await db.sourceArticle.findMany({
    where: { source: { customerPreferences: { some: { customerId: customer.id, enabled: true } } } },
    orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
    include: { source: { select: { name: true, category: true, country: true, region: true, language: true } } },
  });
  await mkdir('benchmarks', { recursive: true });
  await writeFile('benchmarks/bsk-collected-articles.json', `${JSON.stringify({
    exportedAt: new Date().toISOString(),
    articles: articles.map((article) => ({
      id: article.id,
      title: article.title,
      originalUrl: article.originalUrl,
      publishedAt: article.publishedAt,
      language: article.language,
      source: article.source,
    })),
  }, null, 2)}\n`);
  console.log(JSON.stringify({ articles: articles.length }, null, 2));
}

void main().finally(() => db.$disconnect());

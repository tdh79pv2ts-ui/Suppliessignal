import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../../packages/db/src/index';
import { ArticleTranslationService } from '../../apps/api/src/services/article-translation';
import { FakeArticleTranslationProvider } from '../../packages/ai/src/translation';

const raw = process.env.TEST_DATABASE_URL;
if (!raw || raw !== process.env.DATABASE_URL || process.env.NODE_ENV === 'production' || !new URL(raw).pathname.includes('suppliesignal_test_')) {
  throw new Error('Refusing non-disposable translation-backlog integration database');
}

const sourceId = randomUUID();
const articleIds = Array.from({ length: 140 }, () => randomUUID());

describe.sequential('article translation backlog with PostgreSQL', () => {
  beforeAll(async () => {
    await db.source.create({ data: { id: sourceId, name: 'Translation backlog fixture', sourceType: 'MANUAL', baseUrl: 'https://translation-backlog.example.test', category: 'NEWS', reliability: 'HIGH' } });
    await db.sourceArticle.createMany({ data: articleIds.map((id, index) => ({
      id,
      sourceId,
      originalUrl: `https://translation-backlog.example.test/${index}`,
      title: `供应链中断 ${index}`,
      excerpt: `制造业供应链中断 ${index}`,
      language: 'zh',
      contentHash: `translation-content-${id}`,
      urlHash: `translation-url-${id}`,
      status: 'NORMALIZED' as const,
    })) });
  });

  afterAll(async () => {
    await db.sourceArticleTranslation.deleteMany({ where: { sourceArticleId: { in: articleIds } } });
    await db.sourceArticle.deleteMany({ where: { id: { in: articleIds } } });
    await db.source.deleteMany({ where: { id: sourceId } });
  });

  it('moves beyond the first 100 records and drains every required translation', async () => {
    const service = new ArticleTranslationService(new FakeArticleTranslationProvider((input) => ({
      title: `Translated ${input.title}`,
      summary: `Translated ${input.summary}`,
    })));
    await expect(service.translatePending(100)).resolves.toMatchObject({ articlesChecked: 100, translated: 100, pending: 40 });
    await expect(service.translatePending(100)).resolves.toMatchObject({ articlesChecked: 40, translated: 40, pending: 0 });
    expect(await db.sourceArticleTranslation.count({ where: { sourceArticleId: { in: articleIds }, targetLanguage: 'en', status: 'COMPLETED' } })).toBe(140);
  });
});

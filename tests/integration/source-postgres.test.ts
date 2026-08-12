import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { db } from '../../packages/db/src/index';
import {
  FeedCollector,
  IngestionError,
} from '../../packages/ingestion/src/index';
import {
  SourceIntelligenceService,
  sourceHealth,
} from '../../apps/api/src/services/source-intelligence';
const raw = process.env.TEST_DATABASE_URL;
if (
  !raw ||
  raw !== process.env.DATABASE_URL ||
  process.env.NODE_ENV === 'production' ||
  !new URL(raw).pathname.includes('suppliesignal_test_')
)
  throw new Error('Refusing non-disposable source integration database');
const rss = readFileSync(
  new URL('../fixtures/rss.xml', import.meta.url),
  'utf8',
);
afterAll(async () => db.$disconnect());
describe.sequential('source intelligence with PostgreSQL', () => {
  it('persists runs/articles and remains idempotent', async () => {
    const service = new SourceIntelligenceService(
      () => new FeedCollector(async () => rss),
    );
    const source = await service.createSource({
      name: 'Fixture RSS',
      sourceType: 'RSS',
      baseUrl: 'https://public.example/',
      feedUrl: 'https://public.example/feed.xml',
      country: null,
      region: null,
      language: 'en',
      category: 'NEWS',
      reliability: 'HIGH',
      active: true,
      collectionEnabled: true,
      collectionIntervalMinutes: 60,
    });
    const first = await service.collect(source.id);
    const second = await service.collect(source.id);
    expect(first).toMatchObject({
      status: 'PARTIAL',
      itemsDiscovered: 3,
      itemsCreated: 1,
      itemsSkipped: 1,
      itemsFailed: 1,
    });
    expect(second).toMatchObject({ itemsCreated: 0, itemsSkipped: 2 });
    const articles = await db.sourceArticle.findMany({
      where: { sourceId: source.id },
    });
    expect(articles).toHaveLength(1);
    expect(articles[0]).toMatchObject({
      originalUrl: 'https://public.example/articles/1?utm_source=test',
      canonicalUrl: 'https://public.example/articles/1',
      externalId: 'fixture-1',
      status: 'NORMALIZED',
    });
    expect(
      await db.sourceCollectionRun.count({ where: { sourceId: source.id } }),
    ).toBe(2);
    const healthy = await db.source.findUniqueOrThrow({
      where: { id: source.id },
    });
    expect(sourceHealth(healthy)).toBe('HEALTHY');
    const other = await service.createSource({
      name: 'Other publisher',
      sourceType: 'MANUAL',
      baseUrl: 'https://other.example/',
      category: 'NEWS',
      reliability: 'MEDIUM',
      active: true,
      collectionEnabled: false,
    });
    await service.ingestManual({
      sourceId: other.id,
      originalUrl: 'https://other.example/story',
      title: 'Similar story',
      text: articles[0]!.normalizedText!,
    });
    expect(
      await db.sourceArticle.count({
        where: { contentHash: articles[0]!.contentHash },
      }),
    ).toBe(2);
  });
  it('records isolated failure without corrupting articles and blocks disabled sources', async () => {
    const failing = new SourceIntelligenceService(
      () =>
        new FeedCollector(async () => {
          throw new IngestionError('COLLECTION_FAILED', 'Fixture failure');
        }),
    );
    const source = await failing.createSource({
      name: 'Failing RSS',
      sourceType: 'RSS',
      baseUrl: 'https://failure.example/',
      feedUrl: 'https://failure.example/feed',
      category: 'NEWS',
      reliability: 'LOW',
      active: true,
      collectionEnabled: true,
    });
    await expect(failing.collect(source.id)).rejects.toMatchObject({
      code: 'COLLECTION_FAILED',
    });
    const updated = await db.source.findUniqueOrThrow({
      where: { id: source.id },
    });
    expect(updated.consecutiveFailures).toBe(1);
    expect(sourceHealth(updated)).toBe('DEGRADED');
    expect(
      await db.sourceCollectionRun.findFirst({
        where: { sourceId: source.id },
      }),
    ).toMatchObject({ status: 'FAILED', errorCode: 'COLLECTION_FAILED' });
    await db.source.update({
      where: { id: source.id },
      data: { collectionEnabled: false },
    });
    await expect(failing.collect(source.id)).rejects.toMatchObject({
      code: 'SOURCE_DISABLED',
    });
  });
  it('prevents overlapping runs for the same source', async () => {
    let release!: (value: string) => void;
    const pending = new Promise<string>((resolve) => { release = resolve; });
    const service = new SourceIntelligenceService(() => new FeedCollector(() => pending));
    const source = await service.createSource({ name: 'Slow RSS', sourceType: 'RSS', baseUrl: 'https://slow.example/', feedUrl: 'https://slow.example/feed', category: 'NEWS', reliability: 'MEDIUM', active: true, collectionEnabled: true });
    const first = service.collect(source.id);
    await new Promise((resolve) => setTimeout(resolve, 25));
    await expect(service.collect(source.id)).rejects.toMatchObject({ code: 'COLLECTION_ALREADY_RUNNING' });
    release(rss);
    await expect(first).resolves.toMatchObject({ status: 'PARTIAL' });
  });
});

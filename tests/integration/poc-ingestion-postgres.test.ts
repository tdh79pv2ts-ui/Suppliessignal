import crypto from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../packages/db/src/index';
import { PocIngestionCoordinator } from '../../apps/api/src/services/poc-ingestion-coordinator';
import { PocIngestionService } from '../../apps/api/src/services/poc-ingestion';
import { NewsRadarService } from '../../apps/api/src/services/news-radar';
import { SourceIntelligenceService } from '../../apps/api/src/services/source-intelligence';
import { FeedCollector } from '../../packages/ingestion/src/index';

const raw = process.env.TEST_DATABASE_URL;
if (!raw || raw !== process.env.DATABASE_URL || process.env.NODE_ENV === 'production' || !new URL(raw).pathname.includes('suppliesignal_test_')) {
  throw new Error('Refusing non-disposable POC ingestion integration database');
}

const completeResult = (mode: 'INITIAL_FULL_LOAD' | 'DELTA' | 'DAILY_RECONCILIATION') => ({
  mode,
  sourcesExpected: 2,
  sourcesChecked: 2,
  sourcesCollected: 2,
  sourcesFailed: 0,
  sourceFailures: [],
  articlesDiscovered: 3,
  duplicatesPrevented: 1,
  articlesFound: 3,
  articlesProcessed: 3,
  articlesSkipped: 0,
  articleFailures: 0,
  relevanceMatchesCreated: 2,
  articlesTranslated: 1,
  translationFailures: 0,
  translationBacklog: 0,
  relevanceBacklog: 0,
  pendingBacklog: 0,
  batchesProcessed: 1,
  backlogDrained: true,
});

describe.sequential('database-backed POC ingestion coordination', () => {
  beforeEach(async () => {
    await db.pocIngestionRun.deleteMany();
    await db.pocIngestionState.deleteMany();
  });

  afterAll(async () => {
    await db.pocIngestionRun.deleteMany();
    await db.pocIngestionState.deleteMany();
  });

  it('runs initial load, same-day delta and next-day reconciliation deterministically', async () => {
    let now = new Date('2026-08-24T01:00:00Z');
    const runner = { runCycle: vi.fn(async (_batch: number, mode: 'INITIAL_FULL_LOAD' | 'DELTA' | 'DAILY_RECONCILIATION') => completeResult(mode)) };
    const coordinator = new PocIngestionCoordinator(runner as never, () => now);

    await expect(coordinator.run()).resolves.toMatchObject({ mode: 'INITIAL_FULL_LOAD', status: 'COMPLETED' });
    for (let cycle = 1; cycle <= 5; cycle++) {
      now = new Date(`2026-08-24T01:${String(cycle * 5).padStart(2, '0')}:00Z`);
      await expect(coordinator.run()).resolves.toMatchObject({ mode: 'DELTA', status: 'COMPLETED' });
    }
    now = new Date('2026-08-25T00:10:00Z');
    await expect(coordinator.run()).resolves.toMatchObject({ mode: 'DAILY_RECONCILIATION', status: 'COMPLETED' });

    const state = await db.pocIngestionState.findUniqueOrThrow({ where: { id: 'POC_V1' } });
    expect(state).toMatchObject({ pendingBacklog: 0, lastRunStatus: 'COMPLETED' });
    expect(state.lastFullLoadAt?.toISOString()).toBe('2026-08-24T01:00:00.000Z');
    expect(state.lastSuccessfulDeltaAt?.toISOString()).toBe('2026-08-25T00:10:00.000Z');
    expect(state.lastFullReconciliationAt?.toISOString()).toBe('2026-08-25T00:10:00.000Z');
    expect(await db.pocIngestionRun.count({ where: { mode: 'DELTA', status: 'COMPLETED' } })).toBe(5);
  });

  it('allows only one process to own the database lease', async () => {
    let release!: () => void;
    let signalStarted!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { signalStarted = resolve; });
    const runner = { runCycle: vi.fn(async (_batch: number, mode: 'INITIAL_FULL_LOAD' | 'DELTA' | 'DAILY_RECONCILIATION') => {
      signalStarted();
      await blocked;
      return completeResult(mode);
    }) };
    const first = new PocIngestionCoordinator(runner as never, () => new Date('2035-08-24T02:00:00Z'));
    const second = new PocIngestionCoordinator(runner as never, () => new Date('2035-08-24T02:00:01Z'));
    const running = first.run();
    await started;
    try {
      await expect(second.run()).rejects.toMatchObject({ code: 'POC_INGESTION_ALREADY_RUNNING' });
    } finally {
      release();
    }
    await expect(running).resolves.toMatchObject({ status: 'COMPLETED' });
    expect(runner.runCycle).toHaveBeenCalledOnce();
  });

  it('records partial status and never reports a material backlog as current', async () => {
    const runner = { runCycle: vi.fn(async () => ({
      ...completeResult('DELTA'),
      relevanceBacklog: 7,
      pendingBacklog: 7,
      backlogDrained: false,
    })) };
    const coordinator = new PocIngestionCoordinator(runner as never, () => new Date('2026-08-24T03:00:00Z'));
    await expect(coordinator.run(100, 'DELTA')).resolves.toMatchObject({ status: 'PARTIAL', pendingBacklog: 7 });
    await expect(db.pocIngestionState.findUniqueOrThrow({ where: { id: 'POC_V1' } })).resolves.toMatchObject({
      lastRunStatus: 'PARTIAL',
      pendingBacklog: 7,
      lastSuccessfulDeltaAt: null,
    });
  });

  it('never reports a cycle with malformed feed items as current', async () => {
    const runner = { runCycle: vi.fn(async () => ({
      ...completeResult('DELTA'),
      articleFailures: 1,
    })) };
    const coordinator = new PocIngestionCoordinator(runner as never, () => new Date('2026-08-24T04:00:00Z'));
    await expect(coordinator.run(100, 'DELTA')).resolves.toMatchObject({ status: 'PARTIAL', articleFailures: 1 });
    await expect(db.pocIngestionState.findUniqueOrThrow({ where: { id: 'POC_V1' } })).resolves.toMatchObject({
      lastRunStatus: 'PARTIAL',
      pendingBacklog: 0,
      lastSuccessfulDeltaAt: null,
    });
  });

  it('recovers a controlled late item through reconciliation, processing and display', async () => {
    const customer = await db.customer.create({ data: { name: `Reconciliation ${crypto.randomUUID()}` } });
    const factory = await db.factory.create({
      data: {
        customerId: customer.id,
        name: 'Reconciliation Factory One',
        country: 'Bangladesh',
        city: 'Cumilla',
        criticality: 'HIGH',
        sourceName: 'Public factory register',
        sourceUrl: 'https://evidence.example/factory-one',
        verifiedAt: new Date('2026-08-01T00:00:00Z'),
      },
    });
    const emptyFeed = '<?xml version="1.0"?><rss version="2.0"><channel><title>Reconciliation</title></channel></rss>';
    const lateFeed = `<?xml version="1.0"?><rss version="2.0"><channel><title>Reconciliation</title><item><title>Reconciliation Factory One closes after fire</title><link>https://publisher.example/late-factory-fire</link><guid>late-factory-fire</guid><pubDate>Mon, 24 Aug 2026 08:00:00 GMT</pubDate><description>Production stopped after a factory fire.</description></item></channel></rss>`;
    let feed = emptyFeed;
    const sources = new SourceIntelligenceService(() => new FeedCollector(async () => feed));
    const source = await sources.createSource({
      name: `Reconciliation feed ${crypto.randomUUID()}`,
      sourceType: 'RSS',
      baseUrl: 'https://publisher.example/',
      feedUrl: 'https://publisher.example/feed.xml',
      country: 'Bangladesh',
      language: 'en',
      category: 'NEWS',
      reliability: 'HIGH',
      active: true,
      collectionEnabled: true,
      collectionIntervalMinutes: 5,
    });
    await db.customerSourcePreference.create({ data: { customerId: customer.id, sourceId: source.id, enabled: true } });
    const radar = new NewsRadarService();
    const relevance = {
      processPending: async () => {
        const articles = await db.sourceArticle.findMany({ where: { sourceId: source.id } });
        let processed = 0;
        let exposuresCreated = 0;
        for (const article of articles) {
          const result = await radar.processArticle(article.id, [{
            customerId: customer.id,
            graph: { customer, suppliers: [], factories: [factory], products: [], materials: [], routes: [] },
          }]);
          processed++;
          exposuresCreated += result.exposuresCreated;
        }
        return { articlesFound: articles.length, processed, skipped: 0, failed: 0, exposuresCreated, pending: 0 };
      },
    };
    const forced: boolean[] = [];
    const service = new PocIngestionService(
      sources,
      relevance as never,
      () => new Date('2026-08-25T00:10:00Z'),
      { translatePending: async () => ({ articlesChecked: 0, translated: 0, failed: 0, pending: 0, skipped: true }) } as never,
      (async (_now, collect, options) => {
        forced.push(options.force === true);
        const run = await collect(source.id) as { itemsDiscovered: number; itemsCreated: number; itemsSkipped: number; itemsFailed: number };
        return { expected: 1, checked: 1, collected: 1, skipped: 0, failed: 0, failures: [], ...run };
      }) as never,
    );

    await expect(service.runCycle(100, 'DELTA')).resolves.toMatchObject({ articlesDiscovered: 0 });
    expect(await db.sourceArticle.count({ where: { sourceId: source.id } })).toBe(0);

    feed = lateFeed;
    await expect(service.runCycle(100, 'DAILY_RECONCILIATION')).resolves.toMatchObject({
      articlesDiscovered: 1,
      articlesProcessed: 1,
      relevanceMatchesCreated: 1,
      pendingBacklog: 0,
    });
    expect(forced).toEqual([false, true]);
    const intelligence = await radar.intelligence(customer.id);
    expect(intelligence.counts.direct).toBe(1);
    expect(intelligence.developments[0]?.evidence[0]?.url).toBe('https://publisher.example/late-factory-fire');
  });
});

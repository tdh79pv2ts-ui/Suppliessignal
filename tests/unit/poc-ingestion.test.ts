import { describe, expect, it, vi } from 'vitest';
import { PocIngestionService } from '../../apps/api/src/services/poc-ingestion';

describe('BSK POC ingestion cycle', () => {
  it('collects only due sources before processing newly stored articles', async () => {
    const order: string[] = [];
    const collect = vi.fn(async (id: string) => {
      order.push(`collect:${id}`);
      return {} as never;
    });
    const sources = { collect };
    const relevance = {
      processPending: vi.fn(async () => {
        order.push('relevance');
        return { articlesFound: 2, processed: 2, skipped: 0, failed: 0, exposuresCreated: 3 };
      }),
    };
    const translations = { translatePending: vi.fn(async () => {
      order.push('translate');
      return { articlesChecked: 2, translated: 1, failed: 0, skipped: false };
    }) };
    const service = new PocIngestionService(
      sources as never,
      relevance as never,
      () => new Date('2026-08-14T10:00:00Z'),
      translations as never,
      (async (_now, collectSource) => {
        await collectSource('due');
        return { checked: 2, collected: 1, skipped: 1, failed: 0, failures: [] };
      }) as never,
    );

    await expect(service.runCycle()).resolves.toMatchObject({
      mode: 'DELTA',
      sourcesChecked: 2,
      sourcesCollected: 1,
      articlesProcessed: 2,
      relevanceMatchesCreated: 3,
      articlesTranslated: 1,
    });
    expect(collect).toHaveBeenCalledWith('due');
    expect(collect).not.toHaveBeenCalledWith('fresh');
    expect(order).toEqual(['collect:due', 'translate', 'relevance']);
  });

  it('drains translation and relevance work across bounded batches', async () => {
    let translationBatch = 0;
    let relevanceBatch = 0;
    const translations = { translatePending: vi.fn(async () => {
      translationBatch++;
      return translationBatch === 1
        ? { articlesChecked: 100, translated: 100, failed: 0, pending: 40, skipped: false }
        : { articlesChecked: 40, translated: 40, failed: 0, pending: 0, skipped: false };
    }) };
    const relevance = { processPending: vi.fn(async () => {
      relevanceBatch++;
      return relevanceBatch === 1
        ? { articlesFound: 100, processed: 100, skipped: 0, failed: 0, exposuresCreated: 6, pending: 40 }
        : { articlesFound: 40, processed: 40, skipped: 0, failed: 0, exposuresCreated: 2, pending: 0 };
    }) };
    const service = new PocIngestionService(
      { collect: vi.fn() } as never,
      relevance as never,
      undefined,
      translations as never,
      (async () => ({ expected: 0, checked: 0, collected: 0, skipped: 0, failed: 0, itemsDiscovered: 0, itemsCreated: 0, itemsSkipped: 0, itemsFailed: 0, failures: [] })) as never,
    );

    await expect(service.runCycle(100)).resolves.toMatchObject({
      articlesTranslated: 140,
      articlesProcessed: 140,
      relevanceMatchesCreated: 8,
      pendingBacklog: 0,
      backlogDrained: true,
      batchesProcessed: 2,
    });
    expect(translations.translatePending).toHaveBeenCalledTimes(2);
    expect(relevance.processPending).toHaveBeenCalledTimes(2);
  });

  it('forces every enabled source during initial load and daily reconciliation', async () => {
    const collection = vi.fn(async () => ({ expected: 2, checked: 2, collected: 2, skipped: 0, failed: 0, itemsDiscovered: 3, itemsCreated: 2, itemsSkipped: 1, itemsFailed: 0, failures: [] }));
    const service = new PocIngestionService(
      { collect: vi.fn() } as never,
      { processPending: vi.fn(async () => ({ articlesFound: 0, processed: 0, skipped: 0, failed: 0, exposuresCreated: 0, pending: 0 })) } as never,
      undefined,
      { translatePending: vi.fn(async () => ({ articlesChecked: 0, translated: 0, failed: 0, pending: 0, skipped: true })) } as never,
      collection as never,
    );

    const initial = await service.runCycle(100, 'INITIAL_FULL_LOAD');
    const daily = await service.runCycle(100, 'DAILY_RECONCILIATION');
    expect(collection.mock.calls[0]?.[2]).toEqual({ force: true });
    expect(collection.mock.calls[1]?.[2]).toEqual({ force: true });
    expect(initial).toMatchObject({ articlesDiscovered: 2, duplicatesPrevented: 1 });
    expect(daily.mode).toBe('DAILY_RECONCILIATION');
  });

  it('records one source failure and still updates article relevance', async () => {
    const relevance = { processPending: vi.fn(async () => ({ articlesFound: 0, processed: 0, skipped: 0, failed: 0, exposuresCreated: 0 })) };
    const service = new PocIngestionService({ collect: vi.fn() } as never, relevance as never, undefined, undefined,
      (async () => ({ checked: 1, collected: 0, skipped: 0, failed: 1, failures: [{ sourceId: 'broken', message: 'Feed unavailable' }] })) as never);

    const result = await service.runCycle();
    expect(result.sourceFailures).toEqual([{ sourceId: 'broken', message: 'Feed unavailable' }]);
    expect(relevance.processPending).toHaveBeenCalledOnce();
  });

  it('carries malformed feed item failures into cycle completeness', async () => {
    const service = new PocIngestionService(
      { collect: vi.fn() } as never,
      { processPending: vi.fn(async () => ({ articlesFound: 0, processed: 0, skipped: 0, failed: 0, exposuresCreated: 0, pending: 0 })) } as never,
      undefined,
      { translatePending: vi.fn(async () => ({ articlesChecked: 0, translated: 0, failed: 0, pending: 0, skipped: true })) } as never,
      (async () => ({ expected: 1, checked: 1, collected: 1, skipped: 0, failed: 0, itemsDiscovered: 2, itemsCreated: 1, itemsSkipped: 0, itemsFailed: 1, failures: [] })) as never,
    );

    await expect(service.runCycle()).resolves.toMatchObject({
      articleFailures: 1,
      backlogDrained: true,
    });
  });
});

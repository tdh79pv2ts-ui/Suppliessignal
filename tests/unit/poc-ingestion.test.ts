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

  it('records one source failure and still updates article relevance', async () => {
    const relevance = { processPending: vi.fn(async () => ({ articlesFound: 0, processed: 0, skipped: 0, failed: 0, exposuresCreated: 0 })) };
    const service = new PocIngestionService({ collect: vi.fn() } as never, relevance as never, undefined, undefined,
      (async () => ({ checked: 1, collected: 0, skipped: 0, failed: 1, failures: [{ sourceId: 'broken', message: 'Feed unavailable' }] })) as never);

    const result = await service.runCycle();
    expect(result.sourceFailures).toEqual([{ sourceId: 'broken', message: 'Feed unavailable' }]);
    expect(relevance.processPending).toHaveBeenCalledOnce();
  });
});

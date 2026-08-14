import { describe, expect, it, vi } from 'vitest';
import { PocIngestionService } from '../../apps/api/src/services/poc-ingestion';

describe('BSK POC ingestion cycle', () => {
  it('collects only due sources before processing newly stored articles', async () => {
    const order: string[] = [];
    const collect = vi.fn(async (id: string) => {
      order.push(`collect:${id}`);
      return {} as never;
    });
    const sources = {
      listSources: vi.fn(async () => ({
        items: [
          { id: 'due', lastCollectedAt: new Date('2026-08-14T09:54:00Z'), collectionIntervalMinutes: 5 },
          { id: 'fresh', lastCollectedAt: new Date('2026-08-14T09:58:00Z'), collectionIntervalMinutes: 5 },
        ],
      })),
      collect,
    };
    const relevance = {
      processPending: vi.fn(async () => {
        order.push('relevance');
        return { articlesFound: 2, processed: 2, skipped: 0, failed: 0, exposuresCreated: 3 };
      }),
    };
    const service = new PocIngestionService(
      sources as never,
      relevance as never,
      () => new Date('2026-08-14T10:00:00Z'),
    );

    await expect(service.runCycle()).resolves.toMatchObject({
      sourcesChecked: 2,
      sourcesCollected: 1,
      articlesProcessed: 2,
      relevanceMatchesCreated: 3,
    });
    expect(collect).toHaveBeenCalledWith('due');
    expect(collect).not.toHaveBeenCalledWith('fresh');
    expect(order).toEqual(['collect:due', 'relevance']);
  });

  it('records one source failure and still updates article relevance', async () => {
    const relevance = { processPending: vi.fn(async () => ({ articlesFound: 0, processed: 0, skipped: 0, failed: 0, exposuresCreated: 0 })) };
    const service = new PocIngestionService({
      listSources: vi.fn(async () => ({ items: [{ id: 'broken', lastCollectedAt: null, collectionIntervalMinutes: 5 }] })),
      collect: vi.fn(async () => { throw new Error('Feed unavailable'); }),
    } as never, relevance as never);

    const result = await service.runCycle();
    expect(result.sourceFailures).toEqual([{ sourceId: 'broken', message: 'Feed unavailable' }]);
    expect(relevance.processPending).toHaveBeenCalledOnce();
  });
});

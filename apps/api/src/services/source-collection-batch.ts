import { db } from '@suppliesignal/db';
import { sourceIntelligenceService } from './source-intelligence.js';

type CollectionResult = {
  itemsDiscovered?: number;
  itemsCreated?: number;
  itemsSkipped?: number;
  itemsFailed?: number;
};

type CollectSource = (sourceId: string) => Promise<CollectionResult | unknown>;

export type SourceCollectionBatchOptions = {
  force?: boolean;
};

export async function collectDueSources(
  now = new Date(),
  collect: CollectSource = (sourceId) => sourceIntelligenceService.collect(sourceId),
  options: SourceCollectionBatchOptions = {},
) {
  const sources = await db.source.findMany({
    where: {
      active: true,
      collectionEnabled: true,
      sourceType: { in: ['RSS', 'ATOM'] },
      customerPreferences: { some: { enabled: true } },
    },
    orderBy: { id: 'asc' },
  });
  const result = {
    expected: sources.length,
    checked: 0,
    collected: 0,
    skipped: 0,
    failed: 0,
    itemsDiscovered: 0,
    itemsCreated: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
    failures: [] as Array<{ sourceId: string; message: string }>,
  };
  for (const source of sources) {
    const interval = source.collectionIntervalMinutes ?? 15;
    const due = !source.lastCollectedAt || now.getTime() - source.lastCollectedAt.getTime() >= interval * 60_000;
    if (!options.force && !due) {
      result.skipped++;
      continue;
    }
    result.checked++;
    try {
      const collected = await collect(source.id) as CollectionResult | undefined;
      result.collected++;
      result.itemsDiscovered += collected?.itemsDiscovered ?? 0;
      result.itemsCreated += collected?.itemsCreated ?? 0;
      result.itemsSkipped += collected?.itemsSkipped ?? 0;
      result.itemsFailed += collected?.itemsFailed ?? 0;
    } catch (error) {
      result.failed++;
      result.failures.push({ sourceId: source.id, message: error instanceof Error ? error.message : 'Collection failed' });
      console.error(JSON.stringify({ operation: 'source_collection_failure', sourceId: source.id, error: error instanceof Error ? error.message : 'Collection failed' }));
    }
  }
  return result;
}

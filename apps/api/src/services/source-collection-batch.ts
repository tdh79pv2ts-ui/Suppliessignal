import { db } from '@suppliesignal/db';
import { sourceIntelligenceService } from './source-intelligence.js';

type CollectSource = (sourceId: string) => Promise<unknown>;

export async function collectDueSources(
  now = new Date(),
  collect: CollectSource = (sourceId) => sourceIntelligenceService.collect(sourceId),
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
  const result = { checked: sources.length, collected: 0, skipped: 0, failed: 0, failures: [] as Array<{ sourceId: string; message: string }> };
  for (const source of sources) {
    const interval = source.collectionIntervalMinutes ?? 15;
    const due = !source.lastCollectedAt || now.getTime() - source.lastCollectedAt.getTime() >= interval * 60_000;
    if (!due) {
      result.skipped++;
      continue;
    }
    try {
      await collect(source.id);
      result.collected++;
    } catch (error) {
      result.failed++;
      result.failures.push({ sourceId: source.id, message: error instanceof Error ? error.message : 'Collection failed' });
      console.error(JSON.stringify({ operation: 'source_collection_failure', sourceId: source.id, error: error instanceof Error ? error.message : 'Collection failed' }));
    }
  }
  return result;
}

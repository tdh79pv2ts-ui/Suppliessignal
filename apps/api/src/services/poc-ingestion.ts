import { newsRadarService, type NewsRadarService } from './news-radar.js';
import {
  sourceIntelligenceService,
  type SourceIntelligenceService,
} from './source-intelligence.js';

type CollectableSource = {
  id: string;
  lastCollectedAt: Date | null;
  collectionIntervalMinutes: number | null;
};

type SourceDependency = Pick<SourceIntelligenceService, 'collect'> & {
  listSources(filters: Record<string, unknown>): Promise<{
    items: CollectableSource[];
  }>;
};

type RelevanceDependency = Pick<NewsRadarService, 'processPending'>;

export type PocIngestionResult = {
  sourcesChecked: number;
  sourcesCollected: number;
  sourceFailures: Array<{ sourceId: string; message: string }>;
  articlesFound: number;
  articlesProcessed: number;
  articlesSkipped: number;
  articleFailures: number;
  relevanceMatchesCreated: number;
};

export class PocIngestionService {
  constructor(
    private readonly sources: SourceDependency = sourceIntelligenceService,
    private readonly relevance: RelevanceDependency = newsRadarService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async runCycle(batchSize = 100): Promise<PocIngestionResult> {
    const configured = await this.sources.listSources({
      page: 1,
      pageSize: 100,
      active: 'true',
      collectionEnabled: 'true',
    });
    const sourceFailures: PocIngestionResult['sourceFailures'] = [];
    let sourcesCollected = 0;
    const currentTime = this.now().getTime();

    for (const source of configured.items) {
      const intervalMinutes = source.collectionIntervalMinutes ?? 5;
      const due =
        !source.lastCollectedAt ||
        currentTime - source.lastCollectedAt.getTime() >= intervalMinutes * 60_000;
      if (!due) continue;
      try {
        await this.sources.collect(source.id);
        sourcesCollected++;
      } catch (error) {
        sourceFailures.push({
          sourceId: source.id,
          message: error instanceof Error ? error.message : 'Collection failed',
        });
      }
    }

    const processed = await this.relevance.processPending(batchSize);
    return {
      sourcesChecked: configured.items.length,
      sourcesCollected,
      sourceFailures,
      articlesFound: processed.articlesFound,
      articlesProcessed: processed.processed,
      articlesSkipped: processed.skipped,
      articleFailures: processed.failed,
      relevanceMatchesCreated: processed.exposuresCreated,
    };
  }
}

export const pocIngestionService = new PocIngestionService();

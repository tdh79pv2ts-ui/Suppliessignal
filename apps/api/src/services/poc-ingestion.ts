import { newsRadarService, type NewsRadarService } from './news-radar.js';
import {
  sourceIntelligenceService,
  type SourceIntelligenceService,
} from './source-intelligence.js';
import { articleTranslationService, type ArticleTranslationService } from './article-translation.js';
import { collectDueSources } from './source-collection-batch.js';

type SourceDependency = Pick<SourceIntelligenceService, 'collect'>;

type RelevanceDependency = Pick<NewsRadarService, 'processPending'>;
type TranslationDependency = Pick<ArticleTranslationService, 'translatePending'>;
type DueSourceCollector = typeof collectDueSources;

export type PocIngestionResult = {
  mode: 'INITIAL_FULL_LOAD' | 'DELTA' | 'DAILY_RECONCILIATION';
  sourcesExpected: number;
  sourcesChecked: number;
  sourcesCollected: number;
  sourcesFailed: number;
  sourceFailures: Array<{ sourceId: string; message: string }>;
  articlesDiscovered: number;
  duplicatesPrevented: number;
  articlesFound: number;
  articlesProcessed: number;
  articlesSkipped: number;
  articleFailures: number;
  relevanceMatchesCreated: number;
  articlesTranslated: number;
  translationFailures: number;
  translationBacklog: number;
  relevanceBacklog: number;
  pendingBacklog: number;
  batchesProcessed: number;
  backlogDrained: boolean;
};

export class PocIngestionService {
  constructor(
    private readonly sources: SourceDependency = sourceIntelligenceService,
    private readonly relevance: RelevanceDependency = newsRadarService,
    private readonly now: () => Date = () => new Date(),
    private readonly translations: TranslationDependency = articleTranslationService,
    private readonly collectDue: DueSourceCollector = collectDueSources,
  ) {}

  async runCycle(
    batchSize = 100,
    mode: PocIngestionResult['mode'] = 'DELTA',
    maxBatches = 1_000,
  ): Promise<PocIngestionResult> {
    // The database-backed scheduler is authoritative: a source is eligible only
    // when at least one customer preference explicitly enables it.
    const collection = await this.collectDue(
      this.now(),
      (sourceId) => this.sources.collect(sourceId),
      { force: mode !== 'DELTA' },
    );

    let articlesTranslated = 0;
    let translationFailures = 0;
    let translationBacklog = 0;
    let relevanceBacklog = 0;
    let articlesFound = 0;
    let articlesProcessed = 0;
    let articlesSkipped = 0;
    let articleFailures = 0;
    let relevanceMatchesCreated = 0;
    let batchesProcessed = 0;

    for (let batch = 0; batch < maxBatches; batch++) {
      const translated = await this.translations.translatePending(batchSize);
      articlesTranslated += translated.translated;
      translationFailures += translated.failed;
      translationBacklog = translated.pending ?? 0;
      if (translated.skipped || translated.articlesChecked === 0 || translationBacklog === 0 || (translated.translated === 0 && translated.failed > 0)) break;
    }

    for (let batch = 0; batch < maxBatches; batch++) {
      const processed = await this.relevance.processPending(batchSize);
      batchesProcessed++;
      articlesFound += processed.articlesFound;
      articlesProcessed += processed.processed;
      articlesSkipped += processed.skipped;
      articleFailures += processed.failed;
      relevanceMatchesCreated += processed.exposuresCreated;
      relevanceBacklog = processed.pending ?? 0;
      if (processed.articlesFound === 0 || relevanceBacklog === 0 || (processed.processed === 0 && processed.skipped + processed.failed > 0)) break;
    }
    const pendingBacklog = translationBacklog + relevanceBacklog;
    return {
      mode,
      sourcesExpected: collection.expected ?? collection.checked,
      sourcesChecked: collection.checked,
      sourcesCollected: collection.collected,
      sourcesFailed: collection.failed,
      sourceFailures: collection.failures,
      articlesDiscovered: collection.itemsCreated ?? 0,
      duplicatesPrevented: collection.itemsSkipped ?? 0,
      articlesFound,
      articlesProcessed,
      articlesSkipped,
      articleFailures,
      relevanceMatchesCreated,
      articlesTranslated,
      translationFailures,
      translationBacklog,
      relevanceBacklog,
      pendingBacklog,
      batchesProcessed,
      backlogDrained: pendingBacklog === 0,
    };
  }
}

export const pocIngestionService = new PocIngestionService();

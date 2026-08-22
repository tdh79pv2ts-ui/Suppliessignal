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
  sourcesChecked: number;
  sourcesCollected: number;
  sourceFailures: Array<{ sourceId: string; message: string }>;
  articlesFound: number;
  articlesProcessed: number;
  articlesSkipped: number;
  articleFailures: number;
  relevanceMatchesCreated: number;
  articlesTranslated: number;
  translationFailures: number;
};

export class PocIngestionService {
  constructor(
    private readonly sources: SourceDependency = sourceIntelligenceService,
    private readonly relevance: RelevanceDependency = newsRadarService,
    private readonly now: () => Date = () => new Date(),
    private readonly translations: TranslationDependency = articleTranslationService,
    private readonly collectDue: DueSourceCollector = collectDueSources,
  ) {}

  async runCycle(batchSize = 100): Promise<PocIngestionResult> {
    // The database-backed scheduler is authoritative: a source is eligible only
    // when at least one customer preference explicitly enables it.
    const collection = await this.collectDue(this.now(), (sourceId) => this.sources.collect(sourceId));

    const translated = await this.translations.translatePending(batchSize);
    const processed = await this.relevance.processPending(batchSize);
    return {
      sourcesChecked: collection.checked,
      sourcesCollected: collection.collected,
      sourceFailures: collection.failures,
      articlesFound: processed.articlesFound,
      articlesProcessed: processed.processed,
      articlesSkipped: processed.skipped,
      articleFailures: processed.failed,
      relevanceMatchesCreated: processed.exposuresCreated,
      articlesTranslated: translated.translated,
      translationFailures: translated.failed,
    };
  }
}

export const pocIngestionService = new PocIngestionService();

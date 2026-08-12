import { Prisma, db, type Source } from '@suppliesignal/db';
import {
  FeedCollector,
  IngestionError,
  articleHashes,
  normalizeText,
  normalizeUrl,
  type CollectedItem,
} from '@suppliesignal/ingestion';
import type { ManualArticleInput, SourceInput } from '@suppliesignal/shared';
import { ServiceError } from './errors.js';

type Page = { page: number; pageSize: number };
const activeRuns = new Set<string>();
const maximumConcurrentCollections = 3;
const pagination = (page: number, pageSize: number, total: number) => ({
  page,
  pageSize,
  total,
  totalPages: Math.ceil(total / pageSize),
});
export const sourceHealth = (
  source: Pick<
    Source,
    | 'active'
    | 'collectionEnabled'
    | 'consecutiveFailures'
    | 'lastSuccessfulCollectionAt'
  >,
) =>
  !source.active || !source.collectionEnabled
    ? 'DISABLED'
    : source.consecutiveFailures >= 3
      ? 'FAILING'
      : source.consecutiveFailures > 0
        ? 'DEGRADED'
        : source.lastSuccessfulCollectionAt
          ? 'HEALTHY'
          : 'DEGRADED';

export class SourceIntelligenceService {
  constructor(
    private readonly collectorFactory: () => FeedCollector = () =>
      new FeedCollector(),
  ) {}
  async metrics() {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const [sources, articlesToday, failedRunsToday, skippedToday] =
      await Promise.all([
        db.source.findMany(),
        db.sourceArticle.count({ where: { collectedAt: { gte: today } } }),
        db.sourceCollectionRun.count({
          where: { startedAt: { gte: today }, status: 'FAILED' },
        }),
        db.sourceCollectionRun.aggregate({
          where: { startedAt: { gte: today } },
          _sum: { itemsSkipped: true },
        }),
      ]);
    return {
      sourcesConfigured: sources.length,
      sourcesHealthy: sources.filter(
        (source) => sourceHealth(source) === 'HEALTHY',
      ).length,
      articlesCollectedToday: articlesToday,
      collectionFailuresToday: failedRunsToday,
      duplicatesSkippedToday: skippedToday._sum.itemsSkipped ?? 0,
    };
  }
  async listSources(f: Page & Record<string, unknown>) {
    const bool = (v: unknown) =>
      v === 'all' || v === undefined ? undefined : v === 'true';
    const active = bool(f.active);
    const collectionEnabled = bool(f.collectionEnabled);
    const where: Prisma.SourceWhereInput = {
      ...(typeof active === 'boolean' ? { active } : {}),
      ...(typeof collectionEnabled === 'boolean' ? { collectionEnabled } : {}),
      ...(f.sourceType ? { sourceType: f.sourceType as never } : {}),
      ...(f.category ? { category: f.category as never } : {}),
      ...(f.reliability ? { reliability: f.reliability as never } : {}),
      ...(f.country ? { country: f.country as string } : {}),
      ...(f.search
        ? { name: { contains: f.search as string, mode: 'insensitive' } }
        : {}),
    };
    const [rows, total] = await db.$transaction([
      db.source.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (f.page - 1) * f.pageSize,
        take: f.pageSize,
        include: {
          collectionRuns: { take: 1, orderBy: { startedAt: 'desc' } },
        },
      }),
      db.source.count({ where }),
    ]);
    const items = rows
      .map((source) => ({ ...source, health: sourceHealth(source) }))
      .filter((source) => !f.health || source.health === f.health);
    return { items, pagination: pagination(f.page, f.pageSize, total) };
  }
  async getSource(id: string) {
    const source = await db.source.findUnique({
      where: { id },
      include: {
        collectionRuns: { take: 20, orderBy: { startedAt: 'desc' } },
        articles: { take: 20, orderBy: { collectedAt: 'desc' } },
      },
    });
    if (!source)
      throw new ServiceError('SOURCE_NOT_FOUND', 'Source not found', 404);
    return { ...source, health: sourceHealth(source) };
  }
  createSource(data: SourceInput) {
    return db.source.create({
      data: {
        ...data,
        baseUrl: normalizeUrl(data.baseUrl),
        feedUrl: data.feedUrl ? normalizeUrl(data.feedUrl) : null,
      } as Prisma.SourceUncheckedCreateInput,
    });
  }
  async updateSource(id: string, data: Record<string, unknown>) {
    await this.getSource(id);
    const next = {
      ...data,
      ...(typeof data.baseUrl === 'string'
        ? { baseUrl: normalizeUrl(data.baseUrl) }
        : {}),
      ...(typeof data.feedUrl === 'string'
        ? { feedUrl: normalizeUrl(data.feedUrl) }
        : {}),
    };
    return db.source.update({ where: { id }, data: next });
  }
  async listRuns(sourceId: string, f: Page) {
    await this.getSource(sourceId);
    const [items, total] = await db.$transaction([
      db.sourceCollectionRun.findMany({
        where: { sourceId },
        orderBy: { startedAt: 'desc' },
        skip: (f.page - 1) * f.pageSize,
        take: f.pageSize,
      }),
      db.sourceCollectionRun.count({ where: { sourceId } }),
    ]);
    return { items, pagination: pagination(f.page, f.pageSize, total) };
  }
  async listArticles(f: Page & Record<string, unknown>) {
    const where: Prisma.SourceArticleWhereInput = {
      ...(f.sourceId ? { sourceId: f.sourceId as string } : {}),
      ...(f.language ? { language: f.language as string } : {}),
      ...(f.status ? { status: f.status as never } : {}),
      ...(f.search
        ? { title: { contains: f.search as string, mode: 'insensitive' } }
        : {}),
      ...(f.publishedFrom || f.publishedTo
        ? {
            publishedAt: {
              ...(f.publishedFrom ? { gte: f.publishedFrom as Date } : {}),
              ...(f.publishedTo ? { lte: f.publishedTo as Date } : {}),
            },
          }
        : {}),
      ...(f.collectedFrom || f.collectedTo
        ? {
            collectedAt: {
              ...(f.collectedFrom ? { gte: f.collectedFrom as Date } : {}),
              ...(f.collectedTo ? { lte: f.collectedTo as Date } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await db.$transaction([
      db.sourceArticle.findMany({
        where,
        include: { source: true },
        orderBy: { collectedAt: 'desc' },
        skip: (f.page - 1) * f.pageSize,
        take: f.pageSize,
      }),
      db.sourceArticle.count({ where }),
    ]);
    return { items, pagination: pagination(f.page, f.pageSize, total) };
  }
  async getArticle(id: string) {
    const article = await db.sourceArticle.findUnique({
      where: { id },
      include: { source: true },
    });
    if (!article)
      throw new ServiceError('ARTICLE_NOT_FOUND', 'Article not found', 404);
    return article;
  }
  async ingestManual(input: ManualArticleInput) {
    const source = await this.getSource(input.sourceId);
    return this.persistItem(source, {
      title: input.title,
      originalUrl: input.originalUrl,
      ...(input.author ? { author: input.author } : {}),
      ...(input.publishedAt
        ? { publishedAt: new Date(input.publishedAt) }
        : {}),
      ...(input.text ? { rawText: input.text } : {}),
      ...(input.language ? { language: input.language } : {}),
    });
  }
  async collect(sourceId: string) {
    if (activeRuns.has(sourceId))
      throw new ServiceError(
        'COLLECTION_ALREADY_RUNNING',
        'Collection is already running',
        409,
      );
    if (activeRuns.size >= maximumConcurrentCollections)
      throw new ServiceError(
        'COLLECTION_FAILED',
        'Global collection concurrency limit reached',
        429,
      );
    const source = await db.source.findUnique({ where: { id: sourceId } });
    if (!source)
      throw new ServiceError('SOURCE_NOT_FOUND', 'Source not found', 404);
    if (!source.active || !source.collectionEnabled)
      throw new ServiceError(
        'SOURCE_DISABLED',
        'Source collection is disabled',
        409,
      );
    if (!['RSS', 'ATOM'].includes(source.sourceType))
      throw new ServiceError(
        'UNSUPPORTED_SOURCE_TYPE',
        'Automated collector is not implemented for this source type',
        400,
      );
    activeRuns.add(sourceId);
    const run = await db.sourceCollectionRun.create({
      data: { sourceId, collectorType: source.sourceType },
    });
    const started = Date.now();
    try {
      const result = await this.collectorFactory().collect(source);
      let created = 0,
        skipped = 0,
        failed = result.failedItems;
      for (const item of result.items) {
        try {
          const persisted = await this.persistItem(source, item);
          if (persisted.created) created++;
          else skipped++;
        } catch {
          failed++;
        }
      }
      const status = failed > 0 ? 'PARTIAL' : 'SUCCESS';
      const completed = await db.sourceCollectionRun.update({
        where: { id: run.id },
        data: {
          completedAt: new Date(),
          status,
          itemsDiscovered: result.items.length + result.failedItems,
          itemsCreated: created,
          itemsSkipped: skipped,
          itemsFailed: failed,
        },
      });
      await db.source.update({
        where: { id: sourceId },
        data: {
          lastCollectedAt: new Date(),
          lastSuccessfulCollectionAt: new Date(),
          consecutiveFailures: 0,
        },
      });
      console.info(
        JSON.stringify({
          operation: 'source_collection',
          sourceId,
          collectionRunId: run.id,
          collectorType: source.sourceType,
          duration: Date.now() - started,
          itemsDiscovered: completed.itemsDiscovered,
          itemsCreated: created,
          itemsSkipped: skipped,
          itemsFailed: failed,
        }),
      );
      return completed;
    } catch (error) {
      const safe =
        error instanceof IngestionError
          ? error
          : new IngestionError('COLLECTION_FAILED', 'Collection failed');
      await db.sourceCollectionRun.update({
        where: { id: run.id },
        data: {
          completedAt: new Date(),
          status: 'FAILED',
          errorCode: safe.code,
          errorMessage: safe.message.slice(0, 500),
        },
      });
      await db.source.update({
        where: { id: sourceId },
        data: {
          lastCollectedAt: new Date(),
          lastFailureAt: new Date(),
          consecutiveFailures: { increment: 1 },
        },
      });
      throw new ServiceError(safe.code, safe.message, 502);
    } finally {
      activeRuns.delete(sourceId);
    }
  }
  private async persistItem(
    source: Pick<Source, 'id' | 'baseUrl' | 'language'>,
    item: CollectedItem,
  ) {
    const normalizedText = normalizeText(item.rawText ?? item.excerpt);
    const hashes = articleHashes(
      item.originalUrl,
      normalizedText,
      source.baseUrl,
    );
    const duplicate = await db.sourceArticle.findFirst({
      where: {
        sourceId: source.id,
        OR: [
          ...(item.externalId ? [{ externalId: item.externalId }] : []),
          { urlHash: hashes.urlHash },
          ...(normalizedText ? [{ contentHash: hashes.contentHash }] : []),
        ],
      },
    });
    if (duplicate) return { created: false, article: duplicate };
    try {
      const article = await db.sourceArticle.create({
        data: {
          sourceId: source.id,
          originalUrl: item.originalUrl,
          canonicalUrl: hashes.canonicalUrl,
          externalId: item.externalId,
          title: item.title,
          author: item.author,
          publishedAt: item.publishedAt,
          language: item.language ?? source.language,
          rawText: item.rawText,
          normalizedText: normalizedText || null,
          excerpt: item.excerpt,
          contentHash: hashes.contentHash,
          urlHash: hashes.urlHash,
          status: normalizedText ? 'NORMALIZED' : 'COLLECTED',
        } as Prisma.SourceArticleUncheckedCreateInput,
      });
      return { created: true, article };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const article = await db.sourceArticle.findFirstOrThrow({
          where: {
            sourceId: source.id,
            OR: [
              { urlHash: hashes.urlHash },
              ...(item.externalId ? [{ externalId: item.externalId }] : []),
            ],
          },
        });
        return { created: false, article };
      }
      throw error;
    }
  }
}
export const sourceIntelligenceService = new SourceIntelligenceService();

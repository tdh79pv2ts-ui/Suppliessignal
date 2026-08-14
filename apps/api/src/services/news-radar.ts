import crypto from 'node:crypto';
import { Prisma, db, type NewsRadarTopic } from '@suppliesignal/db';
import type { NewsRadarListInput } from '@suppliesignal/shared';
import { ServiceError } from './errors.js';
import { sourceHealth } from './source-intelligence.js';
import { buildRegionalProfile, sourceRecommendation } from './regional-source-profile.js';
import {
  matchArticleToSupplyChain,
  type NewsRadarGraph,
  type NewsRadarMatch,
} from './news-radar-matching.js';

const LEASE_MS = 2 * 60 * 1000;

const exposureInclude = {
  sourceArticle: { include: { source: true } },
  supplier: true,
  factory: { include: { supplier: true } },
  product: true,
  material: true,
  route: true,
  routePort: { include: { route: true, port: true } },
} satisfies Prisma.NewsRadarExposureInclude;

function matchData(customerId: string, articleId: string, match: NewsRadarMatch) {
  return {
    customerId,
    sourceArticleId: articleId,
    matchKey: match.matchKey,
    entityType: match.entityType,
    topic: match.topic,
    matchMethod: match.matchMethod,
    confidence: new Prisma.Decimal(match.confidence),
    reason: match.reason,
    matchedTerms: match.matchedTerms,
    pathSnapshot: match.pathSnapshot,
    supplierId: match.supplierId ?? null,
    factoryId: match.factoryId ?? null,
    productId: match.productId ?? null,
    materialId: match.materialId ?? null,
    routeId: match.routeId ?? null,
    routePortRouteId: match.routePortRouteId ?? null,
    portId: match.portId ?? null,
  } satisfies Prisma.NewsRadarExposureUncheckedCreateInput;
}

export class NewsRadarService {
  async monitoringProfile(customerId: string) {
    const graph = await this.graph(customerId);
    const [companies, locations, sources] = await Promise.all([
      db.company.findMany({ where: { customerId, active: true } }),
      db.location.findMany({ where: { customerId, active: true } }),
      db.source.findMany({ where: { active: true } }),
    ]);
    const profile = buildRegionalProfile({ customerId, companies, locations, ...graph });
    return {
      ...profile,
      generatedAt: new Date(),
      terms: {
        suppliers: graph.suppliers.flatMap((item) => [item.name, item.legalName].filter((value): value is string => Boolean(value))),
        factories: graph.factories.flatMap((item) => [item.name, item.city, item.country].filter((value): value is string => Boolean(value))),
        products: graph.products.map((item) => item.name),
        materials: graph.materials.flatMap((item) => [item.name, item.commodity].filter((value): value is string => Boolean(value))),
        routes: graph.routes.flatMap((item) => [item.name, `${item.originLabel} ${item.destinationLabel}`]),
        ports: graph.routes.flatMap((item) => item.routePorts?.flatMap((routePort) => [routePort.port.name, routePort.port.portCode].filter((value): value is string => Boolean(value))) ?? []),
        countries: [...new Set([...graph.suppliers.map((item) => item.country), ...graph.factories.map((item) => item.country), ...graph.routes.flatMap((item) => item.routePorts?.map((routePort) => routePort.port.country) ?? [])].filter((value): value is string => Boolean(value)))].sort(),
      },
      sourceRecommendations: sources
        .map((source) => ({ source, recommendation: sourceRecommendation(profile, source) }))
        .filter((item): item is typeof item & { recommendation: NonNullable<typeof item.recommendation> } => Boolean(item.recommendation))
        .sort((a, b) => a.recommendation.priority - b.recommendation.priority || a.source.name.localeCompare(b.source.name))
        .map(({ source, recommendation }) => ({ sourceId: source.id, name: source.name, ...recommendation })),
    };
  }

  async dashboard(customerId: string) {
    const [graph, matches, articleCount, articlesToday, latestRun, allSources, recentRuns, companies, locations] = await Promise.all([
      this.graph(customerId),
      db.newsRadarExposure.findMany({ where: { customerId }, include: exposureInclude, orderBy: { sourceArticle: { discoveredAt: 'desc' } }, take: 100 }),
      db.newsRadarExposure.findMany({ where: { customerId }, distinct: ['sourceArticleId'], select: { sourceArticleId: true } }),
      db.newsRadarExposure.findMany({
        where: { customerId, sourceArticle: { discoveredAt: { gte: new Date(new Date().setUTCHours(0, 0, 0, 0)) } } },
        distinct: ['sourceArticleId'], select: { sourceArticleId: true },
      }),
      db.sourceCollectionRun.findFirst({ orderBy: { startedAt: 'desc' }, include: { source: { select: { name: true } } } }),
      db.source.findMany({ where: { active: true }, include: { collectionRuns: { take: 1, orderBy: { startedAt: 'desc' } }, _count: { select: { articles: true } } }, orderBy: { name: 'asc' } }),
      db.sourceCollectionRun.findMany({ take: 8, orderBy: { startedAt: 'desc' }, include: { source: { select: { name: true } } } }),
      db.company.findMany({ where: { customerId, active: true } }),
      db.location.findMany({ where: { customerId, active: true } }),
    ]);
    const monitoringProfile = buildRegionalProfile({ customerId, companies, locations, ...graph });
    const sources = allSources
      .map((source) => ({ source, recommendation: sourceRecommendation(monitoringProfile, source) }))
      .filter((item): item is typeof item & { recommendation: NonNullable<typeof item.recommendation> } => Boolean(item.recommendation))
      .sort((a, b) => a.recommendation.priority - b.recommendation.priority || a.source.name.localeCompare(b.source.name));
    const relevantArticles = groupRelevantArticles(matches);
    return {
      customer: graph.customer,
      counts: {
        suppliers: graph.suppliers.length,
        factories: graph.factories.length,
        countries: new Set([...graph.suppliers.map((value) => value.country), ...graph.factories.map((value) => value.country)]).size,
        products: graph.products.length,
        materials: graph.materials.length,
        routes: graph.routes.length,
        relevantArticlesToday: articlesToday.length,
        relevantArticles: articleCount.length,
      },
      latestCollection: latestRun,
      monitoringProfile,
      sources: sources.map(({ source, recommendation }) => ({ id: source.id, name: source.name, type: source.sourceType, url: source.feedUrl ?? source.baseUrl, country: source.country, region: source.region, industry: source.industry, category: source.category, language: source.language, lastChecked: source.lastCollectedAt, lastSuccessfulSync: source.lastSuccessfulCollectionAt, status: sourceHealth(source), articleCount: source._count.articles, recommendation, lastRun: source.collectionRuns[0] ?? null })),
      recentUpdates: recentRuns,
      articles: relevantArticles,
    };
  }

  async listRelevantArticles(customerId: string) {
    const matches = await db.newsRadarExposure.findMany({ where: { customerId }, include: exposureInclude, orderBy: { sourceArticle: { discoveredAt: 'desc' } }, take: 500 });
    return { items: groupRelevantArticles(matches) };
  }

  async listExposures(customerId: string, input: NewsRadarListInput) {
    const where: Prisma.NewsRadarExposureWhereInput = {
      customerId,
      ...(input.topic ? { topic: input.topic } : {}),
      ...(input.entityType ? { entityType: input.entityType } : {}),
      ...(input.search ? { OR: [
        { reason: { contains: input.search, mode: 'insensitive' } },
        { sourceArticle: { title: { contains: input.search, mode: 'insensitive' } } },
      ] } : {}),
    };
    const [items, total] = await db.$transaction([
      db.newsRadarExposure.findMany({ where, include: exposureInclude, orderBy: { createdAt: 'desc' }, skip: (input.page - 1) * input.pageSize, take: input.pageSize }),
      db.newsRadarExposure.count({ where }),
    ]);
    return { items, pagination: { page: input.page, pageSize: input.pageSize, total, totalPages: Math.ceil(total / input.pageSize) } };
  }

  async getExposure(customerId: string, exposureId: string) {
    const exposure = await db.newsRadarExposure.findFirst({ where: { id: exposureId, customerId }, include: exposureInclude });
    if (!exposure) throw new ServiceError('NEWS_RADAR_EXPOSURE_NOT_FOUND', 'News radar exposure not found', 404);
    return exposure;
  }

  async processArticle(articleId: string) {
    const ownerToken = crypto.randomUUID();
    const leaseExpiresAt = new Date(Date.now() + LEASE_MS);
    const claimed = await db.$queryRaw<Array<{ source_article_id: string }>>(Prisma.sql`
      INSERT INTO "news_radar_article_processing" (
        "source_article_id", "status", "owner_token", "lease_expires_at",
        "attempt_count", "topics", "detected_terms", "detected_locations", "updated_at"
      ) VALUES (
        ${articleId}::uuid, 'RUNNING', ${ownerToken}::uuid, ${leaseExpiresAt},
        1, ARRAY[]::"NewsRadarTopic"[], ARRAY[]::text[], ARRAY[]::text[], NOW()
      )
      ON CONFLICT ("source_article_id") DO UPDATE SET
        "status" = 'RUNNING', "owner_token" = EXCLUDED."owner_token",
        "lease_expires_at" = EXCLUDED."lease_expires_at",
        "attempt_count" = "news_radar_article_processing"."attempt_count" + 1,
        "completed_at" = NULL, "error_code" = NULL, "error_message" = NULL,
        "updated_at" = NOW()
      WHERE "news_radar_article_processing"."status" = 'FAILED'
         OR ("news_radar_article_processing"."status" = 'RUNNING'
             AND "news_radar_article_processing"."lease_expires_at" < NOW())
      RETURNING "source_article_id"
    `);
    if (claimed.length === 0) {
      const state = await db.newsRadarArticleProcessing.findUnique({ where: { sourceArticleId: articleId }, select: { status: true } });
      throw new ServiceError(state?.status === 'COMPLETED' ? 'NEWS_RADAR_ALREADY_PROCESSED' : 'NEWS_RADAR_ALREADY_RUNNING', 'Article radar processing is already complete or active', 409);
    }
    try {
      const article = await db.sourceArticle.findUnique({ where: { id: articleId }, include: { source: true } });
      if (!article) throw new ServiceError('ARTICLE_NOT_FOUND', 'Source article not found', 404);
      const customers = await db.customer.findMany({ select: { id: true } });
      const topics = new Set<NewsRadarTopic>();
      const terms = new Set<string>();
      const locations = new Set<string>();
      let exposuresCreated = 0;
      for (const customer of customers) {
        const result = matchArticleToSupplyChain({ ...article, country: article.country ?? article.source.country, region: article.region ?? article.source.region }, await this.graph(customer.id));
        result.topics.forEach((value) => topics.add(value));
        result.detectedTerms.forEach((value) => terms.add(value));
        result.detectedLocations.forEach((value) => locations.add(value));
        for (const match of result.matches) {
          const data = matchData(customer.id, articleId, match);
          const existing = await db.newsRadarExposure.findUnique({ where: { customerId_sourceArticleId_matchKey: { customerId: customer.id, sourceArticleId: articleId, matchKey: match.matchKey } }, select: { id: true } });
          await db.newsRadarExposure.upsert({
            where: { customerId_sourceArticleId_matchKey: { customerId: customer.id, sourceArticleId: articleId, matchKey: match.matchKey } },
            create: data,
            update: { topic: data.topic, matchMethod: data.matchMethod, confidence: data.confidence, reason: data.reason, matchedTerms: data.matchedTerms, pathSnapshot: data.pathSnapshot },
          });
          if (!existing) exposuresCreated++;
        }
      }
      await db.newsRadarArticleProcessing.update({ where: { sourceArticleId: articleId }, data: { status: 'COMPLETED', completedAt: new Date(), leaseExpiresAt: new Date(), topics: [...topics], detectedTerms: [...terms].sort(), detectedLocations: [...locations].sort() } });
      return { articleId, exposuresCreated, topics: [...topics], detectedTerms: [...terms], detectedLocations: [...locations] };
    } catch (error) {
      await db.newsRadarArticleProcessing.update({ where: { sourceArticleId: articleId }, data: { status: 'FAILED', leaseExpiresAt: new Date(), errorCode: error instanceof ServiceError ? error.code : 'NEWS_RADAR_PROCESSING_FAILED', errorMessage: (error instanceof Error ? error.message : 'News radar processing failed').slice(0, 500) } }).catch(() => undefined);
      throw error;
    }
  }

  async processPending(limit = 20) {
    const articles = await db.sourceArticle.findMany({
      where: { OR: [
        { newsRadarProcessing: null },
        { newsRadarProcessing: { status: 'FAILED' } },
        { newsRadarProcessing: { status: 'RUNNING', leaseExpiresAt: { lt: new Date() } } },
      ] },
      select: { id: true }, orderBy: { discoveredAt: 'asc' }, take: Math.min(100, Math.max(1, limit)),
    });
    const result = { articlesFound: articles.length, processed: 0, skipped: 0, failed: 0, exposuresCreated: 0 };
    for (const article of articles) {
      try {
        const processed = await this.processArticle(article.id);
        result.processed++; result.exposuresCreated += processed.exposuresCreated;
      } catch (error) {
        if (error instanceof ServiceError && ['NEWS_RADAR_ALREADY_RUNNING', 'NEWS_RADAR_ALREADY_PROCESSED'].includes(error.code)) result.skipped++;
        else result.failed++;
      }
    }
    return result;
  }

  private async graph(customerId: string): Promise<NewsRadarGraph> {
    const customer = await db.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true } });
    if (!customer) throw new ServiceError('CUSTOMER_NOT_FOUND', 'Customer not found', 404);
    const [suppliers, factories, products, materials, routes] = await Promise.all([
      db.supplier.findMany({ where: { customerId, active: true }, orderBy: { id: 'asc' } }),
      db.factory.findMany({ where: { customerId, active: true }, include: { supplier: true }, orderBy: { id: 'asc' } }),
      db.product.findMany({ where: { customerId, active: true }, orderBy: { id: 'asc' } }),
      db.material.findMany({ where: { customerId, active: true }, include: { productMaterials: { include: { product: true } } }, orderBy: { id: 'asc' } }),
      db.route.findMany({ where: { customerId, active: true }, include: { routePorts: { include: { port: true }, orderBy: { sequence: 'asc' } } }, orderBy: { id: 'asc' } }),
    ]);
    return { customer, suppliers, factories, products, materials, routes };
  }
}

type ExposureRow = Prisma.NewsRadarExposureGetPayload<{ include: typeof exposureInclude }>;
function groupRelevantArticles(rows: ExposureRow[]) {
  const grouped = new Map<string, { id: string; title: string; summary: string | null; url: string; publishedAt: Date | null; discoveredAt: Date; category: string; country: string | null; region: string | null; language: string | null; source: { name: string; status: string }; relatedSuppliers: string[]; relatedFactories: string[]; relatedProducts: string[]; relatedMaterials: string[]; relatedCountries: string[]; relatedLocations: string[]; reasons: string[] }>();
  for (const row of rows) {
    const existing = grouped.get(row.sourceArticleId) ?? {
      id: row.sourceArticle.id, title: row.sourceArticle.title, summary: row.sourceArticle.excerpt ?? row.sourceArticle.normalizedText?.slice(0, 500) ?? null,
      url: row.sourceArticle.originalUrl, publishedAt: row.sourceArticle.publishedAt, discoveredAt: row.sourceArticle.discoveredAt,
      category: row.sourceArticle.source.category, source: { name: row.sourceArticle.source.name, status: row.sourceArticle.status },
      country: row.sourceArticle.country ?? row.sourceArticle.source.country, region: row.sourceArticle.region ?? row.sourceArticle.source.region, language: row.sourceArticle.language,
      relatedSuppliers: [], relatedFactories: [], relatedProducts: [], relatedMaterials: [], relatedCountries: [], relatedLocations: [], reasons: [],
    };
    if (row.supplier && !existing.relatedSuppliers.includes(row.supplier.name)) existing.relatedSuppliers.push(row.supplier.name);
    if (row.factory && !existing.relatedFactories.includes(row.factory.name)) existing.relatedFactories.push(row.factory.name);
    if (row.factory?.country && !existing.relatedCountries.includes(row.factory.country)) existing.relatedCountries.push(row.factory.country);
    if (row.factory?.city && !existing.relatedLocations.includes(row.factory.city)) existing.relatedLocations.push(row.factory.city);
    if (row.product && !existing.relatedProducts.includes(row.product.name)) existing.relatedProducts.push(row.product.name);
    if (row.material && !existing.relatedMaterials.includes(row.material.name)) existing.relatedMaterials.push(row.material.name);
    if (!existing.reasons.includes(row.reason)) existing.reasons.push(row.reason);
    grouped.set(row.sourceArticleId, existing);
  }
  return [...grouped.values()].sort((a, b) => (b.publishedAt ?? b.discoveredAt).getTime() - (a.publishedAt ?? a.discoveredAt).getTime());
}

export const newsRadarService = new NewsRadarService();

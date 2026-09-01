import crypto from 'node:crypto';
import { Prisma, db, type NewsRadarTopic } from '@suppliesignal/db';
import type { NewsRadarListInput } from '@suppliesignal/shared';
import { ServiceError } from './errors.js';
import { sourceHealth } from './source-intelligence.js';
import { buildRegionalProfile, sourceRecommendation } from './regional-source-profile.js';
import { monitoringProfileService } from './monitoring-profile.js';
import { buildIntelligenceView, type IntelligenceArticleInput } from './intelligence-view.js';
import {
  isBroaderSupplyChainDevelopment,
  matchArticleToSupplyChain,
  type NewsRadarGraph,
  type NewsRadarMatch,
} from './news-radar-matching.js';

const LEASE_MS = 2 * 60 * 1000;
export const NEWS_RADAR_POLICY_VERSION = '3.5';

const exposureInclude = {
  sourceArticle: { include: { source: true, translations: { where: { status: 'COMPLETED' as const } } } },
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
    policyVersion: NEWS_RADAR_POLICY_VERSION,
    entityType: match.entityType,
    topic: match.topic,
    matchMethod: match.matchMethod,
    confidence: new Prisma.Decimal(match.confidence),
    relevanceLevel: match.relevanceLevel,
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
      db.source.findMany(),
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

  async dashboard(customerId: string, preferredLanguage = 'en') {
    const [graph, matches, articleCount, articlesToday, latestRun, allSources, recentRuns, companies, locations] = await Promise.all([
      this.graph(customerId),
      db.newsRadarExposure.findMany({ where: { customerId, policyVersion: NEWS_RADAR_POLICY_VERSION, relevanceLevel: { in: ['HIGH', 'MEDIUM'] } }, include: exposureInclude, orderBy: { sourceArticle: { discoveredAt: 'desc' } }, take: 100 }),
      db.newsRadarExposure.findMany({ where: { customerId, policyVersion: NEWS_RADAR_POLICY_VERSION, relevanceLevel: { in: ['HIGH', 'MEDIUM'] } }, distinct: ['sourceArticleId'], select: { sourceArticleId: true } }),
      db.newsRadarExposure.findMany({
        where: { customerId, policyVersion: NEWS_RADAR_POLICY_VERSION, relevanceLevel: { in: ['HIGH', 'MEDIUM'] }, sourceArticle: { discoveredAt: { gte: new Date(new Date().setUTCHours(0, 0, 0, 0)) } } },
        distinct: ['sourceArticleId'], select: { sourceArticleId: true },
      }),
      db.sourceCollectionRun.findFirst({ orderBy: { startedAt: 'desc' }, include: { source: { select: { name: true } } } }),
      db.source.findMany({ include: { customerPreferences: { where: { customerId }, select: { enabled: true } }, collectionRuns: { take: 1, orderBy: { startedAt: 'desc' } }, _count: { select: { articles: true } } }, orderBy: { name: 'asc' } }),
      db.sourceCollectionRun.findMany({ take: 8, orderBy: { startedAt: 'desc' }, include: { source: { select: { name: true } } } }),
      db.company.findMany({ where: { customerId, active: true } }),
      db.location.findMany({ where: { customerId, active: true } }),
    ]);
    const monitoringProfile = buildRegionalProfile({ customerId, companies, locations, ...graph });
    const sources = allSources
      .map((source) => ({ source, recommendation: sourceRecommendation(monitoringProfile, source) }))
      .filter((item): item is typeof item & { recommendation: NonNullable<typeof item.recommendation> } => Boolean(item.recommendation))
      .sort((a, b) => a.recommendation.priority - b.recommendation.priority || a.source.name.localeCompare(b.source.name));
    const relevantArticles = groupRelevantArticles(matches, preferredLanguage);
    const intelligence = await this.intelligenceFromMatches(customerId, preferredLanguage, matches);
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
      sources: sources.map(({ source, recommendation }) => ({ id: source.id, name: source.name, type: source.sourceType, url: source.feedUrl ?? source.baseUrl, country: source.country, region: source.region, industry: source.industry, category: source.category, language: source.language, lastChecked: source.lastCollectedAt, lastSuccessfulSync: source.lastSuccessfulCollectionAt, status: source.customerPreferences[0]?.enabled === false ? 'DISABLED' : sourceStatus(source), health: sourceHealth(source), articleCount: source._count.articles, recommendation, lastRun: source.collectionRuns[0] ?? null })),
      recentUpdates: recentRuns,
      articles: relevantArticles,
      intelligence,
    };
  }

  async listRelevantArticles(customerId: string, preferredLanguage = 'en') {
    const matches = await db.newsRadarExposure.findMany({ where: { customerId, policyVersion: NEWS_RADAR_POLICY_VERSION, relevanceLevel: { in: ['HIGH', 'MEDIUM'] } }, include: exposureInclude, orderBy: { sourceArticle: { discoveredAt: 'desc' } }, take: 500 });
    return { items: groupRelevantArticles(matches, preferredLanguage) };
  }

  async intelligence(customerId: string, preferredLanguage = 'en') {
    const matches = await db.newsRadarExposure.findMany({
      where: { customerId, policyVersion: NEWS_RADAR_POLICY_VERSION, relevanceLevel: { in: ['HIGH', 'MEDIUM'] } },
      include: exposureInclude,
      orderBy: { sourceArticle: { discoveredAt: 'desc' } },
      take: 500,
    });
    return this.intelligenceFromMatches(customerId, preferredLanguage, matches);
  }

  private async intelligenceFromMatches(customerId: string, preferredLanguage: string, matches: ExposureRow[]) {
    const [enabledPreferences, broaderProcessing, graph] = await Promise.all([
      db.customerSourcePreference.findMany({ where: { customerId, enabled: true }, select: { sourceId: true } }),
      db.newsRadarArticleProcessing.findMany({
        where: { status: 'COMPLETED', policyVersion: NEWS_RADAR_POLICY_VERSION, sourceArticle: { source: { active: true } } },
        include: { sourceArticle: { include: { source: true, translations: { where: { status: 'COMPLETED' } } } } },
        orderBy: { sourceArticle: { discoveredAt: 'desc' } },
        take: 250,
      }),
      this.graph(customerId),
    ]);
    const directAndPotential = groupRelevantArticles(matches, preferredLanguage);
    const matchedArticleIds = new Set(directAndPotential.map((item) => item.id));
    const enabledSourceIds = new Set(enabledPreferences.map((item) => item.sourceId));
    const broader: IntelligenceArticleInput[] = broaderProcessing
      .filter((processing) => {
        if (!enabledSourceIds.has(processing.sourceArticle.sourceId) || matchedArticleIds.has(processing.sourceArticleId)) return false;
        const article = processing.sourceArticle;
        const english = article.translations.find((value) => value.targetLanguage === 'en');
        return isBroaderSupplyChainDevelopment({
          title: article.title,
          excerpt: article.excerpt,
          normalizedText: article.normalizedText,
          translatedTitle: english?.translatedTitle ?? null,
          translatedSummary: english?.translatedSummary ?? null,
        }, undefined, graph);
      })
      .map((processing) => {
        const article = processing.sourceArticle;
        const translation = article.translations.find((value) => value.targetLanguage === preferredLanguage);
        const originalSummary = article.excerpt ?? article.normalizedText?.slice(0, 500) ?? null;
        return {
          id: article.id,
          title: translation?.translatedTitle ?? article.title,
          summary: translation?.translatedSummary ?? originalSummary,
          originalTitle: article.title,
          originalSummary,
          translated: Boolean(translation),
          relevance: 'LOW' as const,
          url: article.originalUrl,
          publishedAt: article.publishedAt,
          discoveredAt: article.discoveredAt,
          topic: processing.topics[0] ?? 'OPERATIONAL',
          category: article.category ?? article.source.category,
          country: article.country ?? article.source.country,
          region: article.region ?? article.source.region,
          language: article.language,
          source: { name: article.source.name, status: article.status },
          relatedSuppliers: [], relatedFactories: [], relatedProducts: [], relatedMaterials: [],
          relatedCountries: [], relatedLocations: [], reasons: [],
        };
      });
    return buildIntelligenceView([...directAndPotential, ...broader]);
  }

  async listExposures(customerId: string, input: NewsRadarListInput) {
    const where: Prisma.NewsRadarExposureWhereInput = {
      customerId,
      policyVersion: NEWS_RADAR_POLICY_VERSION,
      relevanceLevel: { in: ['HIGH', 'MEDIUM'] },
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
    const exposure = await db.newsRadarExposure.findFirst({ where: { id: exposureId, customerId, policyVersion: NEWS_RADAR_POLICY_VERSION, relevanceLevel: { in: ['HIGH', 'MEDIUM'] } }, include: exposureInclude });
    if (!exposure) throw new ServiceError('NEWS_RADAR_EXPOSURE_NOT_FOUND', 'News radar exposure not found', 404);
    return exposure;
  }

  async processArticle(articleId: string, customerGraphs?: Array<{ customerId: string; graph: NewsRadarGraph }>) {
    const ownerToken = crypto.randomUUID();
    const leaseExpiresAt = new Date(Date.now() + LEASE_MS);
    const claimed = await db.$queryRaw<Array<{ source_article_id: string }>>(Prisma.sql`
      INSERT INTO "news_radar_article_processing" (
        "source_article_id", "status", "policy_version", "owner_token", "lease_expires_at",
        "attempt_count", "topics", "detected_terms", "detected_locations", "updated_at"
      ) VALUES (
        ${articleId}::uuid, 'RUNNING', ${NEWS_RADAR_POLICY_VERSION}, ${ownerToken}::uuid, ${leaseExpiresAt},
        1, ARRAY[]::"NewsRadarTopic"[], ARRAY[]::text[], ARRAY[]::text[], NOW()
      )
      ON CONFLICT ("source_article_id") DO UPDATE SET
        "status" = 'RUNNING', "policy_version" = EXCLUDED."policy_version", "owner_token" = EXCLUDED."owner_token",
        "lease_expires_at" = EXCLUDED."lease_expires_at",
        "attempt_count" = "news_radar_article_processing"."attempt_count" + 1,
        "completed_at" = NULL, "error_code" = NULL, "error_message" = NULL,
        "updated_at" = NOW()
      WHERE "news_radar_article_processing"."status" = 'FAILED'
         OR "news_radar_article_processing"."policy_version" <> ${NEWS_RADAR_POLICY_VERSION}
         OR ("news_radar_article_processing"."status" = 'RUNNING'
             AND "news_radar_article_processing"."lease_expires_at" < NOW())
      RETURNING "source_article_id"
    `);
    if (claimed.length === 0) {
      const state = await db.newsRadarArticleProcessing.findUnique({ where: { sourceArticleId: articleId }, select: { status: true } });
      throw new ServiceError(state?.status === 'COMPLETED' ? 'NEWS_RADAR_ALREADY_PROCESSED' : 'NEWS_RADAR_ALREADY_RUNNING', 'Article radar processing is already complete or active', 409);
    }
    try {
      const article = await db.sourceArticle.findUnique({ where: { id: articleId }, include: { source: true, translations: { where: { targetLanguage: 'en', status: 'COMPLETED' } } } });
      if (!article) throw new ServiceError('ARTICLE_NOT_FOUND', 'Source article not found', 404);
      const graphs = customerGraphs ?? await this.customerGraphs();
      const topics = new Set<NewsRadarTopic>();
      const terms = new Set<string>();
      const locations = new Set<string>();
      let exposuresCreated = 0;
      for (const { customerId, graph } of graphs) {
        const sourcePreference = await db.customerSourcePreference.findUnique({
          where: { customerId_sourceId: { customerId, sourceId: article.sourceId } },
          select: { enabled: true },
        });
        if (sourcePreference?.enabled === false) continue;
        const english = article.translations[0];
        const result = matchArticleToSupplyChain({
          title: article.title,
          excerpt: article.excerpt,
          normalizedText: article.normalizedText,
          translatedTitle: english?.translatedTitle ?? null,
          translatedSummary: english?.translatedSummary ?? null,
        }, graph);
        const hasCustomerImpact = result.matches.some((match) => match.relevanceLevel === 'HIGH' || match.relevanceLevel === 'MEDIUM');
        if (hasCustomerImpact || isBroaderSupplyChainDevelopment({
          title: article.title,
          excerpt: article.excerpt,
          normalizedText: article.normalizedText,
          translatedTitle: english?.translatedTitle ?? null,
          translatedSummary: english?.translatedSummary ?? null,
        }, result.topics, graph)) result.topics.forEach((value) => topics.add(value));
        result.detectedTerms.forEach((value) => terms.add(value));
        result.detectedLocations.forEach((value) => locations.add(value));
        for (const match of result.matches) {
          const data = matchData(customerId, articleId, match);
          const key = { customerId, sourceArticleId: articleId, matchKey: match.matchKey, policyVersion: NEWS_RADAR_POLICY_VERSION };
          const existing = await db.newsRadarExposure.findUnique({ where: { customerId_sourceArticleId_matchKey_policyVersion: key }, select: { id: true } });
          await db.newsRadarExposure.upsert({
            where: { customerId_sourceArticleId_matchKey_policyVersion: key },
            create: data,
            update: { topic: data.topic, matchMethod: data.matchMethod, confidence: data.confidence, relevanceLevel: data.relevanceLevel, reason: data.reason, matchedTerms: data.matchedTerms, pathSnapshot: data.pathSnapshot },
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
      where: this.pendingWhere(),
      select: { id: true }, orderBy: { discoveredAt: 'asc' }, take: Math.min(100, Math.max(1, limit)),
    });
    const customerGraphs = articles.length > 0 ? await this.customerGraphs() : [];
    const result = { articlesFound: articles.length, processed: 0, skipped: 0, failed: 0, exposuresCreated: 0 };
    for (const article of articles) {
      try {
        const processed = await this.processArticle(article.id, customerGraphs);
        result.processed++; result.exposuresCreated += processed.exposuresCreated;
      } catch (error) {
        if (error instanceof ServiceError && ['NEWS_RADAR_ALREADY_RUNNING', 'NEWS_RADAR_ALREADY_PROCESSED'].includes(error.code)) result.skipped++;
        else result.failed++;
      }
    }
    return { ...result, pending: await this.pendingCount() };
  }

  pendingCount() {
    return db.sourceArticle.count({ where: this.pendingWhere() });
  }

  private pendingWhere(): Prisma.SourceArticleWhereInput {
    return { OR: [
      { newsRadarProcessing: null },
      { newsRadarProcessing: { policyVersion: { not: NEWS_RADAR_POLICY_VERSION } } },
      { newsRadarProcessing: { status: 'FAILED' } },
      { newsRadarProcessing: { status: 'RUNNING', leaseExpiresAt: { lt: new Date() } } },
    ] };
  }

  private async customerGraphs() {
    const customers = await db.customer.findMany({ select: { id: true } });
    const graphs = await Promise.all(customers.map(async ({ id }) => {
      try {
        const [graph, monitoringTags] = await Promise.all([this.graph(id), monitoringProfileService.activeTags(id)]);
        return { customerId: id, graph: { ...graph, monitoringTags } };
      } catch (error) {
        // A customer can be removed after the initial list read. That tenant no
        // longer needs processing and must not abort every remaining customer.
        if (error instanceof ServiceError && error.code === 'CUSTOMER_NOT_FOUND') return null;
        throw error;
      }
    }));
    return graphs.filter((value): value is NonNullable<typeof value> => value !== null);
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
function groupRelevantArticles(rows: ExposureRow[], preferredLanguage = 'en'): IntelligenceArticleInput[] {
  const grouped = new Map<string, IntelligenceArticleInput>();
  for (const row of rows) {
    const originalSummary = row.sourceArticle.excerpt ?? row.sourceArticle.normalizedText?.slice(0, 500) ?? null;
    const translation = row.sourceArticle.translations.find((value) => value.targetLanguage === preferredLanguage);
    const existing = grouped.get(row.sourceArticleId) ?? {
      id: row.sourceArticle.id, title: translation?.translatedTitle ?? row.sourceArticle.title, summary: translation?.translatedSummary ?? originalSummary,
      originalTitle: row.sourceArticle.title, originalSummary, translated: Boolean(translation), relevance: row.relevanceLevel as 'HIGH' | 'MEDIUM',
      url: row.sourceArticle.originalUrl, publishedAt: row.sourceArticle.publishedAt, discoveredAt: row.sourceArticle.discoveredAt,
      category: row.sourceArticle.source.category, source: { name: row.sourceArticle.source.name, status: row.sourceArticle.status },
      topic: row.topic,
      country: row.sourceArticle.country ?? row.sourceArticle.source.country, region: row.sourceArticle.region ?? row.sourceArticle.source.region, language: row.sourceArticle.language,
      relatedSuppliers: [], relatedFactories: [], relatedProducts: [], relatedMaterials: [], relatedCountries: [], relatedLocations: [], reasons: [],
    };
    if (row.relevanceLevel === 'HIGH') existing.relevance = 'HIGH';
    if (!existing.topic) existing.topic = row.topic;
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

function sourceStatus(source: Parameters<typeof sourceHealth>[0]) {
  if (!source.active || !source.collectionEnabled) return 'DISABLED';
  return source.consecutiveFailures > 0 ? 'ERROR' : 'ACTIVE';
}

export const newsRadarService = new NewsRadarService();

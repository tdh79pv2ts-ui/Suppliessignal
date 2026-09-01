import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../../packages/db/src/index';
import { NewsRadarService } from '../../apps/api/src/services/news-radar';
import { DailyBriefService } from '../../apps/api/src/services/daily-brief';
import { ArticleTranslationService } from '../../apps/api/src/services/article-translation';
import { FakeArticleTranslationProvider } from '../../packages/ai/src/translation';
import { FakeEmailProvider } from '../../apps/api/src/services/email';
import type { NewsRadarGraph } from '../../apps/api/src/services/news-radar-matching';

const service = new NewsRadarService();
const briefService = new DailyBriefService();
const email = new FakeEmailProvider();
const deliveryBriefService = new DailyBriefService(email, 'briefs@example.test');
const ids = { customerA: randomUUID(), customerB: randomUUID(), user: randomUUID(), supplier: randomUUID(), source: randomUUID(), article: randomUUID(), irrelevantArticle: randomUUID(), foreignArticle: randomUUID(), broaderArticle: randomUUID(), tenantBroaderArticle: randomUUID() };
const isolatedCustomerGraph: NewsRadarGraph = {
  customer: { id: ids.customerA, name: 'Radar Customer A' },
  suppliers: [{ id: ids.supplier, name: 'Distinct Components Group', country: 'Vietnam', city: 'Hanoi' }],
  factories: [],
  products: [],
  materials: [],
  routes: [],
};

describe.sequential('news radar with PostgreSQL', () => {
  beforeAll(async () => {
    await db.customer.createMany({ data: [{ id: ids.customerA, name: 'Radar Customer A' }, { id: ids.customerB, name: 'Radar Customer B' }] });
    await db.user.create({ data: { id: ids.user, email: `${ids.user}@example.test`, role: 'CUSTOMER' } });
    await db.customerMembership.create({ data: { userId: ids.user, customerId: ids.customerA } });
    await db.supplier.create({ data: { id: ids.supplier, customerId: ids.customerA, name: 'Distinct Components Group', country: 'Vietnam', city: 'Hanoi', tier: 'TIER_1', criticality: 'HIGH' } });
    await db.source.create({ data: { id: ids.source, name: 'Radar fixture source', sourceType: 'MANUAL', baseUrl: 'https://radar.example.test', category: 'NEWS', reliability: 'HIGH' } });
    await db.customerSourcePreference.create({ data: { customerId: ids.customerA, sourceId: ids.source, enabled: true, recommended: true } });
    await db.sourceArticle.create({ data: { id: ids.article, sourceId: ids.source, originalUrl: 'https://radar.example.test/fire', title: 'Fire disrupts Distinct Components Group production in Vietnam', normalizedText: 'Fire disrupts Distinct Components Group production in Vietnam.', contentHash: `content-${ids.article}`, urlHash: `url-${ids.article}`, status: 'NORMALIZED' } });
    await db.sourceArticle.create({ data: { id: ids.irrelevantArticle, sourceId: ids.source, originalUrl: 'https://radar.example.test/unrelated', title: 'Sports club wins a local final', normalizedText: 'A sports club won its local final.', contentHash: `content-${ids.irrelevantArticle}`, urlHash: `url-${ids.irrelevantArticle}`, status: 'NORMALIZED' } });
    await db.sourceArticle.create({ data: { id: ids.foreignArticle, sourceId: ids.source, originalUrl: 'https://radar.example.test/zh-fire', title: '越南工厂发生火灾', excerpt: '生产中断。', language: 'zh', contentHash: `content-${ids.foreignArticle}`, urlHash: `url-${ids.foreignArticle}`, status: 'NORMALIZED' } });
    await db.sourceArticle.create({ data: { id: ids.broaderArticle, sourceId: ids.source, originalUrl: 'https://radar.example.test/red-sea', title: 'War disrupts Red Sea shipping routes and energy prices', normalizedText: 'Conflict delays global shipping and raises energy prices.', contentHash: `content-${ids.broaderArticle}`, urlHash: `url-${ids.broaderArticle}`, status: 'NORMALIZED' } });
    await db.sourceArticle.create({ data: { id: ids.tenantBroaderArticle, sourceId: ids.source, originalUrl: 'https://radar.example.test/vietnam-exports', title: 'Tariffs disrupt exports from Vietnam', normalizedText: 'Tariffs disrupt exports from Vietnam.', contentHash: `content-${ids.tenantBroaderArticle}`, urlHash: `url-${ids.tenantBroaderArticle}`, status: 'NORMALIZED' } });
  });
  afterAll(async () => {
    await db.dailyBriefDelivery.deleteMany({ where: { customerId: { in: [ids.customerA, ids.customerB] } } });
    await db.dailyBrief.deleteMany({ where: { customerId: { in: [ids.customerA, ids.customerB] } } });
    await db.dailyBriefPreference.deleteMany({ where: { userId: ids.user } });
    await db.newsRadarExposure.deleteMany({ where: { sourceArticleId: { in: [ids.article, ids.irrelevantArticle, ids.foreignArticle, ids.broaderArticle, ids.tenantBroaderArticle] } } });
    await db.newsRadarArticleProcessing.deleteMany({ where: { sourceArticleId: { in: [ids.article, ids.irrelevantArticle, ids.foreignArticle, ids.broaderArticle, ids.tenantBroaderArticle] } } });
    await db.sourceArticle.deleteMany({ where: { id: { in: [ids.article, ids.irrelevantArticle, ids.foreignArticle, ids.broaderArticle, ids.tenantBroaderArticle] } } });
    await db.customerSourcePreference.deleteMany({ where: { sourceId: ids.source } });
    await db.source.deleteMany({ where: { id: ids.source } });
    await db.supplier.deleteMany({ where: { id: ids.supplier } });
    await db.customerMembership.deleteMany({ where: { userId: ids.user } });
    await db.user.deleteMany({ where: { id: ids.user } });
    await db.customer.deleteMany({ where: { id: { in: [ids.customerA, ids.customerB] } } });
  });

  it('creates one idempotent direct article exposure and rejects duplicate processing', async () => {
    await expect(service.processArticle(ids.article)).resolves.toMatchObject({ articleId: ids.article });
    await expect(service.processArticle(ids.article)).rejects.toMatchObject({ code: 'NEWS_RADAR_ALREADY_PROCESSED' });
    expect(await db.newsRadarExposure.count({ where: { sourceArticleId: ids.article, customerId: ids.customerA } })).toBe(1);
  });

  it('retries a failed processing record without duplicating the exposure', async () => {
    await db.newsRadarArticleProcessing.update({ where: { sourceArticleId: ids.article }, data: { status: 'FAILED', errorCode: 'FIXTURE_FAILURE' } });
    await expect(service.processArticle(ids.article)).resolves.toMatchObject({ exposuresCreated: 0 });
    expect(await db.newsRadarExposure.count({ where: { sourceArticleId: ids.article, customerId: ids.customerA } })).toBe(1);
  });

  it('filters an article with no explicit disruption and customer-graph relationship', async () => {
    await expect(service.processArticle(ids.irrelevantArticle)).resolves.toMatchObject({ exposuresCreated: 0 });
    expect(await db.newsRadarExposure.count({ where: { sourceArticleId: ids.irrelevantArticle } })).toBe(0);
  });

  it('returns one customer-scoped relevant article with its original evidence URL', async () => {
    const result = await service.listRelevantArticles(ids.customerA);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      title: 'Fire disrupts Distinct Components Group production in Vietnam',
      url: 'https://radar.example.test/fire',
      relatedSuppliers: ['Distinct Components Group'],
    });
    await expect(service.listRelevantArticles(ids.customerB)).resolves.toEqual({ items: [] });
  });

  it('returns a material broader development without implying direct BSK exposure', async () => {
    await expect(service.processArticle(ids.broaderArticle)).resolves.toMatchObject({ exposuresCreated: 0 });
    const result = await service.intelligence(ids.customerA);
    expect(result.developments).toEqual(expect.arrayContaining([expect.objectContaining({
      level: 'BROADER',
      title: 'War disrupts Red Sea shipping routes and energy prices',
      explanation: expect.stringContaining('No direct BSK exposure is confirmed'),
      evidence: [expect.objectContaining({ url: 'https://radar.example.test/red-sea' })],
    })]));
    await expect(service.intelligence(ids.customerB)).resolves.toMatchObject({ developments: [] });
  });

  it('re-evaluates broader context against the requesting customer graph', async () => {
    await db.customerSourcePreference.create({ data: { customerId: ids.customerB, sourceId: ids.source, enabled: true } });
    await expect(service.processArticle(ids.tenantBroaderArticle)).resolves.toMatchObject({ exposuresCreated: 0 });
    const [customerA, customerB] = await Promise.all([service.intelligence(ids.customerA), service.intelligence(ids.customerB)]);
    expect(customerA.developments).toEqual(expect.arrayContaining([expect.objectContaining({ title: 'Tariffs disrupt exports from Vietnam', level: 'BROADER' })]));
    expect(customerB.developments).not.toEqual(expect.arrayContaining([expect.objectContaining({ title: 'Tariffs disrupt exports from Vietnam' })]));
    await db.customerSourcePreference.delete({ where: { customerId_sourceId: { customerId: ids.customerB, sourceId: ids.source } } });
  });

  it('does not generate a scheduled brief for a disabled preference', async () => {
    await briefService.updatePreference(ids.customerA, ids.user, {
      enabled: false,
      deliveryTime: '00:00',
      timezone: 'UTC',
      email: 'brief@example.test',
      language: 'en',
    });
    await briefService.generateDue(new Date('2035-01-02T12:00:00Z'));
    expect(await db.dailyBrief.count({
      where: { customerId: ids.customerA, briefDate: new Date('2035-01-02T00:00:00Z') },
    })).toBe(0);
  });

  it('stores a validated translation without overwriting original foreign-language evidence', async () => {
    const translations = new ArticleTranslationService(new FakeArticleTranslationProvider({
      title: 'Fire disrupts Distinct Components Group production in Vietnam',
      summary: 'Production was disrupted.',
    }));
    await expect(translations.translate(ids.foreignArticle, 'en')).resolves.toMatchObject({ status: 'COMPLETED', targetLanguage: 'en' });
    await expect(service.processArticle(ids.foreignArticle, [
      { customerId: ids.customerA, graph: isolatedCustomerGraph },
    ])).resolves.toMatchObject({ exposuresCreated: 1 });
    const original = await db.sourceArticle.findUniqueOrThrow({ where: { id: ids.foreignArticle } });
    expect(original).toMatchObject({ title: '越南工厂发生火灾', excerpt: '生产中断。', language: 'zh' });
    await expect(service.listRelevantArticles(ids.customerA, 'en')).resolves.toEqual(expect.objectContaining({
      items: expect.arrayContaining([expect.objectContaining({ id: ids.foreignArticle, translated: true, originalTitle: '越南工厂发生火灾' })]),
    }));
  });

  it('stores membership-bound preferences and generates one idempotent evidence-linked daily brief', async () => {
    await expect(deliveryBriefService.updatePreference(ids.customerA, ids.user, { enabled: true, deliveryTime: '08:00', timezone: 'UTC', email: 'brief@example.test', language: 'en' })).resolves.toMatchObject({ enabled: true });
    const tomorrow = new Date(); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const date = tomorrow.toISOString().slice(0, 10);
    const first = await briefService.generate(ids.customerA, date);
    const second = await briefService.generate(ids.customerA, date);
    expect(first?.items.length).toBeGreaterThanOrEqual(1);
    expect(first?.items).toEqual(expect.arrayContaining([expect.objectContaining({ section: 'SUPPLIERS_FACTORIES' })]));
    expect(first?.items.map((item) => item.exposure.sourceArticle.originalUrl)).toContain('https://radar.example.test/fire');
    expect(second?.id).toBe(first?.id);
    expect(await db.dailyBrief.count({ where: { customerId: ids.customerA, briefDate: new Date(`${date}T00:00:00.000Z`) } })).toBe(1);
  });

  it('delivers an idempotent tenant-scoped email containing only relevant customer items', async () => {
    const tomorrow = new Date(); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1); tomorrow.setUTCHours(12, 0, 0, 0);
    await expect(deliveryBriefService.generateDue(tomorrow)).resolves.toMatchObject({ emailsSent: 1, emailFailures: 0 });
    await expect(deliveryBriefService.generateDue(tomorrow)).resolves.toMatchObject({ emailsSent: 0 });
    expect(email.messages).toHaveLength(1);
    expect(email.messages[0]?.html).toContain('Distinct Components Group');
    expect(email.messages[0]?.html).not.toContain('Radar Customer B');
    expect(await db.dailyBriefDelivery.count({ where: { customerId: ids.customerA, status: 'SENT' } })).toBe(1);
  });

  it('database rejects a Customer B brief item referencing a Customer A exposure', async () => {
    const exposure = await db.newsRadarExposure.findFirstOrThrow({ where: { customerId: ids.customerA, sourceArticleId: ids.article } });
    const brief = await db.dailyBrief.create({ data: { customerId: ids.customerB, briefDate: new Date('2030-01-01T00:00:00Z'), graphRevision: 0, supplyChainSnapshot: {} } });
    await expect(db.dailyBriefItem.create({ data: { customerId: ids.customerB, briefId: brief.id, exposureId: exposure.id, section: 'TOP_DEVELOPMENTS', position: 1 } })).rejects.toBeDefined();
  });

  it('database rejects a Customer B exposure referencing Customer A supplier', async () => {
    await expect(db.newsRadarExposure.create({ data: {
      customerId: ids.customerB, sourceArticleId: ids.article, matchKey: 'cross-tenant', policyVersion: '2.0', entityType: 'SUPPLIER', topic: 'OPERATIONAL', matchMethod: 'UNIQUE_EXACT_NAME', confidence: 0.8, relevanceLevel: 'HIGH', reason: 'Invalid cross-tenant fixture', matchedTerms: ['Distinct Components Group'], pathSnapshot: [], supplierId: ids.supplier,
    } })).rejects.toBeDefined();
  });
});

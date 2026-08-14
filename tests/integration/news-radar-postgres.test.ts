import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../../packages/db/src/index';
import { NewsRadarService } from '../../apps/api/src/services/news-radar';
import { DailyBriefService } from '../../apps/api/src/services/daily-brief';

const service = new NewsRadarService();
const briefService = new DailyBriefService();
const ids = { customerA: randomUUID(), customerB: randomUUID(), user: randomUUID(), supplier: randomUUID(), source: randomUUID(), article: randomUUID() };

describe.sequential('news radar with PostgreSQL', () => {
  beforeAll(async () => {
    await db.customer.createMany({ data: [{ id: ids.customerA, name: 'Radar Customer A' }, { id: ids.customerB, name: 'Radar Customer B' }] });
    await db.user.create({ data: { id: ids.user, email: `${ids.user}@example.test`, role: 'CUSTOMER' } });
    await db.customerMembership.create({ data: { userId: ids.user, customerId: ids.customerA } });
    await db.supplier.create({ data: { id: ids.supplier, customerId: ids.customerA, name: 'Distinct Components Group', country: 'Vietnam', city: 'Hanoi', tier: 'TIER_1', criticality: 'HIGH' } });
    await db.source.create({ data: { id: ids.source, name: 'Radar fixture source', sourceType: 'MANUAL', baseUrl: 'https://radar.example.test', category: 'NEWS', reliability: 'HIGH' } });
    await db.sourceArticle.create({ data: { id: ids.article, sourceId: ids.source, originalUrl: 'https://radar.example.test/fire', title: 'Fire disrupts Distinct Components Group production in Vietnam', normalizedText: 'Fire disrupts Distinct Components Group production in Vietnam.', contentHash: `content-${ids.article}`, urlHash: `url-${ids.article}`, status: 'NORMALIZED' } });
  });
  afterAll(async () => {
    await db.dailyBrief.deleteMany({ where: { customerId: { in: [ids.customerA, ids.customerB] } } });
    await db.newsletterPreference.deleteMany({ where: { userId: ids.user } });
    await db.newsRadarExposure.deleteMany({ where: { sourceArticleId: ids.article } });
    await db.newsRadarArticleProcessing.deleteMany({ where: { sourceArticleId: ids.article } });
    await db.sourceArticle.deleteMany({ where: { id: ids.article } });
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

  it('stores membership-bound preferences and generates one idempotent evidence-linked daily brief', async () => {
    await expect(briefService.updatePreference(ids.customerA, ids.user, { enabled: true, deliveryTime: '08:00', timezone: 'Europe/Amsterdam', email: 'brief@example.test' })).resolves.toMatchObject({ enabled: true });
    const tomorrow = new Date(); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const date = tomorrow.toISOString().slice(0, 10);
    const first = await briefService.generate(ids.customerA, date);
    const second = await briefService.generate(ids.customerA, date);
    expect(first?.items).toHaveLength(1);
    expect(first?.items[0]?.exposure.sourceArticle.originalUrl).toBe('https://radar.example.test/fire');
    expect(second?.id).toBe(first?.id);
    expect(await db.dailyBrief.count({ where: { customerId: ids.customerA, briefDate: new Date(`${date}T00:00:00.000Z`) } })).toBe(1);
  });

  it('database rejects a Customer B brief item referencing a Customer A exposure', async () => {
    const exposure = await db.newsRadarExposure.findFirstOrThrow({ where: { customerId: ids.customerA, sourceArticleId: ids.article } });
    const brief = await db.dailyBrief.create({ data: { customerId: ids.customerB, briefDate: new Date('2030-01-01T00:00:00Z'), graphRevision: 0, supplyChainSnapshot: {} } });
    await expect(db.dailyBriefItem.create({ data: { customerId: ids.customerB, briefId: brief.id, exposureId: exposure.id, section: 'TOP_DEVELOPMENTS', position: 1 } })).rejects.toBeDefined();
  });

  it('database rejects a Customer B exposure referencing Customer A supplier', async () => {
    await expect(db.newsRadarExposure.create({ data: {
      customerId: ids.customerB, sourceArticleId: ids.article, matchKey: 'cross-tenant', entityType: 'SUPPLIER', topic: 'OPERATIONAL', matchMethod: 'UNIQUE_EXACT_NAME', confidence: 0.8, reason: 'Invalid cross-tenant fixture', matchedTerms: ['Distinct Components Group'], pathSnapshot: [], supplierId: ids.supplier,
    } })).rejects.toBeDefined();
  });
});

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../../packages/db/src/index';
import { NewsRadarService } from '../../apps/api/src/services/news-radar';

const service = new NewsRadarService();
const ids = { customerA: randomUUID(), customerB: randomUUID(), supplier: randomUUID(), source: randomUUID(), article: randomUUID() };

describe.sequential('news radar with PostgreSQL', () => {
  beforeAll(async () => {
    await db.customer.createMany({ data: [{ id: ids.customerA, name: 'Radar Customer A' }, { id: ids.customerB, name: 'Radar Customer B' }] });
    await db.supplier.create({ data: { id: ids.supplier, customerId: ids.customerA, name: 'Distinct Components Group', country: 'Vietnam', city: 'Hanoi', tier: 'TIER_1', criticality: 'HIGH' } });
    await db.source.create({ data: { id: ids.source, name: 'Radar fixture source', sourceType: 'MANUAL', baseUrl: 'https://radar.example.test', category: 'NEWS', reliability: 'HIGH' } });
    await db.sourceArticle.create({ data: { id: ids.article, sourceId: ids.source, originalUrl: 'https://radar.example.test/fire', title: 'Fire disrupts Distinct Components Group production in Vietnam', normalizedText: 'Fire disrupts Distinct Components Group production in Vietnam.', contentHash: `content-${ids.article}`, urlHash: `url-${ids.article}`, status: 'NORMALIZED' } });
  });
  afterAll(async () => {
    await db.newsRadarExposure.deleteMany({ where: { sourceArticleId: ids.article } });
    await db.newsRadarArticleProcessing.deleteMany({ where: { sourceArticleId: ids.article } });
    await db.sourceArticle.deleteMany({ where: { id: ids.article } });
    await db.source.deleteMany({ where: { id: ids.source } });
    await db.supplier.deleteMany({ where: { id: ids.supplier } });
    await db.customer.deleteMany({ where: { id: { in: [ids.customerA, ids.customerB] } } });
  });

  it('creates one idempotent direct article exposure and rejects duplicate processing', async () => {
    await expect(service.processArticle(ids.article)).resolves.toMatchObject({ exposuresCreated: 1 });
    await expect(service.processArticle(ids.article)).rejects.toMatchObject({ code: 'NEWS_RADAR_ALREADY_PROCESSED' });
    expect(await db.newsRadarExposure.count({ where: { sourceArticleId: ids.article, customerId: ids.customerA } })).toBe(1);
  });

  it('retries a failed processing record without duplicating the exposure', async () => {
    await db.newsRadarArticleProcessing.update({ where: { sourceArticleId: ids.article }, data: { status: 'FAILED', errorCode: 'FIXTURE_FAILURE' } });
    await expect(service.processArticle(ids.article)).resolves.toMatchObject({ exposuresCreated: 0 });
    expect(await db.newsRadarExposure.count({ where: { sourceArticleId: ids.article, customerId: ids.customerA } })).toBe(1);
  });

  it('database rejects a Customer B exposure referencing Customer A supplier', async () => {
    await expect(db.newsRadarExposure.create({ data: {
      customerId: ids.customerB, sourceArticleId: ids.article, matchKey: 'cross-tenant', entityType: 'SUPPLIER', topic: 'OPERATIONAL', matchMethod: 'UNIQUE_EXACT_NAME', confidence: 0.8, reason: 'Invalid cross-tenant fixture', matchedTerms: ['Distinct Components Group'], pathSnapshot: [], supplierId: ids.supplier,
    } })).rejects.toBeDefined();
  });
});

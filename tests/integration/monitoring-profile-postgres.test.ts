import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../../packages/db/src/index';
import { MonitoringProfileService } from '../../apps/api/src/services/monitoring-profile';
import { collectDueSources } from '../../apps/api/src/services/source-collection-batch';

const raw = process.env.TEST_DATABASE_URL;
if (!raw || raw !== process.env.DATABASE_URL || process.env.NODE_ENV === 'production' || !new URL(raw).pathname.includes('suppliesignal_test_'))
  throw new Error('Refusing non-disposable monitoring-profile integration database');

const service = new MonitoringProfileService();
const ids = { customer: randomUUID(), other: randomUUID(), user: randomUUID(), factory: randomUUID(), product: randomUUID(), source: randomUUID() };

describe.sequential('customer monitoring profile with PostgreSQL', () => {
  beforeAll(async () => {
    await db.customer.createMany({ data: [{ id: ids.customer, name: 'BSK Profile Fixture' }, { id: ids.other, name: 'Other Profile Fixture' }] });
    await db.user.create({ data: { id: ids.user, email: `${ids.user}@example.test`, role: 'CUSTOMER' } });
    await db.customerMembership.create({ data: { customerId: ids.customer, userId: ids.user } });
    await db.factory.create({ data: { id: ids.factory, customerId: ids.customer, name: 'Cumilla Profile Factory', country: 'Bangladesh', city: 'Cumilla', criticality: 'MEDIUM' } });
    await db.source.create({ data: { id: ids.source, name: 'Bangladesh Profile Feed', sourceType: 'RSS', baseUrl: 'https://profile.example.test/', feedUrl: 'https://profile.example.test/feed.xml', country: 'Bangladesh', region: 'South Asia', language: 'en', industry: 'Apparel manufacturing', category: 'LOCAL_NEWS', reliability: 'HIGH', collectionEnabled: true } });
  });

  afterAll(async () => {
    await db.customerSourcePreference.deleteMany({ where: { customerId: { in: [ids.customer, ids.other] } } });
    await db.customerMonitoringTag.deleteMany({ where: { customerId: { in: [ids.customer, ids.other] } } });
    await db.product.deleteMany({ where: { id: ids.product } });
    await db.factory.deleteMany({ where: { id: ids.factory } });
    await db.source.deleteMany({ where: { id: ids.source } });
    await db.customerMembership.deleteMany({ where: { userId: ids.user } });
    await db.user.deleteMany({ where: { id: ids.user } });
    await db.customer.deleteMany({ where: { id: { in: [ids.customer, ids.other] } } });
  });

  it('derives immutable graph tags, multilingual requirements and explainable suggestions', async () => {
    const profile = await service.get(ids.customer);
    expect(profile.tags.auto).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Cumilla Profile Factory', type: 'AUTO', status: 'ACTIVE' }),
      expect.objectContaining({ label: 'Bangladesh', type: 'AUTO', status: 'ACTIVE' }),
    ]));
    expect(profile.tags.suggested).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'labor unrest', type: 'SUGGESTED', status: 'PENDING' }),
      expect.objectContaining({ label: 'minimum wage', type: 'SUGGESTED', status: 'PENDING' }),
    ]));
    expect(profile.searchLanguages).toEqual(expect.arrayContaining(['bn', 'en']));
    expect(profile.coverage).toEqual(expect.arrayContaining([expect.objectContaining({ region: 'Bangladesh' })]));
    expect(profile.coverage.find((item) => item.region === 'Bangladesh')!.total).toBeGreaterThanOrEqual(1);
  });

  it('persists independent auto, suggested and custom tag controls', async () => {
    const initial = await service.get(ids.customer);
    const auto = initial.tags.auto.find((tag) => tag.label === 'Bangladesh')!;
    const suggestion = initial.tags.suggested.find((tag) => tag.label === 'minimum wage')!;
    await expect(service.update(ids.customer, auto.id, { status: 'DISABLED' })).resolves.toMatchObject({ status: 'DISABLED' });
    await expect(service.remove(ids.customer, auto.id)).rejects.toMatchObject({ code: 'MONITORING_TAG_DELETE_FORBIDDEN' });
    await expect(service.update(ids.customer, suggestion.id, { status: 'ACTIVE' })).resolves.toMatchObject({ status: 'ACTIVE' });
    const ignored = initial.tags.suggested.find((tag) => tag.label === 'flooding')!;
    await expect(service.update(ids.customer, ignored.id, { status: 'IGNORED' })).resolves.toMatchObject({ status: 'IGNORED' });
    const custom = await service.createCustom(ids.customer, ids.user, { label: 'EU due diligence', category: 'THEME' });
    await expect(service.update(ids.customer, custom.id, { label: 'EU supply-chain due diligence' })).resolves.toMatchObject({ label: 'EU supply-chain due diligence' });
    await expect(service.update(ids.customer, custom.id, { status: 'DISABLED' })).resolves.toMatchObject({ status: 'DISABLED' });
    await expect(service.remove(ids.customer, custom.id)).resolves.toMatchObject({ removed: true });
  });

  it('updates automatically when the customer graph changes without reviving user-disabled auto tags', async () => {
    await db.product.create({ data: { id: ids.product, customerId: ids.customer, name: 'Profile Travel Bag', category: 'Bags and accessories', criticality: 'MEDIUM' } });
    await expect(service.get(ids.customer)).resolves.toEqual(expect.objectContaining({
      tags: expect.objectContaining({ auto: expect.arrayContaining([expect.objectContaining({ label: 'Profile Travel Bag' })]) }),
    }));
    await db.product.update({ where: { id: ids.product }, data: { active: false } });
    const updated = await service.get(ids.customer);
    expect(updated.tags.auto.some((tag) => tag.label === 'Profile Travel Bag')).toBe(false);
    expect(updated.tags.auto.find((tag) => tag.label === 'Bangladesh')).toMatchObject({ status: 'DISABLED' });
  });

  it('stores source controls per customer and never changes another customer preference', async () => {
    await service.setSourceEnabled(ids.customer, ids.source, false);
    await service.setSourceEnabled(ids.other, ids.source, true);
    await expect(db.customerSourcePreference.findUniqueOrThrow({ where: { customerId_sourceId: { customerId: ids.customer, sourceId: ids.source } } })).resolves.toMatchObject({ enabled: false });
    await expect(db.customerSourcePreference.findUniqueOrThrow({ where: { customerId_sourceId: { customerId: ids.other, sourceId: ids.source } } })).resolves.toMatchObject({ enabled: true });
    await service.enableRecommended(ids.customer, 'Bangladesh');
    await expect(db.customerSourcePreference.findUniqueOrThrow({ where: { customerId_sourceId: { customerId: ids.customer, sourceId: ids.source } } })).resolves.toMatchObject({ enabled: true, recommended: true });
  });

  it('makes customer source disablement authoritative for the collection worker', async () => {
    const collected: string[] = [];
    await service.setSourceEnabled(ids.customer, ids.source, false);
    await service.setSourceEnabled(ids.other, ids.source, false);
    await collectDueSources(new Date(), async (sourceId) => { collected.push(sourceId); });
    expect(collected).not.toContain(ids.source);

    await service.setSourceEnabled(ids.customer, ids.source, true);
    await collectDueSources(new Date(), async (sourceId) => { collected.push(sourceId); });
    expect(collected).toContain(ids.source);
  });
});

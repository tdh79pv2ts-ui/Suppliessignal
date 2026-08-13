import { afterAll, describe, expect, it } from 'vitest';
import { db } from '../../packages/db/src/index';
import { CustomerExposureService } from '../../apps/api/src/services/customer-exposure';

const raw = process.env.TEST_DATABASE_URL;
if (!raw || raw !== process.env.DATABASE_URL || process.env.NODE_ENV === 'production' || !new URL(raw).pathname.includes('suppliesignal_test_')) {
  throw new Error('Refusing non-disposable customer exposure database');
}

afterAll(async () => db.$disconnect());
const service = new CustomerExposureService();

async function fixture(options: { verified?: boolean; countryOnly?: boolean } = {}) {
  const suffix = crypto.randomUUID();
  const reviewer = await db.user.create({ data: { id: crypto.randomUUID(), email: `exposure-${suffix}@example.test`, role: 'ADMIN' } });
  const customer = await db.customer.create({ data: { name: `Exposure customer ${suffix}` } });
  const supplier = await db.supplier.create({ data: { customerId: customer.id, name: `Supplier ${suffix}`, country: 'Netherlands', tier: 'TIER_1', criticality: 'HIGH' } });
  const factory = await db.factory.create({ data: { customerId: customer.id, supplierId: supplier.id, name: `Factory ${suffix}`, country: 'Netherlands', city: 'Rotterdam', criticality: 'HIGH' } });
  const event = await db.event.create({
    data: {
      eventType: 'FACTORY_DISRUPTION', title: `Disruption ${suffix}`, summary: 'Fixture', severity: 'HIGH', confidence: 0.9,
      assertionMode: 'OBSERVED', firstSeenAt: new Date(), lastSeenAt: new Date(), fingerprint: `exposure-${suffix}`,
      entities: { create: { entityType: 'COMPANY', name: `Supplier ${suffix}`, normalizedName: `supplier ${suffix}`, normalizedKey: `company:supplier-${suffix}` } },
      locations: { create: { name: options.countryOnly ? 'Netherlands' : 'Rotterdam', country: 'Netherlands', ...(options.countryOnly ? {} : { city: 'Rotterdam' }), normalizedKey: options.countryOnly ? 'country:nl' : `city:rotterdam-${suffix}` } },
    },
    include: { entities: true },
  });
  await db.customerGraphIdentity.create({ data: { customerId: customer.id, subjectType: 'SUPPLIER', supplierId: supplier.id, namespace: 'DUNS', identifier: suffix, normalizedIdentifier: suffix, verificationStatus: 'VERIFIED', provenanceSource: 'fixture', verifiedAt: new Date(), verifiedByUserId: reviewer.id } });
  await db.eventEntityIdentifier.create({ data: { eventEntityId: event.entities[0]!.id, namespace: 'DUNS', identifier: suffix, normalizedIdentifier: suffix, verificationStatus: options.verified === false ? 'PROPOSED' : 'VERIFIED', provenanceSource: 'fixture', ...(options.verified === false ? { proposedAt: new Date(), proposedByUserId: reviewer.id } : { verifiedAt: new Date(), verifiedByUserId: reviewer.id }) } });
  return { customer, supplier, factory, event, reviewer };
}

describe.sequential('Phase 6 customer exposure with PostgreSQL', () => {
  it('creates deterministic identifier and geographic paths and is concurrent/idempotent', async () => {
    const item = await fixture();
    await Promise.all([service.reconcileEvent(item.event.id), service.reconcileEvent(item.event.id)]);
    expect(await db.customerExposure.count({ where: { customerId: item.customer.id, eventId: item.event.id } })).toBe(1);
    const exposure = await db.customerExposure.findUniqueOrThrow({ where: { customerId_eventId: { customerId: item.customer.id, eventId: item.event.id } }, include: { paths: { include: { steps: true } } } });
    expect(exposure.paths).toHaveLength(2);
    expect(exposure.paths.flatMap((path) => path.steps).some((step) => step.supplierId === item.supplier.id)).toBe(true);
    expect(exposure.paths.flatMap((path) => path.steps).some((step) => step.factoryId === item.factory.id)).toBe(true);
    await service.reconcileEvent(item.event.id);
    expect(await db.exposurePath.count({ where: { exposureId: exposure.id } })).toBe(2);
  });

  it('does not direct-match an unverified or name-only Event entity', async () => {
    const item = await fixture({ verified: false });
    await service.reconcileEvent(item.event.id);
    const paths = await db.exposurePath.findMany({ where: { exposure: { customerId: item.customer.id, eventId: item.event.id } } });
    expect(paths.every((path) => path.matchMethod !== 'VERIFIED_IDENTIFIER')).toBe(true);
  });

  it('persists country-only ambiguity without creating a confirmed exposure', async () => {
    const item = await fixture({ countryOnly: true, verified: false });
    await service.reconcileEvent(item.event.id);
    expect(await db.exposureCandidate.count({ where: { customerId: item.customer.id, eventId: item.event.id, status: 'PENDING' } })).toBe(1);
    expect(await db.customerExposure.count({ where: { customerId: item.customer.id, eventId: item.event.id } })).toBe(0);
  });

  it('increments graph revision and reconciles all unresolved Events after identity onboarding', async () => {
    const item = await fixture({ verified: false });
    const before = (await db.customer.findUniqueOrThrow({ where: { id: item.customer.id } })).graphRevision;
    await db.supplier.update({ where: { id: item.supplier.id }, data: { city: 'Rotterdam' } });
    const after = (await db.customer.findUniqueOrThrow({ where: { id: item.customer.id } })).graphRevision;
    expect(after).toBeGreaterThan(before);
    const identifier = await db.eventEntityIdentifier.findFirstOrThrow({ where: { eventEntity: { eventId: item.event.id } } });
    await db.eventEntityIdentifier.update({ where: { id: identifier.id }, data: { verificationStatus: 'VERIFIED', verifiedAt: new Date(), verifiedByUserId: item.reviewer.id } });
    const result = await service.reconcileCustomer(item.customer.id);
    expect(result.eventsProcessed).toBeGreaterThan(0);
    expect(await db.customerExposure.count({ where: { customerId: item.customer.id, eventId: item.event.id } })).toBe(1);
  });
});

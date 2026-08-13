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

  it('does not match the same city in a different country', async () => {
    const item = await fixture({ verified: false });
    await db.eventLocation.updateMany({ where: { eventId: item.event.id }, data: { country: 'Belgium' } });
    await service.reconcileEvent(item.event.id);
    expect(await db.customerExposure.count({ where: { customerId: item.customer.id, eventId: item.event.id } })).toBe(0);
  });

  it('matches a verified Port and its active customer Route without invalid reason codes', async () => {
    const suffix = crypto.randomUUID();
    const reviewer = await db.user.create({ data: { id: crypto.randomUUID(), email: `port-${suffix}@example.test`, role: 'ADMIN' } });
    const customer = await db.customer.create({ data: { name: `Port customer ${suffix}` } });
    const port = await db.port.create({ data: { name: `Port ${suffix}`, country: 'Singapore', portCode: `P${suffix.slice(0, 8)}` } });
    const route = await db.route.create({ data: { customerId: customer.id, name: `Route ${suffix}`, originLabel: 'A', destinationLabel: 'B', transportMode: 'SEA', criticality: 'HIGH', routePorts: { create: { portId: port.id, sequence: 1 } } } });
    const event = await db.event.create({ data: { eventType: 'PORT_DISRUPTION', title: `Port event ${suffix}`, summary: 'Fixture', severity: 'HIGH', confidence: 0.9, assertionMode: 'OBSERVED', firstSeenAt: new Date(), lastSeenAt: new Date(), fingerprint: `port-${suffix}`, entities: { create: { entityType: 'PORT', name: port.name, normalizedName: port.name.toLowerCase(), normalizedKey: `port:${suffix}` } } }, include: { entities: true } });
    await db.customerGraphIdentity.create({ data: { customerId: customer.id, subjectType: 'PORT', portId: port.id, namespace: 'UNLOCODE', identifier: port.portCode!, normalizedIdentifier: port.portCode!, verificationStatus: 'VERIFIED', provenanceSource: 'fixture', verifiedAt: new Date(), verifiedByUserId: reviewer.id } });
    await db.eventEntityIdentifier.create({ data: { eventEntityId: event.entities[0]!.id, namespace: 'UNLOCODE', identifier: port.portCode!, normalizedIdentifier: port.portCode!, verificationStatus: 'VERIFIED', provenanceSource: 'fixture', verifiedAt: new Date(), verifiedByUserId: reviewer.id } });
    await service.reconcileEvent(event.id);
    const exposure = await db.customerExposure.findUniqueOrThrow({ where: { customerId_eventId: { customerId: customer.id, eventId: event.id } }, include: { paths: { include: { steps: true } } } });
    expect(exposure.paths.every((path) => path.reasonCodes.includes('EXACT_PORT_ID'))).toBe(true);
    expect(exposure.paths.flatMap((path) => path.steps).some((step) => step.routeId === route.id)).toBe(true);
  });

  it('invalidates exposure after its matched graph node is archived', async () => {
    const item = await fixture();
    await service.reconcileEvent(item.event.id);
    await db.supplier.update({ where: { id: item.supplier.id }, data: { active: false } });
    await db.factory.update({ where: { id: item.factory.id }, data: { active: false } });
    await service.reconcileEvent(item.event.id);
    const exposure = await db.customerExposure.findUniqueOrThrow({ where: { customerId_eventId: { customerId: item.customer.id, eventId: item.event.id } } });
    expect(exposure.status).toBe('STALE');
    expect(await db.exposurePath.count({ where: { exposureId: exposure.id, activeMatch: true } })).toBe(0);
  });

  it('rejects candidate confirmation with an unrelated customer identity', async () => {
    const item = await fixture({ countryOnly: true, verified: false });
    await service.reconcileEvent(item.event.id);
    const candidate = await db.exposureCandidate.findFirstOrThrow({ where: { customerId: item.customer.id, eventId: item.event.id } });
    await expect(service.reviewCandidate(item.customer.id, candidate.id, item.reviewer.id, true, 'AMBIGUOUS_LOCATION', (await db.customerGraphIdentity.findFirstOrThrow({ where: { customerId: item.customer.id } })).id)).rejects.toMatchObject({ code: 'IDENTITY_NOT_IN_CANDIDATE' });
    expect((await db.exposureCandidate.findUniqueOrThrow({ where: { id: candidate.id } })).status).toBe('PENDING');
  });

  it('allows the same verified master identifier on separate historic Events', async () => {
    const first = await fixture();
    const secondSuffix = crypto.randomUUID();
    const second = await db.event.create({ data: { eventType: 'SUPPLIER_DISRUPTION', title: `Second event ${secondSuffix}`, summary: 'Fixture', severity: 'MEDIUM', confidence: 0.8, assertionMode: 'OBSERVED', firstSeenAt: new Date(), lastSeenAt: new Date(), fingerprint: `second-${secondSuffix}`, entities: { create: { entityType: 'COMPANY', name: 'Same supplier', normalizedName: 'same supplier', normalizedKey: `company:${secondSuffix}` } } }, include: { entities: true } });
    const original = await db.eventEntityIdentifier.findFirstOrThrow({ where: { eventEntity: { eventId: first.event.id } } });
    await expect(db.eventEntityIdentifier.create({ data: { eventEntityId: second.entities[0]!.id, namespace: original.namespace, identifier: original.identifier, normalizedIdentifier: original.normalizedIdentifier, verificationStatus: 'VERIFIED', provenanceSource: 'fixture', verifiedAt: new Date(), verifiedByUserId: first.reviewer.id } })).resolves.toMatchObject({ verificationStatus: 'VERIFIED' });
  });

  it('recovers after service restart without duplicate logical results', async () => {
    const item = await fixture();
    await new CustomerExposureService().reconcileEvent(item.event.id);
    await new CustomerExposureService().reconcileEvent(item.event.id);
    const exposure = await db.customerExposure.findUniqueOrThrow({ where: { customerId_eventId: { customerId: item.customer.id, eventId: item.event.id } } });
    expect(await db.customerExposure.count({ where: { customerId: item.customer.id, eventId: item.event.id } })).toBe(1);
    expect(await db.exposurePath.count({ where: { exposureId: exposure.id } })).toBe(2);
  });

  it('matches an exact verified Factory identity', async () => {
    const item = await fixture({ verified: false });
    const identifier = `factory-${crypto.randomUUID()}`;
    await db.customerGraphIdentity.create({ data: { customerId: item.customer.id, subjectType: 'FACTORY', factoryId: item.factory.id, namespace: 'FACILITY_ID', identifier, normalizedIdentifier: identifier, verificationStatus: 'VERIFIED', provenanceSource: 'fixture', verifiedAt: new Date(), verifiedByUserId: item.reviewer.id } });
    const eventEntity = await db.eventEntity.findFirstOrThrow({ where: { eventId: item.event.id } });
    await db.eventEntityIdentifier.create({ data: { eventEntityId: eventEntity.id, namespace: 'FACILITY_ID', identifier, normalizedIdentifier: identifier, verificationStatus: 'VERIFIED', provenanceSource: 'fixture', verifiedAt: new Date(), verifiedByUserId: item.reviewer.id } });
    await service.reconcileEvent(item.event.id);
    const path = await db.exposurePath.findFirstOrThrow({ where: { exposure: { customerId: item.customer.id, eventId: item.event.id }, exposureType: 'DIRECT_FACTORY' }, include: { steps: true } });
    expect(path.steps).toHaveLength(1);
    expect(path.steps[0]!.factoryId).toBe(item.factory.id);
  });

  it('reconciles an exposure when a verified customer identity is rejected', async () => {
    const item = await fixture();
    await service.reconcileEvent(item.event.id);
    const identity = await db.customerGraphIdentity.findFirstOrThrow({ where: { customerId: item.customer.id, supplierId: item.supplier.id } });
    await service.setGraphIdentityStatus(item.customer.id, identity.id, item.reviewer.id, false);
    const paths = await db.exposurePath.findMany({ where: { exposure: { customerId: item.customer.id, eventId: item.event.id }, matchMethod: 'VERIFIED_IDENTIFIER' } });
    expect(paths.every((path) => !path.activeMatch)).toBe(true);
  });

  it('customer-scoped detail rejects an exposure ID owned by another customer', async () => {
    const first = await fixture();
    const second = await fixture();
    await service.reconcileEvent(second.event.id);
    const otherExposure = await db.customerExposure.findUniqueOrThrow({ where: { customerId_eventId: { customerId: second.customer.id, eventId: second.event.id } } });
    await expect(service.detail(first.customer.id, otherExposure.id)).rejects.toMatchObject({ code: 'EXPOSURE_NOT_FOUND' });
  });
});

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../../packages/db/src/index';

function assertTestDatabase(): void {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw || raw !== process.env.DATABASE_URL) {
    throw new Error(
      'Exposure database tests require matching TEST_DATABASE_URL and DATABASE_URL',
    );
  }
  const url = new URL(raw);
  if (
    !['localhost', '127.0.0.1', '::1'].includes(url.hostname) ||
    !url.pathname.slice(1).startsWith('suppliesignal_test_') ||
    process.env.NODE_ENV === 'production'
  ) {
    throw new Error(
      'Refusing to run exposure database tests outside a disposable local suppliesignal_test_* database',
    );
  }
}

assertTestDatabase();

const ids = {
  customerA: randomUUID(),
  customerB: randomUUID(),
  supplierA: randomUUID(),
  supplierB: randomUUID(),
  factoryA: randomUUID(),
  factoryB: randomUUID(),
  port: randomUUID(),
  event: randomUUID(),
  exposureA: randomUUID(),
  pathA: randomUUID(),
  candidateA: randomUUID(),
  identityB: randomUUID(),
  verifier: randomUUID(),
};

beforeAll(async () => {
  await db.user.create({
    data: {
      id: ids.verifier,
      email: `phase6a-verifier-${ids.verifier}@example.test`,
      role: 'ADMIN',
    },
  });
  await db.customer.createMany({
    data: [
      { id: ids.customerA, name: 'Phase 6A Customer A' },
      { id: ids.customerB, name: 'Phase 6A Customer B' },
    ],
  });
  await db.supplier.createMany({
    data: [
      {
        id: ids.supplierA,
        customerId: ids.customerA,
        name: 'Phase 6A Supplier A',
        country: 'Thailand',
        tier: 'TIER_1',
        criticality: 'HIGH',
      },
      {
        id: ids.supplierB,
        customerId: ids.customerB,
        name: 'Phase 6A Supplier B',
        country: 'Vietnam',
        tier: 'TIER_1',
        criticality: 'HIGH',
      },
    ],
  });
  await db.factory.createMany({
    data: [
      {
        id: ids.factoryA,
        customerId: ids.customerA,
        supplierId: ids.supplierA,
        name: 'Phase 6A Factory A',
        country: 'Thailand',
        criticality: 'HIGH',
      },
      {
        id: ids.factoryB,
        customerId: ids.customerB,
        supplierId: ids.supplierB,
        name: 'Phase 6A Factory B',
        country: 'Vietnam',
        criticality: 'HIGH',
      },
    ],
  });
  await db.port.create({
    data: {
      id: ids.port,
      name: 'Phase 6A Port',
      country: 'Singapore',
      portCode: `P6${ids.port.slice(0, 5)}`,
    },
  });
  await db.event.create({
    data: {
      id: ids.event,
      eventType: 'SUPPLIER_DISRUPTION',
      title: 'Preserved Phase 5 event',
      summary: 'Phase 5 data remains usable after the Phase 6A migration.',
      severity: 'HIGH',
      confidence: 0.8,
      assertionMode: 'OBSERVED',
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      fingerprint: `phase6a-${ids.event}`,
    },
  });
  await db.customerExposure.create({
    data: {
      id: ids.exposureA,
      customerId: ids.customerA,
      eventId: ids.event,
      primaryExposureType: 'DIRECT_SUPPLIER',
      matchConfidence: 1,
      matchState: 'VERIFIED_DIRECT',
      eventPolicyVersion: '1.1',
      exposurePolicyVersion: '1.0',
      eventVersion: 1,
      graphRevision: 0,
      lastMatchedAt: new Date(),
    },
  });
  await db.exposurePath.create({
    data: {
      id: ids.pathA,
      customerId: ids.customerA,
      exposureId: ids.exposureA,
      pathKey: 'supplier-a',
      exposureType: 'DIRECT_SUPPLIER',
      decision: 'MATCH',
      matchMethod: 'VERIFIED_IDENTIFIER',
      matchConfidence: 1,
      reasonCodes: ['EXACT_SUPPLIER_IDENTIFIER'],
      lastMatchedAt: new Date(),
      graphRevision: 0,
      eventVersion: 1,
      snapshot: { label: 'Phase 6A Supplier A' },
    },
  });
  await db.customerGraphIdentity.create({
    data: {
      id: ids.identityB,
      customerId: ids.customerB,
      subjectType: 'SUPPLIER',
      supplierId: ids.supplierB,
      namespace: 'lei',
      identifier: 'B-IDENTITY',
      normalizedIdentifier: 'b-identity',
      provenanceSource: 'integration-test',
    },
  });
  await db.exposureCandidate.create({
    data: {
      id: ids.candidateA,
      customerId: ids.customerA,
      eventId: ids.event,
      candidateKey: 'ambiguous-supplier-a',
      matchMethods: ['COMPOSITE_EXACT_IDENTITY'],
      reasonCodes: ['AMBIGUOUS_ENTITY_IDENTITY'],
      eventEntityIds: [],
      eventLocationIds: [],
      snapshot: { reason: 'ambiguous' },
      exposurePolicyVersion: '1.0',
      graphRevision: 0,
      eventVersion: 1,
    },
  });
});

afterAll(async () => db.$disconnect());

describe.sequential('Phase 6A exposure database constraints', () => {
  it('rejects a Customer B step under a Customer A ExposurePath', async () => {
    await expect(
      db.exposurePathStep.create({
        data: {
          customerId: ids.customerB,
          pathId: ids.pathA,
          sequence: 1,
          nodeType: 'FACTORY',
          factoryId: ids.factoryB,
          labelSnapshot: 'Cross-tenant factory',
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects a Customer A candidate linked to Customer B resulting identity', async () => {
    await expect(
      db.exposureCandidate.update({
        where: { id: ids.candidateA },
        data: { resultingIdentityId: ids.identityB },
      }),
    ).rejects.toThrow();
  });

  it('accepts a path step with matching FACTORY type and factory subject', async () => {
    const step = await db.exposurePathStep.create({
      data: {
        customerId: ids.customerA,
        pathId: ids.pathA,
        sequence: 1,
        nodeType: 'FACTORY',
        factoryId: ids.factoryA,
        labelSnapshot: 'Phase 6A Factory A',
      },
    });

    expect(step).toMatchObject({
      nodeType: 'FACTORY',
      factoryId: ids.factoryA,
    });
  });

  it('rejects a path step whose FACTORY type points to a supplier', async () => {
    await expect(
      db.exposurePathStep.create({
        data: {
          customerId: ids.customerA,
          pathId: ids.pathA,
          sequence: 2,
          nodeType: 'FACTORY',
          supplierId: ids.supplierA,
          labelSnapshot: 'Mismatched supplier',
        },
      }),
    ).rejects.toThrow(/exposure_path_steps_subject_type_check/);
  });

  it('requires exactly one typed identity subject and matching subject type', async () => {
    const base = {
      id: randomUUID(),
      customerId: ids.customerA,
      subjectType: 'SUPPLIER' as const,
      namespace: 'lei',
      identifier: randomUUID(),
      normalizedIdentifier: randomUUID(),
      provenanceSource: 'integration-test',
    };

    await expect(
      db.customerGraphIdentity.create({ data: base }),
    ).rejects.toThrow();
    await expect(
      db.customerGraphIdentity.create({
        data: {
          ...base,
          id: randomUUID(),
          supplierId: ids.supplierA,
          portId: ids.port,
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.customerGraphIdentity.create({
        data: {
          ...base,
          id: randomUUID(),
          subjectType: 'FACTORY',
          supplierId: ids.supplierA,
        },
      }),
    ).rejects.toThrow();
  });

  it('accepts a candidate node with matching FACTORY type and factory subject', async () => {
    const node = await db.exposureCandidateNode.create({
      data: {
        customerId: ids.customerA,
        candidateId: ids.candidateA,
        nodeType: 'FACTORY',
        factoryId: ids.factoryA,
        snapshot: { label: 'Phase 6A Factory A' },
      },
    });

    expect(node).toMatchObject({
      nodeType: 'FACTORY',
      factoryId: ids.factoryA,
    });
  });

  it('rejects a candidate node whose FACTORY type points to a supplier', async () => {
    await expect(
      db.exposureCandidateNode.create({
        data: {
          customerId: ids.customerA,
          candidateId: ids.candidateA,
          nodeType: 'FACTORY',
          supplierId: ids.supplierA,
          snapshot: { label: 'Mismatched supplier' },
        },
      }),
    ).rejects.toThrow(/exposure_candidate_nodes_subject_type_check/);
  });

  it('rejects a candidate node with two populated subjects', async () => {
    await expect(
      db.exposureCandidateNode.create({
        data: {
          customerId: ids.customerA,
          candidateId: ids.candidateA,
          nodeType: 'FACTORY',
          supplierId: ids.supplierA,
          factoryId: ids.factoryA,
          snapshot: { label: 'Two subjects' },
        },
      }),
    ).rejects.toThrow(/exposure_candidate_nodes_one_subject_check/);
  });

  it('rejects a candidate node with no populated subject', async () => {
    await expect(
      db.exposureCandidateNode.create({
        data: {
          customerId: ids.customerA,
          candidateId: ids.candidateA,
          nodeType: 'FACTORY',
          snapshot: { label: 'No subject' },
        },
      }),
    ).rejects.toThrow(/exposure_candidate_nodes_one_subject_check/);
  });

  it('rejects invalid identity verification status transitions', async () => {
    const identity = await db.customerGraphIdentity.create({
      data: {
        customerId: ids.customerA,
        subjectType: 'SUPPLIER',
        supplierId: ids.supplierA,
        namespace: 'duns',
        identifier: randomUUID(),
        normalizedIdentifier: randomUUID(),
        provenanceSource: 'integration-test',
      },
    });
    await db.customerGraphIdentity.update({
      where: { id: identity.id },
      data: { verificationStatus: 'REJECTED' },
    });
    await expect(
      db.customerGraphIdentity.update({
        where: { id: identity.id },
        data: { verificationStatus: 'UNVERIFIED' },
      }),
    ).rejects.toThrow(/invalid identity verification status transition/);
  });

  it('keeps existing Phase 5 Event behavior and provenance tables available', async () => {
    const event = await db.event.findUniqueOrThrow({ where: { id: ids.event } });
    const tables = await db.$queryRaw<
      Array<{ event_claims: string | null; processing: string | null }>
    >`SELECT to_regclass('public.event_claims')::text AS event_claims, to_regclass('public.claim_event_processing')::text AS processing`;

    expect(event.policyVersion).toBe('1.1');
    expect(event.exposureVersion).toBe(1);
    expect(tables[0]).toEqual({
      event_claims: 'event_claims',
      processing: 'claim_event_processing',
    });
  });
});

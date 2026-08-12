import { afterAll, describe, expect, it } from 'vitest';
import { db } from '../../packages/db/src/index';
import { EventIntelligenceService } from '../../apps/api/src/services/event-intelligence';
const raw = process.env.TEST_DATABASE_URL;
if (
  !raw ||
  raw !== process.env.DATABASE_URL ||
  process.env.NODE_ENV === 'production' ||
  !new URL(raw).pathname.includes('suppliesignal_test_')
)
  throw new Error('Refusing non-disposable Event database');
afterAll(async () => db.$disconnect());
const service = new EventIntelligenceService();
async function claimFixture(
  options: {
    sourceName?: string;
    articleTitle?: string;
    claimType?: 'STRIKE' | 'FIRE' | 'PORT_DISRUPTION';
    assertionMode?: 'OBSERVED' | 'REPORTED' | 'FORECAST';
    statement?: string;
    date?: Date;
    entityName?: string;
    locationName?: string;
    confidence?: number;
  } = {},
) {
  const source = await db.source.create({
    data: {
      name: `${options.sourceName ?? 'Event Fixture'} ${crypto.randomUUID()}`,
      sourceType: 'MANUAL',
      baseUrl: `https://${crypto.randomUUID()}.example`,
      category: 'OTHER',
      reliability: 'HIGH',
    },
  });
  const text =
    options.statement ??
    'Workers began a strike at North Terminal in Rotterdam.';
  const article = await db.sourceArticle.create({
    data: {
      sourceId: source.id,
      originalUrl: `https://fixture.example/${crypto.randomUUID()}`,
      title: options.articleTitle ?? 'Fictional event fixture',
      normalizedText: text,
      publishedAt: new Date('2026-03-02T10:00:00Z'),
      contentHash: crypto.randomUUID(),
      urlHash: crypto.randomUUID(),
      status: 'NORMALIZED',
    },
  });
  const run = await db.articleExtractionRun.create({
    data: {
      sourceArticleId: article.id,
      status: 'COMPLETED',
      provider: 'fake',
      model: 'event-fixture',
      promptVersion: '1.0',
      schemaVersion: '1.0',
      inputHash: crypto.randomUUID(),
      inputCharacters: text.length,
      claimsExtracted: 1,
      articleRelevant: true,
      completedAt: new Date(),
    },
  });
  const claim = await db.claim.create({
    data: {
      sourceArticleId: article.id,
      extractionRunId: run.id,
      claimType: options.claimType ?? 'STRIKE',
      assertionMode: options.assertionMode ?? 'OBSERVED',
      statement: text,
      confidence: options.confidence ?? 0.82,
      occurredAt: options.date ?? new Date('2026-03-02T00:00:00Z'),
      evidenceText: text,
      evidenceStart: 0,
      evidenceEnd: text.length,
      entities: {
        create: {
          entityType: 'FACTORY',
          name: options.entityName ?? 'North Terminal',
          role: 'affected',
        },
      },
      locations: {
        create: {
          name: options.locationName ?? 'Rotterdam',
          city: options.locationName ?? 'Rotterdam',
          country: 'Netherlands',
        },
      },
    },
  });
  return { source, article, run, claim };
}

async function reprocessedClaim(
  fixture: Awaited<ReturnType<typeof claimFixture>>,
  statement: string,
) {
  const run = await db.articleExtractionRun.create({
    data: {
      sourceArticleId: fixture.article.id,
      status: 'COMPLETED',
      provider: 'fake',
      model: 'event-fixture-reprocess',
      promptVersion: '1.1',
      schemaVersion: '1.0',
      inputHash: crypto.randomUUID(),
      inputCharacters: statement.length,
      claimsExtracted: 1,
      articleRelevant: true,
      completedAt: new Date(),
    },
  });
  const claim = await db.claim.create({
    data: {
      sourceArticleId: fixture.article.id,
      extractionRunId: run.id,
      claimType: 'STRIKE',
      assertionMode: 'OBSERVED',
      statement,
      confidence: 0.8,
      occurredAt: new Date('2026-03-02T00:00:00Z'),
      evidenceText: statement,
      evidenceStart: 0,
      evidenceEnd: statement.length,
      entities: {
        create: {
          entityType: 'FACTORY',
          name: 'Conflict Terminal',
          role: 'affected',
        },
      },
      locations: {
        create: {
          name: 'Rotterdam',
          city: 'Rotterdam',
          country: 'Netherlands',
        },
      },
    },
  });
  return { run, claim };
}
describe.sequential('Phase 5 Event intelligence with PostgreSQL', () => {
  it('creates one traceable Event and remains idempotent', async () => {
    const { claim } = await claimFixture();
    const first = await service.processClaim(claim.id);
    const second = await service.processClaim(claim.id);
    expect(second.id).toBe(first.id);
    expect(await db.event.count({ where: { id: first.id } })).toBe(1);
    expect(await db.eventClaim.count({ where: { claimId: claim.id } })).toBe(1);
    const detail = await service.getEvent(first.id);
    expect(detail).toMatchObject({
      supportingClaimCount: 1,
      supportingArticleCount: 1,
      supportingSourceCount: 1,
      claimLinks: [
        {
          claim: {
            id: claim.id,
            extractionRun: { provider: 'fake' },
            sourceArticle: { source: { reliability: 'HIGH' } },
          },
        },
      ],
    });
  });
  it('attaches corroborating independent Claims and keeps incompatible Events separate', async () => {
    const first = await claimFixture({
      sourceName: 'Source A',
      entityName: 'Corroboration Terminal',
    });
    const second = await claimFixture({
      sourceName: 'Source B',
      entityName: 'Corroboration Terminal',
      statement:
        'Workers at Corroboration Terminal began the Rotterdam strike.',
    });
    const eventA = await service.processClaim(first.claim.id);
    const eventB = await service.processClaim(second.claim.id);
    expect(eventB.id).toBe(eventA.id);
    expect(eventB).toMatchObject({
      supportingClaimCount: 2,
      supportingArticleCount: 2,
      supportingSourceCount: 2,
    });
    const fire = await claimFixture({
      claimType: 'FIRE',
      entityName: 'Corroboration Terminal',
      statement: 'A fire disrupted Corroboration Terminal in Rotterdam.',
    });
    expect((await service.processClaim(fire.claim.id)).id).not.toBe(eventA.id);
    const forecast = await claimFixture({
      assertionMode: 'FORECAST',
      entityName: 'Corroboration Terminal',
      statement: 'Workers may strike at Corroboration Terminal next month.',
      date: new Date('2026-04-01'),
    });
    expect((await service.processClaim(forecast.claim.id)).id).not.toBe(
      eventA.id,
    );
  });
  it('represents conflicts and preserves reprocessing provenance', async () => {
    const old = await claimFixture({
      entityName: 'Conflict Terminal',
      statement: 'Workers began a strike at Conflict Terminal in Rotterdam.',
    });
    const event = await service.processClaim(old.claim.id);
    const newer = await reprocessedClaim(
      old,
      'The strike at Conflict Terminal was cancelled.',
    );
    const same = await service.processClaim(newer.claim.id);
    expect(same.id).toBe(event.id);
    expect(same).toMatchObject({
      conflictState: 'DETECTED',
      supportingClaimCount: 2,
    });
    expect(Number(same.confidence)).toBeLessThan(0.82);
    expect(same.claimLinks.map((link) => link.claim.id)).toEqual(
      expect.arrayContaining([old.claim.id, newer.claim.id]),
    );
    expect(same.claimLinks.map((link) => link.claim.extractionRunId)).toEqual(
      expect.arrayContaining([old.run.id, newer.run.id]),
    );
  });

  it('creates a separate traceable event when conservative matching is ambiguous', async () => {
    const input = await claimFixture({
      entityName: 'Ambiguous Terminal',
      locationName: 'Singapore',
      date: new Date('2026-06-02T00:00:00Z'),
    });
    const entity = {
      entityType: 'FACTORY' as const,
      name: 'Ambiguous Terminal',
      normalizedName: 'ambiguous terminal',
      normalizedKey: 'FACTORY:ambiguous terminal',
      role: 'affected',
    };
    const location = {
      locationType: 'CITY' as const,
      name: 'Singapore',
      city: 'Singapore',
      country: 'Netherlands',
      normalizedKey: 'netherlands::singapore:singapore',
    };
    const candidates = await Promise.all(
      [new Date('2026-06-01'), new Date('2026-06-03')].map((date, index) =>
        db.event.create({
          data: {
            eventType: 'STRIKE',
            status: 'DETECTED',
            title: `Ambiguous candidate ${index + 1}`,
            summary: 'Fictional candidate event',
            severity: 'MEDIUM',
            confidence: 0.7,
            assertionMode: 'OBSERVED',
            occurredAt: date,
            observedAt: date,
            temporalPrecision: 'DAY',
            firstSeenAt: date,
            lastSeenAt: date,
            fingerprint: `ambiguous-fixture-${crypto.randomUUID()}`,
            entities: { create: entity },
            locations: { create: location },
          },
        }),
      ),
    );
    const result = await service.processClaim(input.claim.id);
    expect(candidates.map(({ id }) => id)).not.toContain(result.id);
    expect(result.claimLinks[0]).toMatchObject({
      matchDecision: 'AMBIGUOUS',
    });
    expect(
      (
        await db.claimEventProcessing.findUniqueOrThrow({
          where: { claimId: input.claim.id },
        })
      ).candidateEventIds,
    ).toEqual(expect.arrayContaining(candidates.map(({ id }) => id)));
  });
  it('uses database locking so concurrent matching creates no uncontrolled duplicate', async () => {
    const a = await claimFixture({
      sourceName: 'Concurrent A',
      entityName: 'Concurrent Terminal',
      locationName: 'Antwerp',
      date: new Date('2026-05-05'),
    });
    const b = await claimFixture({
      sourceName: 'Concurrent B',
      entityName: 'Concurrent Terminal',
      locationName: 'Antwerp',
      date: new Date('2026-05-05'),
    });
    const [one, two] = await Promise.all([
      new EventIntelligenceService().processClaim(a.claim.id),
      new EventIntelligenceService().processClaim(b.claim.id),
    ]);
    expect(one.id).toBe(two.id);
    expect(await db.eventClaim.count({ where: { eventId: one.id } })).toBe(2);
  });
  it('skips ineligible claims, filters lists, transitions explicitly, and enforces provenance constraints', async () => {
    const low = await claimFixture({
      confidence: 0.4,
      entityName: 'Low Confidence Terminal',
    });
    expect(await service.processClaim(low.claim.id)).toMatchObject({
      status: 'SKIPPED',
      reason: 'CLAIM_CONFIDENCE_TOO_LOW',
    });
    const eligible = await claimFixture({
      claimType: 'PORT_DISRUPTION',
      entityName: 'Filter Port',
      locationName: 'Hamburg',
    });
    const event = await service.processClaim(eligible.claim.id);
    expect(
      (
        await service.listEvents({
          page: 1,
          pageSize: 25,
          eventType: 'PORT_DISRUPTION',
          country: 'Netherlands',
        })
      ).items.map((item) => item.id),
    ).toContain(event.id);
    await expect(
      service.updateStatus(event.id, 'RESOLVED'),
    ).rejects.toMatchObject({ code: 'INVALID_EVENT_STATUS_TRANSITION' });
    await service.updateStatus(event.id, 'ACTIVE');
    expect(await service.updateStatus(event.id, 'RESOLVED')).toMatchObject({
      status: 'RESOLVED',
    });
    await expect(
      db.eventClaim.create({
        data: {
          eventId: crypto.randomUUID(),
          claimId: eligible.claim.id,
          matchDecision: 'MATCH_EXISTING',
          matchReason: 'invalid',
        },
      }),
    ).rejects.toBeTruthy();
  });
});

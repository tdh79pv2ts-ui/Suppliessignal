import { describe, expect, it } from 'vitest';
import {
  aggregateEventConfidence,
  buildEventFingerprint,
  calculateEventSeverity,
  canTransitionEventStatus,
  classifyClaimSignal,
  claimEligibility,
  claimTypeToEventType,
  createEventPolicy,
  eventTypeSchema,
  matchEvent,
  normalizeEventEntity,
  normalizeEventLocation,
  supportingClaimsConflict,
} from '../../packages/shared/src/event-intelligence';
const candidate = {
  id: 'event-1',
  fingerprint: 'exact',
  eventType: 'STRIKE',
  assertionMode: 'OBSERVED',
  startDate: new Date('2026-03-02'),
  occurredAt: null,
  entities: [{ normalizedKey: 'FACTORY:north terminal' }],
  locations: [{ normalizedKey: 'netherlands::rotterdam:rotterdam' }],
};
describe('Phase 5 deterministic event intelligence', () => {
  it('validates taxonomy and normalizes Claim types', () => {
    expect(eventTypeSchema.parse('PORT_CLOSURE')).toBe('PORT_CLOSURE');
    expect(eventTypeSchema.safeParse('CLICKBAIT').success).toBe(false);
    expect(claimTypeToEventType('LABOUR_DISRUPTION')).toBe('LABOR_DISRUPTION');
    expect(claimTypeToEventType('OTHER')).toBeNull();
  });
  it('centralizes configurable Claim eligibility', () => {
    const policy = createEventPolicy({ minimumClaimConfidence: 0.75 });
    expect(
      claimEligibility(
        {
          extractionStatus: 'COMPLETED',
          claimType: 'STRIKE',
          confidence: 0.8,
          evidenceText: 'evidence',
          entityCount: 1,
          locationCount: 0,
        },
        policy,
      ).eligible,
    ).toBe(true);
    expect(
      claimEligibility(
        {
          extractionStatus: 'FAILED',
          claimType: 'STRIKE',
          confidence: 0.8,
          evidenceText: 'evidence',
          entityCount: 1,
          locationCount: 0,
        },
        policy,
      ),
    ).toMatchObject({ eligible: false, code: 'EXTRACTION_NOT_SUCCESSFUL' });
    expect(
      claimEligibility(
        {
          extractionStatus: 'COMPLETED',
          claimType: 'STRIKE',
          confidence: 0.74,
          evidenceText: 'evidence',
          entityCount: 1,
          locationCount: 0,
        },
        policy,
      ),
    ).toMatchObject({ eligible: false, code: 'CLAIM_CONFIDENCE_TOO_LOW' });
    expect(
      claimEligibility(
        {
          extractionStatus: 'COMPLETED',
          claimType: 'STRIKE',
          confidence: 0.8,
          evidenceText: 'evidence',
          entityCount: 0,
          locationCount: 0,
        },
        policy,
      ),
    ).toMatchObject({ eligible: false, code: 'CLAIM_CONTEXT_REQUIRED' });
  });
  it('normalizes conservative exact entity/location keys', () => {
    expect(
      normalizeEventEntity({
        entityType: 'FACTORY',
        name: ' North  Terminal ',
      }),
    ).toMatchObject({
      entityType: 'FACTORY',
      normalizedName: 'north terminal',
      normalizedKey: 'FACTORY:north terminal',
    });
    expect(
      normalizeEventLocation({
        name: 'Rotterdam',
        city: 'Rotterdam',
        country: 'Netherlands',
      }),
    ).toMatchObject({
      normalizedKey: 'netherlands::rotterdam:rotterdam',
      locationType: 'CITY',
    });
  });
  it('fingerprints assertion and temporal buckets independently', () => {
    const common = {
      eventType: 'STRIKE' as const,
      primaryEntityKey: 'FACTORY:north terminal',
      primaryLocationKey: 'netherlands::rotterdam:rotterdam',
      eventDate: new Date('2026-03-02'),
    };
    expect(
      buildEventFingerprint({ ...common, assertionMode: 'OBSERVED' }),
    ).not.toBe(buildEventFingerprint({ ...common, assertionMode: 'FORECAST' }));
  });
  it('matches exact/single candidates and refuses ambiguous silent merges', () => {
    expect(
      matchEvent(
        {
          fingerprint: 'exact',
          eventType: 'STRIKE',
          assertionMode: 'OBSERVED',
          eventDate: new Date('2026-03-02'),
          entityKeys: ['FACTORY:north terminal'],
          locationKeys: [],
        },
        [candidate],
      ),
    ).toMatchObject({ decision: 'MATCH_EXISTING', eventId: 'event-1' });
    const input = {
      fingerprint: 'other',
      eventType: 'STRIKE',
      assertionMode: 'OBSERVED',
      eventDate: new Date('2026-03-03'),
      entityKeys: ['FACTORY:north terminal'],
      locationKeys: [],
    };
    expect(matchEvent(input, [candidate])).toMatchObject({
      decision: 'MATCH_EXISTING',
    });
    expect(
      matchEvent(input, [
        candidate,
        { ...candidate, id: 'event-2', fingerprint: 'other-2' },
      ]),
    ).toMatchObject({
      decision: 'AMBIGUOUS',
      candidateEventIds: ['event-1', 'event-2'],
    });
    expect(
      matchEvent({ ...input, eventType: 'FIRE' }, [candidate]),
    ).toMatchObject({ decision: 'CREATE_NEW' });
  });
  it('aggregates confidence using unique source corroboration and conflict penalty', () => {
    expect(
      aggregateEventConfidence([
        { confidence: 0.8, articleId: 'a', sourceId: 's', conflicting: false },
      ]),
    ).toBe(0.8);
    expect(
      aggregateEventConfidence([
        { confidence: 0.8, articleId: 'a', sourceId: 's', conflicting: false },
        { confidence: 0.7, articleId: 'a', sourceId: 's', conflicting: false },
      ]),
    ).toBe(0.8);
    expect(
      aggregateEventConfidence([
        { confidence: 0.8, articleId: 'a', sourceId: 's1', conflicting: false },
        { confidence: 0.7, articleId: 'b', sourceId: 's2', conflicting: false },
      ]),
    ).toBe(0.85);
    expect(
      aggregateEventConfidence([
        { confidence: 0.8, articleId: 'a', sourceId: 's1', conflicting: true },
        { confidence: 0.7, articleId: 'b', sourceId: 's2', conflicting: true },
      ]),
    ).toBe(0.65);
  });
  it('calculates operational severity', () => {
    expect(calculateEventSeverity('PORT_CLOSURE', 2)).toBe('CRITICAL');
    expect(calculateEventSeverity('PORT_DISRUPTION', 1)).toBe('HIGH');
    expect(calculateEventSeverity('OTHER', 1)).toBe('LOW');
  });
  it.each([
    ['The strike was cancelled.', 'CANCELLATION_SIGNAL'],
    ['The strike was not cancelled.', 'AFFIRMS_EVENT'],
    ['Officials denied reports that the strike was cancelled.', 'NEUTRAL'],
    ['No disruption occurred.', 'DENIES_EVENT'],
    ['The port remains operational.', 'DENIES_EVENT'],
    ['The port reopened after being closed.', 'RESOLUTION_SIGNAL'],
    ['The strike continues.', 'AFFIRMS_EVENT'],
  ])('classifies %s as %s', (statement, signal) => {
    expect(classifyClaimSignal(statement)).toBe(signal);
  });
  it('detects only genuinely incompatible supporting Claim signals', () => {
    expect(supportingClaimsConflict(['AFFIRMS_EVENT', 'DENIES_EVENT'])).toBe(
      true,
    );
    expect(
      supportingClaimsConflict(['AFFIRMS_EVENT', 'RESOLUTION_SIGNAL']),
    ).toBe(false);
    expect(
      supportingClaimsConflict(['AFFIRMS_EVENT', 'CANCELLATION_SIGNAL']),
    ).toBe(false);
    expect(supportingClaimsConflict(['AFFIRMS_EVENT', 'AFFIRMS_EVENT'])).toBe(
      false,
    );
  });
  it('rejects invalid policy configuration', () => {
    expect(() => createEventPolicy({ minimumClaimConfidence: 1.01 })).toThrow();
  });
  it('enforces explicit lifecycle transitions', () => {
    expect(canTransitionEventStatus('DETECTED', 'ACTIVE')).toBe(true);
    expect(canTransitionEventStatus('DETECTED', 'RESOLVED')).toBe(false);
    expect(canTransitionEventStatus('ACTIVE', 'RESOLVED')).toBe(true);
    expect(canTransitionEventStatus('CANCELLED', 'ACTIVE')).toBe(false);
  });
});

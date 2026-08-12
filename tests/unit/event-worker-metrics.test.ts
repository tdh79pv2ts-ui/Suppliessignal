import { describe, expect, it } from 'vitest';
import {
  processingMetadata,
  eventPolicyFromEnvironment,
} from '../../apps/api/src/services/event-intelligence';
import { addEventProcessingMetrics } from '../../apps/api/src/services/event-worker-metrics';

describe('Phase 5 event worker metrics and runtime policy', () => {
  it.each([
    ['eventsCreated', 1],
    ['claimsAttachedToExisting', 1],
    ['ambiguousMatches', 1],
    ['conflictsDetected', 1],
  ] as const)(
    'increments %s from explicit process metadata',
    (field, value) => {
      const result = addEventProcessingMetrics(processingMetadata(), {
        processingMetadata: processingMetadata({
          claimsProcessed: 1,
          [field]: value,
        }),
      });
      expect(result[field]).toBe(1);
      expect(result.claimsProcessed).toBe(1);
    },
  );

  it('validates configurable minimum confidence without global state', () => {
    expect(
      eventPolicyFromEnvironment({ EVENT_MIN_CLAIM_CONFIDENCE: '0.72' })
        .minimumClaimConfidence,
    ).toBe(0.72);
    expect(() =>
      eventPolicyFromEnvironment({ EVENT_MIN_CLAIM_CONFIDENCE: '-0.1' }),
    ).toThrow();
    expect(() =>
      eventPolicyFromEnvironment({ EVENT_MIN_CLAIM_CONFIDENCE: 'invalid' }),
    ).toThrow();
  });
});

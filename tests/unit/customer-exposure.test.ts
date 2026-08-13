import { describe, expect, it } from 'vitest';
import { graphIdentitySchema, normalizeIdentifier } from '../../packages/shared/src/customer-exposure';

describe('customer exposure identity normalization', () => {
  it('normalizes authoritative identifiers deterministically', () => {
    expect(normalizeIdentifier('  nl-123   45 ')).toBe('NL-123 45');
  });
  it('rejects an empty normalized identifier', () => {
    expect(graphIdentitySchema.safeParse({ subjectType: 'SUPPLIER', subjectId: crypto.randomUUID(), namespace: 'DUNS', identifier: '   ', verificationStatus: 'UNVERIFIED', provenanceSource: 'fixture' }).success).toBe(false);
  });
});

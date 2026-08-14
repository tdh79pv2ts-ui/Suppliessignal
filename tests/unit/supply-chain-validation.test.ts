import { describe, expect, it } from 'vitest';
import { companyCreateSchema, factoryCreateSchema, portCreateSchema, relationshipProvenanceSchema, routeCreateSchema, supplierCreateSchema } from '../../packages/shared/src/supply-chain';

const supplier = { name: 'Test Supplier', country: 'Bangladesh', tier: 'TIER_1', criticality: 'HIGH' };
describe('supply-chain validation', () => {
  it.each([[-91, 0], [91, 0], [0, -181], [0, 181]])('rejects invalid coordinates (%s, %s)', (latitude, longitude) => {
    expect(supplierCreateSchema.safeParse({ ...supplier, latitude, longitude }).success).toBe(false);
  });
  it('rejects invalid enums', () => { expect(supplierCreateSchema.safeParse({ ...supplier, tier: 'PRIMARY' }).success).toBe(false); expect(routeCreateSchema.safeParse({ name: 'Route', originLabel: 'A', destinationLabel: 'B', transportMode: 'SHIP', criticality: 'HIGH' }).success).toBe(false); });
  it('rejects missing required fields', () => { expect(factoryCreateSchema.safeParse({ country: 'China', criticality: 'HIGH' }).success).toBe(false); });
  it('accepts valid port master data', () => { expect(portCreateSchema.safeParse({ name: 'Port', country: 'Thailand', latitude: 13.1, longitude: 100.8 }).success).toBe(true); });
  it('requires valid provenance for companies and graph relationships', () => {
    expect(companyCreateSchema.safeParse({ name: 'Company', sourceName: 'Annual report', sourceUrl: 'https://example.com/report.pdf', verifiedAt: '2026-08-14' }).success).toBe(true);
    expect(companyCreateSchema.safeParse({ name: 'Company', sourceName: 'Annual report', sourceUrl: 'file:///report.pdf', verifiedAt: '2026-08-14' }).success).toBe(false);
    expect(relationshipProvenanceSchema.safeParse({ sourceName: 'Disclosure', sourceUrl: 'https://example.com/disclosure', collectedAt: '2026-08-14', confidence: 1.1 }).success).toBe(false);
  });
});

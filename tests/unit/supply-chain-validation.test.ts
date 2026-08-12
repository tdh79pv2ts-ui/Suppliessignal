import { describe, expect, it } from 'vitest';
import { factoryCreateSchema, portCreateSchema, routeCreateSchema, supplierCreateSchema } from '../../packages/shared/src/supply-chain';

const supplier = { name: 'Fictional Supplier', country: 'Bangladesh', tier: 'TIER_1', criticality: 'HIGH' };
describe('supply-chain validation', () => {
  it.each([[-91, 0], [91, 0], [0, -181], [0, 181]])('rejects invalid coordinates (%s, %s)', (latitude, longitude) => {
    expect(supplierCreateSchema.safeParse({ ...supplier, latitude, longitude }).success).toBe(false);
  });
  it('rejects invalid enums', () => { expect(supplierCreateSchema.safeParse({ ...supplier, tier: 'PRIMARY' }).success).toBe(false); expect(routeCreateSchema.safeParse({ name: 'Route', originLabel: 'A', destinationLabel: 'B', transportMode: 'SHIP', criticality: 'HIGH' }).success).toBe(false); });
  it('rejects missing required fields', () => { expect(factoryCreateSchema.safeParse({ country: 'China', criticality: 'HIGH' }).success).toBe(false); });
  it('accepts valid port master data', () => { expect(portCreateSchema.safeParse({ name: 'Port', country: 'Thailand', latitude: 13.1, longitude: 100.8 }).success).toBe(true); });
});

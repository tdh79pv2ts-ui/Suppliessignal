import { describe, expect, it } from 'vitest';
import { assertEntityBelongsToCustomer } from '../../apps/api/src/services/supply-chain';

describe('supply-chain cross-tenant integrity', () => {
  it.each([
    ['product', 'Customer A factory cannot attach to a Customer B product'],
    ['supplier', 'Customer A route cannot attach to a Customer B supplier'],
    ['factory', 'Customer A route cannot attach to a Customer B factory'],
  ] as const)('rejects a cross-customer %s relationship', (kind) => {
    expect(() => assertEntityBelongsToCustomer('customer-a', { customerId: 'customer-b' }, kind)).toThrowError(
      expect.objectContaining({ code: 'CROSS_CUSTOMER_RELATIONSHIP' }),
    );
  });

  it('accepts an explicitly customer-owned entity', () => {
    expect(() => assertEntityBelongsToCustomer('customer-a', { customerId: 'customer-a' }, 'route')).not.toThrow();
  });
});

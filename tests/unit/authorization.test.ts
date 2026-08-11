import { describe, expect, it } from 'vitest';
import { assertCustomerAccess } from '../../apps/api/src/auth';
import type { AuthenticatedUser } from '../../packages/shared/src/types';

const customer: AuthenticatedUser = { id: crypto.randomUUID(), email: 'customer@example.com', name: null, role: 'CUSTOMER', customerId: '5a6ce6b4-0d65-4d16-90dc-04b751f5169b' };

describe('customer authorization', () => {
  it('allows a customer to access only its own account', () => {
    expect(assertCustomerAccess(customer, customer.customerId!)).toBe(true);
    expect(assertCustomerAccess(customer, crypto.randomUUID())).toBe(false);
  });

  it('allows reviewers to inspect customer accounts', () => {
    expect(assertCustomerAccess({ ...customer, role: 'REVIEWER', customerId: null }, crypto.randomUUID())).toBe(true);
  });
});

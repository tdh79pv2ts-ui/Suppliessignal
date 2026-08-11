import { describe, expect, it } from 'vitest';
import { assertCustomerAccess } from '../../apps/api/src/auth';
import type { AuthenticatedUser } from '../../packages/shared/src/types';

const assignedCustomerId = '5a6ce6b4-0d65-4d16-90dc-04b751f5169b';
const customer: AuthenticatedUser = {
  id: crypto.randomUUID(),
  email: 'customer@example.com',
  name: null,
  role: 'CUSTOMER',
  customerIds: [assignedCustomerId],
};

describe('customer authorization', () => {
  it('allows a member to access an assigned customer only', () => {
    expect(assertCustomerAccess(customer, assignedCustomerId)).toBe(true);
    expect(assertCustomerAccess(customer, crypto.randomUUID())).toBe(false);
  });

  it('does not grant reviewers implicit platform-wide access', () => {
    const reviewer = { ...customer, role: 'REVIEWER' as const };
    expect(assertCustomerAccess(reviewer, assignedCustomerId)).toBe(true);
    expect(assertCustomerAccess(reviewer, crypto.randomUUID())).toBe(false);
  });

  it('grants administrators platform-wide access', () => {
    expect(assertCustomerAccess({ ...customer, role: 'ADMIN', customerIds: [] }, crypto.randomUUID())).toBe(true);
  });
});

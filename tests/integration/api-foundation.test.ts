import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { ServerEnv } from '../../packages/shared/src/env';
import type { AuthenticatedUser } from '../../packages/shared/src/types';
import { createApp } from '../../apps/api/src/app';

const env: ServerEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/test',
  API_PORT: 4000,
  WEB_ORIGIN: 'http://localhost:5173',
  ALLOW_DEV_AUTH: true,
  LOG_LEVEL: 'fatal',
};

const assignedCustomerId = '5a6ce6b4-0d65-4d16-90dc-04b751f5169b';
const unassignedCustomerId = '79364f24-2831-456d-81fc-840f6d464ccb';
const customerUser: AuthenticatedUser = {
  id: crypto.randomUUID(),
  email: 'customer@example.com',
  name: 'Customer',
  role: 'CUSTOMER',
  customerIds: [assignedCustomerId],
};

function requestAs(user: AuthenticatedUser | null) {
  return request(createApp({ env, resolveUser: async () => user }));
}

describe('API foundation', () => {
  it('reports health without authentication', async () => {
    const response = await requestAs(null).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok', service: 'suppliesignal-api' });
  });

  it('rejects protected routes without authentication', async () => {
    const response = await requestAs(null).get('/api/me');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns the authenticated application user', async () => {
    const response = await requestAs(customerUser).get('/api/me');
    expect(response.status).toBe(200);
    expect(response.body.data.email).toBe(customerUser.email);
    expect(response.body.data.customerIds).toEqual([assignedCustomerId]);
  });

  it('allows a customer user to access an assigned customer', async () => {
    const response = await requestAs(customerUser).get(`/api/customers/${assignedCustomerId}/foundation`);
    expect(response.status).toBe(200);
  });

  it('denies a customer user access to another customer', async () => {
    const response = await requestAs(customerUser).get(`/api/customers/${unassignedCustomerId}/foundation`);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CUSTOMER_ACCESS_DENIED');
  });

  it('allows a reviewer to access an assigned customer', async () => {
    const reviewer = { ...customerUser, role: 'REVIEWER' as const };
    const response = await requestAs(reviewer).get(`/api/customers/${assignedCustomerId}/foundation`);
    expect(response.status).toBe(200);
  });

  it('denies a reviewer access to an unassigned customer', async () => {
    const reviewer = { ...customerUser, role: 'REVIEWER' as const };
    const response = await requestAs(reviewer).get(`/api/customers/${unassignedCustomerId}/foundation`);
    expect(response.status).toBe(403);
  });

  it('allows an administrator to access every customer', async () => {
    const admin = { ...customerUser, role: 'ADMIN' as const, customerIds: [] };
    const response = await requestAs(admin).get(`/api/customers/${unassignedCustomerId}/foundation`);
    expect(response.status).toBe(200);
  });

  it('refuses to start with development auth enabled in production', () => {
    expect(() =>
      createApp({
        env: { ...env, NODE_ENV: 'production', ALLOW_DEV_AUTH: true },
        resolveUser: async () => customerUser,
      }),
    ).toThrow('ALLOW_DEV_AUTH must be false');
  });
});

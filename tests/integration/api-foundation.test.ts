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

const user: AuthenticatedUser = { id: crypto.randomUUID(), email: 'customer@example.com', name: 'Customer', role: 'CUSTOMER', customerId: '5a6ce6b4-0d65-4d16-90dc-04b751f5169b' };

describe('API foundation', () => {
  it('reports health without authentication', async () => {
    const response = await request(createApp({ env, resolveUser: async () => null })).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok', service: 'suppliesignal-api' });
  });

  it('rejects protected routes without authentication', async () => {
    const response = await request(createApp({ env, resolveUser: async () => null })).get('/api/me');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns the authenticated application user', async () => {
    const response = await request(createApp({ env, resolveUser: async () => user })).get('/api/me');
    expect(response.status).toBe(200);
    expect(response.body.data.email).toBe(user.email);
  });

  it('enforces customer isolation server-side', async () => {
    const response = await request(createApp({ env, resolveUser: async () => user })).get(`/api/customers/${crypto.randomUUID()}/foundation`);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CUSTOMER_ACCESS_DENIED');
  });
});

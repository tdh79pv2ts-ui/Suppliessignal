import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../packages/shared/src/types';
import { createCustomerExposureRouter } from '../../apps/api/src/routes/customer-exposure';
import type { CustomerExposureService } from '../../apps/api/src/services/customer-exposure';

const customerA = '11111111-1111-4111-8111-111111111111';
const customerB = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
function app(role: AuthenticatedUser['role'], memberships: string[] = [customerA]) {
  const service = new Proxy({}, { get: () => vi.fn(async () => []) }) as CustomerExposureService;
  const instance = express(); instance.use(express.json());
  instance.use('/api', createCustomerExposureRouter(async () => ({ id, email: 'user@example.test', name: 'User', role, customerIds: memberships }), service));
  return instance;
}

describe('Phase 6 membership authorization', () => {
  it('allows a CUSTOMER to read only its confirmed customer exposure view', async () => {
    expect((await request(app('CUSTOMER')).get(`/api/customers/${customerA}/exposures`)).status).toBe(200);
    expect((await request(app('CUSTOMER')).get(`/api/customers/${customerB}/exposures`)).status).toBe(403);
    expect((await request(app('CUSTOMER')).get(`/api/customers/${customerA}/exposure-candidates`)).status).toBe(403);
  });
  it('allows assigned REVIEWER review access but no global identity verification', async () => {
    expect((await request(app('REVIEWER')).get(`/api/customers/${customerA}/exposure-candidates`)).status).toBe(200);
    expect((await request(app('REVIEWER')).get(`/api/customers/${customerB}/exposure-candidates`)).status).toBe(403);
    expect((await request(app('REVIEWER')).post(`/api/admin/event-identifiers/${id}/verify`)).status).toBe(403);
  });
  it('allows ADMIN platform-wide customer and global identity access', async () => {
    expect((await request(app('ADMIN', [])).get(`/api/customers/${customerB}/exposure-candidates`)).status).toBe(200);
    expect((await request(app('ADMIN', [])).post(`/api/admin/event-identifiers/${id}/verify`)).status).toBe(200);
  });
});

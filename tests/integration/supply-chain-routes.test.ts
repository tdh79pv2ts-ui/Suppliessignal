import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../packages/shared/src/types';
import { createSupplyChainRouter, supplyChainErrorHandler } from '../../apps/api/src/routes/supply-chain';
import type { SupplyChainService } from '../../apps/api/src/services/supply-chain';
import { ServiceError } from '../../apps/api/src/services/errors';

const customerId = '5a6ce6b4-0d65-4d16-90dc-04b751f5169b';
const otherCustomerId = '79364f24-2831-456d-81fc-840f6d464ccb';
const entityId = '11111111-1111-4111-8111-111111111111';
const targetId = '22222222-2222-4222-8222-222222222222';
const member: AuthenticatedUser = { id: crypto.randomUUID(), email: 'member@example.com', name: 'Member', role: 'CUSTOMER', customerIds: [customerId] };
const admin: AuthenticatedUser = { ...member, role: 'ADMIN', customerIds: [] };

function testApp(user: AuthenticatedUser | null, overrides: Record<string, (...args: unknown[]) => unknown> = {}) {
  const defaults = new Proxy({}, { get: (_target, property) => overrides[String(property)] ?? vi.fn(async () => ({ id: entityId, name: 'Record', active: true, items: [], pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 } })) }) as SupplyChainService;
  const app = express(); app.use(express.json()); app.use('/api', createSupplyChainRouter(async () => user, defaults)); app.use(supplyChainErrorHandler); return app;
}

describe('supply-chain API routes', () => {
  const createBodies = {
    suppliers: { name: 'Supplier', country: 'Bangladesh', tier: 'TIER_1', criticality: 'HIGH' },
    factories: { name: 'Factory', country: 'Bangladesh', criticality: 'HIGH' },
    products: { name: 'Product', criticality: 'HIGH' },
    materials: { name: 'Material', criticality: 'HIGH', substitutable: false },
    routes: { name: 'Route', originLabel: 'A', destinationLabel: 'B', transportMode: 'SEA', criticality: 'HIGH' },
  };
  for (const [entity, body] of Object.entries(createBodies)) {
    it(`supports create, read, update, and archive for ${entity}`, async () => {
      const app = testApp(member);
      expect((await request(app).post(`/api/customers/${customerId}/${entity}`).send(body)).status).toBe(201);
      expect((await request(app).get(`/api/customers/${customerId}/${entity}/${entityId}`)).status).toBe(200);
      expect((await request(app).patch(`/api/customers/${customerId}/${entity}/${entityId}`).send({ name: 'Updated' })).status).toBe(200);
      expect((await request(app).post(`/api/customers/${customerId}/${entity}/${entityId}/archive`)).status).toBe(200);
    });
  }
  it('enforces graph membership and admin override', async () => {
    expect((await request(testApp(member)).get(`/api/customers/${customerId}/supply-chain`)).status).toBe(200);
    expect((await request(testApp(member)).get(`/api/customers/${otherCustomerId}/supply-chain`)).status).toBe(403);
    expect((await request(testApp(admin)).get(`/api/customers/${otherCustomerId}/supply-chain`)).status).toBe(200);
  });
  it('supports relationship attach/remove and ordered ports', async () => {
    const app = testApp(member);
    expect((await request(app).post(`/api/customers/${customerId}/suppliers/${entityId}/products`).send({ targetId })).status).toBe(201);
    expect((await request(app).delete(`/api/customers/${customerId}/suppliers/${entityId}/products/${targetId}`)).status).toBe(204);
    expect((await request(app).post(`/api/customers/${customerId}/routes/${entityId}/ports`).send({ portId: targetId, sequence: 1 })).status).toBe(201);
    expect((await request(app).put(`/api/customers/${customerId}/routes/${entityId}/ports`).send({ ports: [{ portId: targetId, sequence: 1 }] })).status).toBe(200);
  });
  it('maps duplicate and cross-customer relationship errors safely', async () => {
    const duplicate = testApp(member, { attach: async () => { throw new ServiceError('RELATIONSHIP_ALREADY_EXISTS', 'Relationship already exists', 409); } });
    const response = await request(duplicate).post(`/api/customers/${customerId}/suppliers/${entityId}/products`).send({ targetId });
    expect(response.status).toBe(409); expect(response.body.error.code).toBe('RELATIONSHIP_ALREADY_EXISTS');
  });
  it('prevents non-admin port mutation and allows admins', async () => {
    const body = { name: 'Port', country: 'Thailand' };
    expect((await request(testApp(member)).post('/api/ports').send(body)).status).toBe(403);
    expect((await request(testApp(admin)).post('/api/ports').send(body)).status).toBe(201);
  });
  it('allows a customer to create a port only with an explicit owned route link', async () => {
    const body = { name: 'Customer Port', country: 'Thailand', routeId: entityId, sequence: 1 };
    expect((await request(testApp(member)).post(`/api/customers/${customerId}/ports`).send(body)).status).toBe(201);
    expect((await request(testApp(member)).post(`/api/customers/${otherCustomerId}/ports`).send(body)).status).toBe(403);
  });
  it('rejects invalid UUIDs and request bodies', async () => {
    expect((await request(testApp(member)).get(`/api/customers/${customerId}/suppliers/not-a-uuid`)).status).toBe(400);
    expect((await request(testApp(member)).post(`/api/customers/${customerId}/suppliers`).send({ name: 'Missing fields' })).status).toBe(400);
    expect((await request(testApp(member)).get('/api/customers/not-a-uuid/suppliers')).body.error.code).toBe('VALIDATION_ERROR');
  });
});

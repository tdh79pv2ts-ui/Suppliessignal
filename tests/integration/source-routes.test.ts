import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../packages/shared/src/types';
import { createSourceIntelligenceRouter } from '../../apps/api/src/routes/source-intelligence';
import type { SourceIntelligenceService } from '../../apps/api/src/services/source-intelligence';
const id = '11111111-1111-4111-8111-111111111111';
const base: AuthenticatedUser = {
  id,
  email: 'user@example.test',
  name: 'User',
  role: 'ADMIN',
  customerIds: [],
};
function app(role: AuthenticatedUser['role']) {
  const service = new Proxy(
    {},
    {
      get: (_t, p) =>
        vi.fn(async () =>
          p === 'listSources'
            ? { items: [], pagination: {} }
            : { id, name: 'Source' },
        ),
    },
  ) as SourceIntelligenceService;
  const a = express();
  a.use(express.json());
  a.use(
    '/api',
    createSourceIntelligenceRouter(async () => ({ ...base, role }), service),
  );
  return a;
}
describe('source authorization and validation', () => {
  const body = {
    name: 'Source',
    sourceType: 'WEB',
    baseUrl: 'https://public.example',
    category: 'NEWS',
    reliability: 'HIGH',
  };
  it('allows admin create/update/disable', async () => {
    expect(
      (await request(app('ADMIN')).post('/api/sources').send(body)).status,
    ).toBe(201);
    expect(
      (
        await request(app('ADMIN'))
          .patch(`/api/sources/${id}`)
          .send({ active: false })
      ).status,
    ).toBe(200);
  });
  it('allows reviewer read but rejects modification', async () => {
    expect((await request(app('REVIEWER')).get('/api/sources')).status).toBe(
      200,
    );
    expect(
      (await request(app('REVIEWER')).post('/api/sources').send(body)).status,
    ).toBe(403);
  });
  it('denies customer corpus access', async () => {
    expect((await request(app('CUSTOMER')).get('/api/sources')).status).toBe(
      403,
    );
    expect(
      (await request(app('CUSTOMER')).get('/api/source-articles')).status,
    ).toBe(403);
  });
  it('rejects invalid protocols and enums', async () => {
    expect(
      (
        await request(app('ADMIN'))
          .post('/api/sources')
          .send({ ...body, baseUrl: 'file:///tmp/a' })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app('ADMIN'))
          .post('/api/sources')
          .send({ ...body, category: 'RISK' })
      ).status,
    ).toBe(400);
  });
});

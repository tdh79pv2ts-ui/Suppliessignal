import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../packages/shared/src/types';
import { createEventRouter } from '../../apps/api/src/routes/events';
import type { EventIntelligenceService } from '../../apps/api/src/services/event-intelligence';
const id = '11111111-1111-4111-8111-111111111111';
const user: AuthenticatedUser = {
  id,
  email: 'user@example.test',
  name: 'User',
  role: 'ADMIN',
  customerIds: [],
};
function app(role: AuthenticatedUser['role'], authenticated = true) {
  const service = new Proxy(
    {},
    { get: () => vi.fn(async () => ({ items: [], pagination: {} })) },
  ) as EventIntelligenceService;
  const instance = express();
  instance.use(express.json());
  instance.use(
    '/api',
    createEventRouter(
      async () => (authenticated ? { ...user, role } : null),
      service,
    ),
  );
  return instance;
}
describe('event authorization and validation', () => {
  it('allows ADMIN reads, processing, and lifecycle actions', async () => {
    expect((await request(app('ADMIN')).get('/api/events')).status).toBe(200);
    expect(
      (await request(app('ADMIN')).post(`/api/events/process-claim/${id}`))
        .status,
    ).toBe(202);
    expect(
      (
        await request(app('ADMIN'))
          .patch(`/api/events/${id}/status`)
          .send({ status: 'ACTIVE' })
      ).status,
    ).toBe(200);
  });
  it('allows REVIEWER inspection but denies mutation', async () => {
    expect((await request(app('REVIEWER')).get('/api/events')).status).toBe(
      200,
    );
    expect(
      (await request(app('REVIEWER')).get(`/api/events/${id}`)).status,
    ).toBe(200);
    expect(
      (await request(app('REVIEWER')).post(`/api/events/process-claim/${id}`))
        .status,
    ).toBe(403);
  });
  it('denies CUSTOMER and unauthenticated access', async () => {
    expect((await request(app('CUSTOMER')).get('/api/events')).status).toBe(
      403,
    );
    expect((await request(app('ADMIN', false)).get('/api/events')).status).toBe(
      401,
    );
  });
  it('validates IDs and filters', async () => {
    expect(
      (await request(app('ADMIN')).get('/api/events/not-a-uuid')).status,
    ).toBe(400);
    expect(
      (await request(app('ADMIN')).get('/api/events?eventType=INVALID')).status,
    ).toBe(400);
  });
});

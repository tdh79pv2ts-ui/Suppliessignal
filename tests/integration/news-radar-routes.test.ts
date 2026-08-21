import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../packages/shared/src/types';
import { createNewsRadarRouter } from '../../apps/api/src/routes/news-radar';
import type { NewsRadarService } from '../../apps/api/src/services/news-radar';
import type { DailyBriefService } from '../../apps/api/src/services/daily-brief';

const customerA = '11111111-1111-4111-8111-111111111111';
const customerB = '22222222-2222-4222-8222-222222222222';
const articleId = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444';

function app(role: AuthenticatedUser['role'], memberships = [customerA], authenticated = true) {
  const service = new Proxy({}, { get: () => vi.fn(async () => []) }) as NewsRadarService;
  const briefs = new Proxy({}, { get: () => vi.fn(async () => ({})) }) as DailyBriefService;
  const instance = express(); instance.use(express.json());
  instance.use('/api', createNewsRadarRouter(async () => authenticated ? ({ id: userId, email: 'radar@example.test', name: 'Radar', role, customerIds: memberships }) : null, service, briefs));
  return instance;
}

describe('news radar authorization', () => {
  it('allows a customer to read its own radar but not another customer', async () => {
    expect((await request(app('CUSTOMER')).get(`/api/customers/${customerA}/news-radar`)).status).toBe(200);
    expect((await request(app('CUSTOMER')).get(`/api/customers/${customerA}/relevant-articles`)).status).toBe(200);
    expect((await request(app('CUSTOMER')).get(`/api/customers/${customerB}/news-radar`)).status).toBe(403);
    expect((await request(app('CUSTOMER')).get(`/api/customers/${customerB}/relevant-articles`)).status).toBe(403);
  });
  it('requires ADMIN to process global articles', async () => {
    expect((await request(app('REVIEWER')).post(`/api/admin/news-radar/articles/${articleId}/process`)).status).toBe(403);
    expect((await request(app('ADMIN', [])).post(`/api/admin/news-radar/articles/${articleId}/process`)).status).toBe(202);
  });
  it('rejects unauthenticated radar access', async () => {
    expect((await request(app('CUSTOMER', [customerA], false)).get(`/api/customers/${customerA}/news-radar`)).status).toBe(401);
  });
  it('keeps daily briefs and preferences membership-scoped', async () => {
    expect((await request(app('CUSTOMER')).get(`/api/customers/${customerA}/daily-brief`)).status).toBe(200);
    expect((await request(app('CUSTOMER')).put(`/api/customers/${customerA}/daily-brief-preference`).send({ enabled: false, deliveryTime: '08:00', timezone: 'UTC', email: 'brief@example.test', language: 'en' })).status).toBe(200);
    expect((await request(app('CUSTOMER')).get(`/api/customers/${customerB}/daily-brief`)).status).toBe(403);
  });
});

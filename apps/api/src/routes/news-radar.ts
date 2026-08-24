import { Router, type NextFunction, type Request, type Response, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import {
  customerParamsSchema,
  dailyBriefDateSchema,
  dailyBriefPreferenceSchema,
  customMonitoringTagSchema,
  monitoringTagParamsSchema,
  monitoringTagUpdateSchema,
  customerSourceParamsSchema,
  customerSourcePreferenceSchema,
  enableRecommendedSourcesSchema,
  newsRadarArticleParamsSchema,
  newsRadarExposureParamsSchema,
  newsRadarListSchema,
  type NewsRadarListInput,
  type DailyBriefPreferenceInput,
  type CustomMonitoringTagInput,
  type MonitoringTagUpdateInput,
} from '@suppliesignal/shared';
import { requireAuth, requireCustomerAccess, requireRole, type ResolveUser } from '../auth.js';
import { newsRadarService, type NewsRadarService } from '../services/news-radar.js';
import { dailyBriefService, type DailyBriefService } from '../services/daily-brief.js';
import { monitoringProfileService, type MonitoringProfileService } from '../services/monitoring-profile.js';
import { pocIngestionCoordinator, type PocIngestionCoordinator } from '../services/poc-ingestion-coordinator.js';

const asyncHandler = (fn: (request: Request, response: Response) => Promise<void>) =>
  (request: Request, response: Response, next: NextFunction) => void fn(request, response).catch(next);

function parse<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }, value: unknown, response: Response): T | null {
  const result = schema.safeParse(value);
  if (!result.success) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Request validation failed' } });
    return null;
  }
  return result.data;
}

export function createNewsRadarRouter(
  resolveUser: ResolveUser,
  service: NewsRadarService = newsRadarService,
  briefs: DailyBriefService = dailyBriefService,
  monitoring: MonitoringProfileService = monitoringProfileService,
  ingestion: PocIngestionCoordinator = pocIngestionCoordinator,
): ExpressRouter {
  const router = Router();
  router.use(requireAuth(resolveUser));

  router.get('/customers/:customerId/news-radar', requireCustomerAccess, asyncHandler(async (request, response) => {
    const params = parse(customerParamsSchema, request.params, response);
    if (params && request.authUser) {
      const preference = await briefs.getPreference(params.customerId, request.authUser.id);
      response.json({ data: await service.dashboard(params.customerId, preference.language) });
    }
  }));
  router.get('/customers/:customerId/news-radar/monitoring-profile', requireCustomerAccess, asyncHandler(async (request, response) => {
    const params = parse(customerParamsSchema, request.params, response);
    if (params) response.json({ data: await monitoring.get(params.customerId) });
  }));
  router.post('/customers/:customerId/news-radar/monitoring-tags', requireCustomerAccess, asyncHandler(async (request, response) => {
    const params = parse(customerParamsSchema, request.params, response);
    const body = parse<CustomMonitoringTagInput>(customMonitoringTagSchema, request.body, response);
    if (params && body && request.authUser) response.status(201).json({ data: await monitoring.createCustom(params.customerId, request.authUser.id, body) });
  }));
  router.patch('/customers/:customerId/news-radar/monitoring-tags/:tagId', requireCustomerAccess, asyncHandler(async (request, response) => {
    const params = parse(monitoringTagParamsSchema, request.params, response);
    const body = parse<MonitoringTagUpdateInput>(monitoringTagUpdateSchema, request.body, response);
    if (params && body) response.json({ data: await monitoring.update(params.customerId, params.tagId, body) });
  }));
  router.delete('/customers/:customerId/news-radar/monitoring-tags/:tagId', requireCustomerAccess, asyncHandler(async (request, response) => {
    const params = parse(monitoringTagParamsSchema, request.params, response);
    if (params) response.json({ data: await monitoring.remove(params.customerId, params.tagId) });
  }));
  router.put('/customers/:customerId/news-radar/source-preferences/:sourceId', requireCustomerAccess, asyncHandler(async (request, response) => {
    const params = parse(customerSourceParamsSchema, request.params, response);
    const body = parse<{ enabled: boolean }>(customerSourcePreferenceSchema, request.body, response);
    if (params && body) response.json({ data: await monitoring.setSourceEnabled(params.customerId, params.sourceId, body.enabled) });
  }));
  router.post('/customers/:customerId/news-radar/source-preferences/enable-recommended', requireCustomerAccess, asyncHandler(async (request, response) => {
    const params = parse(customerParamsSchema, request.params, response);
    const body = parse<{ country: string | null }>(enableRecommendedSourcesSchema, request.body, response);
    if (params && body) response.json({ data: await monitoring.enableRecommended(params.customerId, body.country ?? undefined) });
  }));
  router.get('/customers/:customerId/relevant-articles', requireCustomerAccess, asyncHandler(async (request, response) => {
    const params = parse(customerParamsSchema, request.params, response);
    if (params && request.authUser) {
      const preference = await briefs.getPreference(params.customerId, request.authUser.id);
      response.json({ data: await service.listRelevantArticles(params.customerId, preference.language) });
    }
  }));
  router.get('/customers/:customerId/intelligence', requireCustomerAccess, asyncHandler(async (request, response) => {
    const params = parse(customerParamsSchema, request.params, response);
    if (params && request.authUser) {
      const preference = await briefs.getPreference(params.customerId, request.authUser.id);
      response.json({ data: await service.intelligence(params.customerId, preference.language) });
    }
  }));
  router.get('/customers/:customerId/news-radar/exposures', requireCustomerAccess, asyncHandler(async (request, response) => {
    const params = parse(customerParamsSchema, request.params, response);
    const query = parse<NewsRadarListInput>(newsRadarListSchema, request.query, response);
    if (params && query) response.json({ data: await service.listExposures(params.customerId, query) });
  }));
  router.get('/customers/:customerId/news-radar/exposures/:exposureId', requireCustomerAccess, asyncHandler(async (request, response) => {
    const params = parse(newsRadarExposureParamsSchema, request.params, response);
    if (params) response.json({ data: await service.getExposure(params.customerId, params.exposureId) });
  }));
  router.get('/customers/:customerId/daily-brief', requireCustomerAccess, asyncHandler(async (request, response) => {
    const params = parse(customerParamsSchema, request.params, response);
    if (params) response.json({ data: await briefs.latest(params.customerId) });
  }));
  router.post('/customers/:customerId/daily-brief/generate', requireCustomerAccess, asyncHandler(async (request, response) => {
    const params = parse(customerParamsSchema, request.params, response);
    const body = parse(dailyBriefDateSchema, request.body, response);
    if (params && body) response.status(201).json({ data: await briefs.generate(params.customerId, body.date) });
  }));
  router.get('/customers/:customerId/daily-brief-preference', requireCustomerAccess, asyncHandler(async (request, response) => {
    const params = parse(customerParamsSchema, request.params, response);
    if (params && request.authUser) response.json({ data: await briefs.getPreference(params.customerId, request.authUser.id) });
  }));
  router.put('/customers/:customerId/daily-brief-preference', requireCustomerAccess, asyncHandler(async (request, response) => {
    const params = parse(customerParamsSchema, request.params, response);
    const body = parse<DailyBriefPreferenceInput>(dailyBriefPreferenceSchema, request.body, response);
    if (params && body && request.authUser) response.json({ data: await briefs.updatePreference(params.customerId, request.authUser.id, body) });
  }));

  router.get('/customers/:customerId/newsletter-preference', requireCustomerAccess, asyncHandler(async (request, response) => {
    const params = parse(customerParamsSchema, request.params, response);
    if (params && request.authUser) response.json({ data: await briefs.getPreference(params.customerId, request.authUser.id) });
  }));
  router.put('/customers/:customerId/newsletter-preference', requireCustomerAccess, asyncHandler(async (request, response) => {
    const params = parse(customerParamsSchema, request.params, response);
    const body = parse<DailyBriefPreferenceInput>(dailyBriefPreferenceSchema, request.body, response);
    if (params && body && request.authUser) response.json({ data: await briefs.updatePreference(params.customerId, request.authUser.id, body) });
  }));

  router.post('/admin/news-radar/articles/:articleId/process', requireRole('ADMIN'), asyncHandler(async (request, response) => {
    const params = parse(newsRadarArticleParamsSchema, request.params, response);
    if (params) response.status(202).json({ data: await service.processArticle(params.articleId) });
  }));
  router.post('/admin/news-radar/process-pending', requireRole('ADMIN'), asyncHandler(async (_request, response) => {
    response.status(202).json({ data: await service.processPending() });
  }));
  router.get('/admin/poc-ingestion/status', requireRole('ADMIN'), asyncHandler(async (_request, response) => {
    response.json({ data: await ingestion.status() });
  }));
  router.post('/admin/poc-ingestion/run', requireRole('ADMIN'), asyncHandler(async (request, response) => {
    const body = parse(z.object({
      mode: z.enum(['INITIAL_FULL_LOAD', 'DELTA', 'DAILY_RECONCILIATION']).optional(),
      batchSize: z.number().int().min(1).max(100).default(100),
    }), request.body ?? {}, response);
    if (body) response.status(202).json({ data: await ingestion.run(body.batchSize, body.mode) });
  }));
  return router;
}

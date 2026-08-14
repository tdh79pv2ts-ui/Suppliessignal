import { Router, type NextFunction, type Request, type Response, type Router as ExpressRouter } from 'express';
import {
  customerParamsSchema,
  dailyBriefDateSchema,
  newsletterPreferenceSchema,
  newsRadarArticleParamsSchema,
  newsRadarExposureParamsSchema,
  newsRadarListSchema,
  type NewsRadarListInput,
  type NewsletterPreferenceInput,
} from '@suppliesignal/shared';
import { requireAuth, requireCustomerAccess, requireRole, type ResolveUser } from '../auth.js';
import { newsRadarService, type NewsRadarService } from '../services/news-radar.js';
import { dailyBriefService, type DailyBriefService } from '../services/daily-brief.js';

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
): ExpressRouter {
  const router = Router();
  router.use(requireAuth(resolveUser));

  router.get('/customers/:customerId/news-radar', requireCustomerAccess, asyncHandler(async (request, response) => {
    const params = parse(customerParamsSchema, request.params, response);
    if (params) response.json({ data: await service.dashboard(params.customerId) });
  }));
  router.get('/customers/:customerId/news-radar/monitoring-profile', requireCustomerAccess, asyncHandler(async (request, response) => {
    const params = parse(customerParamsSchema, request.params, response);
    if (params) response.json({ data: await service.monitoringProfile(params.customerId) });
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
  router.get('/customers/:customerId/newsletter-preference', requireCustomerAccess, asyncHandler(async (request, response) => {
    const params = parse(customerParamsSchema, request.params, response);
    if (params && request.authUser) response.json({ data: await briefs.getPreference(params.customerId, request.authUser.id) });
  }));
  router.put('/customers/:customerId/newsletter-preference', requireCustomerAccess, asyncHandler(async (request, response) => {
    const params = parse(customerParamsSchema, request.params, response);
    const body = parse<NewsletterPreferenceInput>(newsletterPreferenceSchema, request.body, response);
    if (params && body && request.authUser) response.json({ data: await briefs.updatePreference(params.customerId, request.authUser.id, body) });
  }));

  router.post('/admin/news-radar/articles/:articleId/process', requireRole('ADMIN'), asyncHandler(async (request, response) => {
    const params = parse(newsRadarArticleParamsSchema, request.params, response);
    if (params) response.status(202).json({ data: await service.processArticle(params.articleId) });
  }));
  router.post('/admin/news-radar/process-pending', requireRole('ADMIN'), asyncHandler(async (_request, response) => {
    response.status(202).json({ data: await service.processPending() });
  }));
  return router;
}

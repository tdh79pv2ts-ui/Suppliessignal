import {
  Router,
  type NextFunction,
  type Request,
  type Response,
  type Router as ExpressRouter,
} from 'express';
import {
  articleIdSchema,
  articleListSchema,
  manualArticleSchema,
  sourceCreateSchema,
  sourceIdSchema,
  sourceListSchema,
  sourceUpdateSchema,
  type ManualArticleInput,
  type SourceInput,
} from '@suppliesignal/shared';
import { requireAuth, requireRole, type ResolveUser } from '../auth.js';
import {
  sourceIntelligenceService,
  type SourceIntelligenceService,
} from '../services/source-intelligence.js';
const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
    void fn(req, res).catch(next);
type Schema = {
  safeParse(
    value: unknown,
  ):
    | { success: true; data: unknown }
    | { success: false; error: { flatten(): unknown } };
};
const parse = <T>(schema: Schema, value: unknown, res: Response): T | null => {
  const result = schema.safeParse(value);
  if (!result.success) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: result.error.flatten(),
      },
    });
    return null;
  }
  return result.data as T;
};
const readRoles = requireRole('ADMIN', 'REVIEWER');
export function createSourceIntelligenceRouter(
  resolveUser: ResolveUser,
  service: SourceIntelligenceService = sourceIntelligenceService,
): ExpressRouter {
  const router = Router();
  router.use(requireAuth(resolveUser));
  router.get(
    '/source-metrics',
    readRoles,
    asyncHandler(async (_req, res) => {
      res.json({ data: await service.metrics() });
    }),
  );
  router.get(
    '/sources',
    readRoles,
    asyncHandler(async (req, res) => {
      const q = parse<Record<string, unknown>>(
        sourceListSchema,
        req.query,
        res,
      );
      if (q) res.json({ data: await service.listSources(q as never) });
    }),
  );
  router.get(
    '/sources/:sourceId',
    readRoles,
    asyncHandler(async (req, res) => {
      const p = parse<{ sourceId: string }>(sourceIdSchema, req.params, res);
      if (p) res.json({ data: await service.getSource(p.sourceId) });
    }),
  );
  router.post(
    '/sources',
    requireRole('ADMIN'),
    asyncHandler(async (req, res) => {
      const body = parse<SourceInput>(sourceCreateSchema, req.body, res);
      if (body)
        res.status(201).json({ data: await service.createSource(body) });
    }),
  );
  router.patch(
    '/sources/:sourceId',
    requireRole('ADMIN'),
    asyncHandler(async (req, res) => {
      const p = parse<{ sourceId: string }>(sourceIdSchema, req.params, res);
      const body = parse<Record<string, unknown>>(
        sourceUpdateSchema,
        req.body,
        res,
      );
      if (p && body)
        res.json({ data: await service.updateSource(p.sourceId, body) });
    }),
  );
  router.post(
    '/sources/:sourceId/collect',
    requireRole('ADMIN'),
    asyncHandler(async (req, res) => {
      const p = parse<{ sourceId: string }>(sourceIdSchema, req.params, res);
      if (p) res.status(202).json({ data: await service.collect(p.sourceId) });
    }),
  );
  router.get(
    '/sources/:sourceId/runs',
    readRoles,
    asyncHandler(async (req, res) => {
      const p = parse<{ sourceId: string }>(sourceIdSchema, req.params, res);
      const q = parse<{ page: number; pageSize: number }>(
        sourceListSchema.pick({ page: true, pageSize: true }),
        req.query,
        res,
      );
      if (p && q) res.json({ data: await service.listRuns(p.sourceId, q) });
    }),
  );
  router.get(
    '/source-articles',
    readRoles,
    asyncHandler(async (req, res) => {
      const q = parse<Record<string, unknown>>(
        articleListSchema,
        req.query,
        res,
      );
      if (q) res.json({ data: await service.listArticles(q as never) });
    }),
  );
  router.get(
    '/source-articles/:articleId',
    readRoles,
    asyncHandler(async (req, res) => {
      const p = parse<{ articleId: string }>(articleIdSchema, req.params, res);
      if (p) res.json({ data: await service.getArticle(p.articleId) });
    }),
  );
  router.post(
    '/source-articles/manual',
    requireRole('ADMIN'),
    asyncHandler(async (req, res) => {
      const body = parse<ManualArticleInput>(
        manualArticleSchema,
        req.body,
        res,
      );
      if (body)
        res.status(201).json({ data: await service.ingestManual(body) });
    }),
  );
  return router;
}

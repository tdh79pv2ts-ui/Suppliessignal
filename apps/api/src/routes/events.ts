import {
  Router,
  type NextFunction,
  type Request,
  type Response,
  type Router as ExpressRouter,
} from 'express';
import {
  eventIdSchema,
  eventListSchema,
  eventStatusUpdateSchema,
  processClaimParamsSchema,
  type EventListInput,
} from '@suppliesignal/shared';
import { requireAuth, requireRole, type ResolveUser } from '../auth.js';
import {
  eventIntelligenceService,
  type EventIntelligenceService,
} from '../services/event-intelligence.js';
const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
    void fn(req, res).catch(next);
const parse = <T>(
  schema: {
    safeParse(
      v: unknown,
    ):
      | { success: true; data: T }
      | { success: false; error: { flatten(): unknown } };
  },
  value: unknown,
  res: Response,
): T | null => {
  const result = schema.safeParse(value);
  if (!result.success) {
    res
      .status(400)
      .json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: result.error.flatten(),
        },
      });
    return null;
  }
  return result.data;
};
export function createEventRouter(
  resolveUser: ResolveUser,
  service: EventIntelligenceService = eventIntelligenceService,
): ExpressRouter {
  const router = Router();
  router.use(requireAuth(resolveUser));
  router.use('/events', requireRole('ADMIN', 'REVIEWER'));
  router.get(
    '/events',
    asyncHandler(async (req, res) => {
      const query = parse<EventListInput>(eventListSchema, req.query, res);
      if (query) res.json({ data: await service.listEvents(query) });
    }),
  );
  router.get(
    '/events/:eventId',
    asyncHandler(async (req, res) => {
      const params = parse(eventIdSchema, req.params, res);
      if (params) res.json({ data: await service.getEvent(params.eventId) });
    }),
  );
  router.post(
    '/events/process-claim/:claimId',
    requireRole('ADMIN'),
    asyncHandler(async (req, res) => {
      const params = parse(processClaimParamsSchema, req.params, res);
      if (params)
        res
          .status(202)
          .json({ data: await service.processClaim(params.claimId) });
    }),
  );
  router.patch(
    '/events/:eventId/status',
    requireRole('ADMIN'),
    asyncHandler(async (req, res) => {
      const params = parse(eventIdSchema, req.params, res);
      const body = parse(eventStatusUpdateSchema, req.body, res);
      if (params && body)
        res.json({
          data: await service.updateStatus(params.eventId, body.status),
        });
    }),
  );
  return router;
}

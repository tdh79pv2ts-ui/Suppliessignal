import { Router, type NextFunction, type Request, type Response, type Router as ExpressRouter } from 'express';
import {
  candidateIdSchema,
  candidateReviewSchema,
  customerExposureIdSchema,
  customerExposureListSchema,
  eventIdentityProposalSchema,
  globalIdentifierIdSchema,
  graphIdentitySchema,
  identityIdSchema,
  type CustomerExposureListInput,
  type EventIdentityProposalInput,
  type GraphIdentityInput,
} from '@suppliesignal/shared';
import { assertCustomerAccess, requireAuth, requireCustomerAccess, requireRole, type ResolveUser } from '../auth.js';
import { customerExposureService, type CustomerExposureService } from '../services/customer-exposure.js';

const asyncHandler = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => void fn(req, res).catch(next);
const parse = <T>(schema: { safeParse(v: unknown): { success: true; data: T } | { success: false; error: { flatten(): unknown } } }, value: unknown, res: Response): T | null => { const result = schema.safeParse(value); if (!result.success) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: result.error.flatten() } }); return null; } return result.data; };

export function createCustomerExposureRouter(resolveUser: ResolveUser, service: CustomerExposureService = customerExposureService): ExpressRouter {
  const router = Router();
  router.use(requireAuth(resolveUser));

  router.get('/exposures', asyncHandler(async (req, res) => {
    const customerId = typeof req.query.customerId === 'string' ? req.query.customerId : '';
    const input = parse<CustomerExposureListInput>(customerExposureListSchema, req.query, res);
    const user = req.authUser;
    if (!input || !user) return;
    if (!customerId || !assertCustomerAccess(user, customerId)) { res.status(403).json({ error: { code: 'CUSTOMER_ACCESS_DENIED', message: 'Customer access requires an explicit membership' } }); return; }
    res.json({ data: await service.list(customerId, input, user.role === 'CUSTOMER') });
  }));
  router.get('/exposures/:id', asyncHandler(async (req, res) => {
    const id = typeof req.params.id === 'string' ? req.params.id : '';
    const customerId = typeof req.query.customerId === 'string' ? req.query.customerId : '';
    const user = req.authUser;
    if (!globalIdentifierIdSchema.safeParse({ id }).success || !user) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Valid IDs are required' } }); return; }
    if (!customerId || !assertCustomerAccess(user, customerId)) { res.status(403).json({ error: { code: 'CUSTOMER_ACCESS_DENIED', message: 'Customer access requires an explicit membership' } }); return; }
    res.json({ data: await service.detail(customerId, id, user.role === 'CUSTOMER') });
  }));

  router.use('/customers/:customerId', requireCustomerAccess);
  router.get('/customers/:customerId/exposures', asyncHandler(async (req, res) => { const params = parse(customerExposureIdSchema.pick({ customerId: true }), req.params, res); const input = parse<CustomerExposureListInput>(customerExposureListSchema, req.query, res); if (params && input && req.authUser) res.json({ data: await service.list(params.customerId, input, req.authUser.role === 'CUSTOMER') }); }));
  router.get('/customers/:customerId/exposures/:id', asyncHandler(async (req, res) => { const params = parse(customerExposureIdSchema, req.params, res); if (params && req.authUser) res.json({ data: await service.detail(params.customerId, params.id, req.authUser.role === 'CUSTOMER') }); }));
  router.post('/customers/:customerId/exposures/:id/confirm', requireRole('ADMIN', 'REVIEWER'), asyncHandler(async (req, res) => { const params = parse(customerExposureIdSchema, req.params, res); const body = parse(candidateReviewSchema, req.body, res); if (params && body && req.authUser) res.json({ data: await service.reviewExposure(params.customerId, params.id, req.authUser.id, true, body.reasonCode) }); }));
  router.post('/customers/:customerId/exposures/:id/dismiss', requireRole('ADMIN', 'REVIEWER'), asyncHandler(async (req, res) => { const params = parse(customerExposureIdSchema, req.params, res); const body = parse(candidateReviewSchema, req.body, res); if (params && body && req.authUser) res.json({ data: await service.reviewExposure(params.customerId, params.id, req.authUser.id, false, body.reasonCode) }); }));

  router.get('/customers/:customerId/exposure-candidates', requireRole('ADMIN', 'REVIEWER'), asyncHandler(async (req, res) => { const customerId = String(req.params.customerId); res.json({ data: await service.listCandidates(customerId) }); }));
  router.get('/customers/:customerId/exposure-candidates/:candidateId', requireRole('ADMIN', 'REVIEWER'), asyncHandler(async (req, res) => { const params = parse(candidateIdSchema, req.params, res); if (params) res.json({ data: await service.getCandidate(params.customerId, params.candidateId) }); }));
  router.post('/customers/:customerId/exposure-candidates/:candidateId/confirm', requireRole('ADMIN', 'REVIEWER'), asyncHandler(async (req, res) => { const params = parse(candidateIdSchema, req.params, res); const body = parse(candidateReviewSchema, req.body, res); if (params && body && req.authUser) res.json({ data: await service.reviewCandidate(params.customerId, params.candidateId, req.authUser.id, true, body.reasonCode, body.resultingIdentityId) }); }));
  router.post('/customers/:customerId/exposure-candidates/:candidateId/reject', requireRole('ADMIN', 'REVIEWER'), asyncHandler(async (req, res) => { const params = parse(candidateIdSchema, req.params, res); const body = parse(candidateReviewSchema, req.body, res); if (params && body && req.authUser) res.json({ data: await service.reviewCandidate(params.customerId, params.candidateId, req.authUser.id, false, body.reasonCode) }); }));
  router.post('/customers/:customerId/exposure-candidates/:candidateId/event-identity-proposal', requireRole('ADMIN', 'REVIEWER'), asyncHandler(async (req, res) => { const params = parse(candidateIdSchema, req.params, res); const body = parse<EventIdentityProposalInput>(eventIdentityProposalSchema, req.body, res); if (params && body && req.authUser) res.status(201).json({ data: await service.proposeEventIdentity(params.customerId, params.candidateId, req.authUser.id, body, req.authUser.role === 'ADMIN') }); }));

  router.get('/customers/:customerId/graph-identities', requireRole('ADMIN', 'REVIEWER'), asyncHandler(async (req, res) => { res.json({ data: await service.listGraphIdentities(String(req.params.customerId)) }); }));
  router.post('/customers/:customerId/graph-identities', requireRole('ADMIN', 'REVIEWER'), asyncHandler(async (req, res) => { const body = parse<GraphIdentityInput>(graphIdentitySchema, req.body, res); if (body && req.authUser) res.status(201).json({ data: await service.createGraphIdentity(String(req.params.customerId), req.authUser.id, body) }); }));
  router.post('/customers/:customerId/graph-identities/:identityId/verify', requireRole('ADMIN', 'REVIEWER'), asyncHandler(async (req, res) => { const params = parse(identityIdSchema, req.params, res); if (params && req.authUser) res.json({ data: await service.setGraphIdentityStatus(params.customerId, params.identityId, req.authUser.id, true) }); }));
  router.post('/customers/:customerId/graph-identities/:identityId/reject', requireRole('ADMIN', 'REVIEWER'), asyncHandler(async (req, res) => { const params = parse(identityIdSchema, req.params, res); if (params && req.authUser) res.json({ data: await service.setGraphIdentityStatus(params.customerId, params.identityId, req.authUser.id, false) }); }));

  router.post('/admin/event-identifiers/:id/verify', requireRole('ADMIN'), asyncHandler(async (req, res) => { const params = parse(globalIdentifierIdSchema, req.params, res); if (params && req.authUser) res.json({ data: await service.verifyEventIdentifier(params.id, req.authUser.id, true) }); }));
  router.post('/admin/event-identifiers/:id/reject', requireRole('ADMIN'), asyncHandler(async (req, res) => { const params = parse(globalIdentifierIdSchema, req.params, res); if (params && req.authUser) res.json({ data: await service.verifyEventIdentifier(params.id, req.authUser.id, false) }); }));
  router.post('/admin/events/:id/reconcile-exposures', requireRole('ADMIN'), asyncHandler(async (req, res) => { const params = parse(globalIdentifierIdSchema, req.params, res); if (params) res.status(202).json({ data: await service.reconcileEvent(params.id) }); }));
  router.get('/admin/event-identifiers', requireRole('ADMIN'), asyncHandler(async (_req, res) => { res.json({ data: await service.listEventIdentifiers() }); }));
  router.post('/admin/event-entities/:id/identifiers', requireRole('ADMIN'), asyncHandler(async (req, res) => { const params = parse(globalIdentifierIdSchema, req.params, res); const body = parse<Omit<EventIdentityProposalInput, 'eventEntityId'>>(eventIdentityProposalSchema.omit({ eventEntityId: true }), req.body, res); if (params && body && req.authUser) res.status(201).json({ data: await service.createAdminEventIdentity(params.id, req.authUser.id, body) }); }));
  return router;
}

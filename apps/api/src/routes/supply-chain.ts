import { Router, type NextFunction, type Request, type Response, type Router as ExpressRouter } from 'express';
import {
  companyCreateSchema, companyUpdateSchema, customerParamsSchema, customerPortCreateSchema, entityIdParamsSchema, factoryCreateSchema, factoryUpdateSchema,
  materialCreateSchema, materialUpdateSchema, paginationSchema, portCreateSchema, portUpdateSchema,
  productCreateSchema, productUpdateSchema, relationshipSchema, routeCreateSchema, routePortReorderSchema,
  routePortSchema, routeUpdateSchema, supplierCreateSchema, supplierUpdateSchema,
} from '@suppliesignal/shared';
import type { PortInput } from '@suppliesignal/shared';
import { requireAuth, requireCustomerAccess, requireRole, type ResolveUser } from '../auth.js';
import { ServiceError } from '../services/errors.js';
import { supplyChainService, type Filters, type SupplyChainService } from '../services/supply-chain.js';

const asyncHandler = (handler: (request: Request, response: Response) => Promise<void>) => (request: Request, response: Response, next: NextFunction) => void handler(request, response).catch(next);
type Schema = { safeParse(value: unknown): { success: true; data: unknown } | { success: false; error: { flatten(): unknown } } };
const parsed = <T = Record<string, unknown>>(schema: Schema, value: unknown, response: Response): T | null => { const result = schema.safeParse(value); if (!result.success) { response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: result.error.flatten() } }); return null; } return result.data as T; };

export function createSupplyChainRouter(resolveUser: ResolveUser, service: SupplyChainService = supplyChainService): ExpressRouter {
  const router = Router();
  router.use(requireAuth(resolveUser));

  router.get('/workspaces', asyncHandler(async (req, res) => { const user = req.authUser; if (!user) return; res.json({ data: await service.listWorkspaces(user.id, user.role === 'ADMIN') }); }));

  router.get('/ports', asyncHandler(async (req, res) => { const query = parsed<Filters>(paginationSchema, req.query, res); const user = req.authUser; if (query && user) res.json({ data: await service.listPorts(query, undefined, user.customerIds, user.role === 'ADMIN') }); }));
  router.get('/ports/:id', asyncHandler(async (req, res) => { const id = typeof req.params.id === 'string' ? req.params.id : ''; const params = parsed<{ id: string }>(entityIdParamsSchema.pick({ id: true }), { id }, res); const user = req.authUser; if (params && user) res.json({ data: await service.getPort(params.id, user.customerIds, user.role === 'ADMIN') }); }));
  router.post('/ports', requireRole('ADMIN'), asyncHandler(async (req, res) => { const body = parsed<PortInput>(portCreateSchema, req.body, res); if (body) res.status(201).json({ data: await service.createPort(body) }); }));
  router.patch('/ports/:id', requireRole('ADMIN'), asyncHandler(async (req, res) => { const id = typeof req.params.id === 'string' ? req.params.id : ''; const params = parsed<{ id: string }>({ safeParse: (value: unknown) => entityIdParamsSchema.pick({ id: true }).safeParse(value) }, { id }, res); const body = parsed<Record<string, unknown>>(portUpdateSchema, req.body, res); if (params && body) res.json({ data: await service.updatePort(params.id, body) }); }));
  router.post('/ports/:id/archive', requireRole('ADMIN'), asyncHandler(async (req, res) => { const id = typeof req.params.id === 'string' ? req.params.id : ''; const params = parsed<{ id: string }>(entityIdParamsSchema.pick({ id: true }), { id }, res); if (params) res.json({ data: await service.archivePort(params.id) }); }));

  router.use('/customers/:customerId', requireCustomerAccess);
  router.get('/customers/:customerId/supply-chain', asyncHandler(async (req, res) => { const params = parsed<{ customerId: string }>(customerParamsSchema, req.params, res); if (params) res.json({ data: await service.graph(params.customerId) }); }));
  router.get('/customers/:customerId/ports', asyncHandler(async (req, res) => { const params = parsed<{ customerId: string }>(customerParamsSchema, req.params, res); const query = parsed<Filters>(paginationSchema, req.query, res); if (params && query) res.json({ data: await service.listPorts(query, params.customerId) }); }));
  router.post('/customers/:customerId/ports', asyncHandler(async (req, res) => { const params = parsed<{ customerId: string }>(customerParamsSchema, req.params, res); const body = parsed<PortInput & { routeId: string; sequence: number; sourceName: string; sourceUrl: string; collectedAt: Date; confidence: number }>(customerPortCreateSchema, req.body, res); if (params && body) res.status(201).json({ data: await service.createCustomerPort(params.customerId, body) }); }));

  const entities = [
    ['companies', companyCreateSchema, companyUpdateSchema, service.listCompanies.bind(service), service.getCompany.bind(service), service.createCompany.bind(service), service.updateCompany.bind(service), service.archiveCompany.bind(service)],
    ['suppliers', supplierCreateSchema, supplierUpdateSchema, service.listSuppliers.bind(service), service.getSupplier.bind(service), service.createSupplier.bind(service), service.updateSupplier.bind(service), service.archiveSupplier.bind(service)],
    ['factories', factoryCreateSchema, factoryUpdateSchema, service.listFactories.bind(service), service.getFactory.bind(service), service.createFactory.bind(service), service.updateFactory.bind(service), service.archiveFactory.bind(service)],
    ['products', productCreateSchema, productUpdateSchema, service.listProducts.bind(service), service.getProduct.bind(service), service.createProduct.bind(service), service.updateProduct.bind(service), service.archiveProduct.bind(service)],
    ['materials', materialCreateSchema, materialUpdateSchema, service.listMaterials.bind(service), service.getMaterial.bind(service), service.createMaterial.bind(service), service.updateMaterial.bind(service), service.archiveMaterial.bind(service)],
    ['routes', routeCreateSchema, routeUpdateSchema, service.listRoutes.bind(service), service.getRoute.bind(service), service.createRoute.bind(service), service.updateRoute.bind(service), service.archiveRoute.bind(service)],
  ] as const;
  for (const [name, createSchema, updateSchema, list, get, create, update, archive] of entities) {
    const base = `/customers/:customerId/${name}`;
    router.get(base, asyncHandler(async (req, res) => { const params = parsed<{ customerId: string }>(customerParamsSchema, req.params, res); const query = parsed<Filters>(paginationSchema, req.query, res); if (params && query) res.json({ data: await list(params.customerId, query) }); }));
    router.get(`${base}/:id`, asyncHandler(async (req, res) => { const params = parsed<{ customerId: string; id: string }>(entityIdParamsSchema, req.params, res); if (params) res.json({ data: await get(params.customerId, params.id) }); }));
    router.post(base, asyncHandler(async (req, res) => { const params = parsed<{ customerId: string }>(customerParamsSchema, req.params, res); const body = parsed(createSchema, req.body, res); if (params && body) res.status(201).json({ data: await create(params.customerId, body as never) }); }));
    router.patch(`${base}/:id`, asyncHandler(async (req, res) => { const params = parsed<{ customerId: string; id: string }>(entityIdParamsSchema, req.params, res); const body = parsed(updateSchema, req.body, res); if (params && body) res.json({ data: await update(params.customerId, params.id, body as never) }); }));
    router.post(`${base}/:id/archive`, asyncHandler(async (req, res) => { const params = parsed<{ customerId: string; id: string }>(entityIdParamsSchema, req.params, res); if (params) res.json({ data: await archive(params.customerId, params.id) }); }));
  }

  const relationRoutes = [
    ['companies', 'suppliers', 'company-supplier'],
    ['suppliers', 'products', 'supplier-product'], ['factories', 'products', 'factory-product'], ['products', 'materials', 'product-material'], ['routes', 'suppliers', 'route-supplier'], ['routes', 'factories', 'route-factory'],
  ] as const;
  for (const [source, targets, kind] of relationRoutes) {
    router.post(`/customers/:customerId/${source}/:id/${targets}`, asyncHandler(async (req, res) => { const params = parsed<{ customerId: string; id: string }>(entityIdParamsSchema, req.params, res); const body = parsed<{ targetId: string; sourceName?: string; sourceUrl?: string; collectedAt?: Date; confidence?: number }>(relationshipSchema, req.body, res); if (params && body) { const { targetId, ...provenance } = body; res.status(201).json({ data: await service.attach(params.customerId, kind, params.id, targetId, provenance) }); } }));
    router.delete(`/customers/:customerId/${source}/:id/${targets}/:targetId`, asyncHandler(async (req, res) => { const params = parsed<{ customerId: string; id: string; targetId: string }>(entityIdParamsSchema.extend({ targetId: relationshipSchema.shape.targetId }), req.params, res); if (params) { await service.detach(params.customerId, kind, params.id, params.targetId); res.status(204).send(); } }));
  }
  router.post('/customers/:customerId/routes/:id/ports', asyncHandler(async (req, res) => { const params = parsed<{ customerId: string; id: string }>(entityIdParamsSchema, req.params, res); const body = parsed<{ portId: string; sequence: number; sourceName: string; sourceUrl: string; collectedAt: Date; confidence: number }>(routePortSchema, req.body, res); if (params && body) { const { portId, sequence, ...provenance } = body; res.status(201).json({ data: await service.addRoutePort(params.customerId, params.id, portId, sequence, provenance) }); } }));
  router.delete('/customers/:customerId/routes/:id/ports/:targetId', asyncHandler(async (req, res) => { const params = parsed<{ customerId: string; id: string; targetId: string }>(entityIdParamsSchema.extend({ targetId: relationshipSchema.shape.targetId }), req.params, res); if (params) { await service.removeRoutePort(params.customerId, params.id, params.targetId); res.status(204).send(); } }));
  router.put('/customers/:customerId/routes/:id/ports', asyncHandler(async (req, res) => { const params = parsed<{ customerId: string; id: string }>(entityIdParamsSchema, req.params, res); const body = parsed<{ ports: { portId: string; sequence: number }[] }>(routePortReorderSchema, req.body, res); if (params && body) res.json({ data: await service.reorderRoutePorts(params.customerId, params.id, body.ports) }); }));
  return router;
}

export function supplyChainErrorHandler(error: unknown, _request: Request, response: Response, next: NextFunction) {
  if (error instanceof ServiceError) { response.status(error.status).json({ error: { code: error.code, message: error.message } }); return; }
  next(error);
}

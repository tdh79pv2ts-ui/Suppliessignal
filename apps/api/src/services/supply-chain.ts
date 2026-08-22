import { Prisma, type Criticality, type SupplierTier, type TransportMode } from '@suppliesignal/db';
import { db } from '@suppliesignal/db';
import type { CompanyInput, FactoryInput, MaterialInput, PortInput, ProductInput, RouteInput, SupplierInput } from '@suppliesignal/shared';
import { ServiceError } from './errors.js';

export type Filters = { page: number; pageSize: number; active: 'true' | 'false' | 'all'; search?: string | undefined; country?: string | undefined; category?: string | undefined; criticality?: Criticality | undefined; tier?: SupplierTier | undefined; transportMode?: TransportMode | undefined; supplierId?: string | undefined };
type Update = Record<string, unknown>;
const pagination = (page: number, pageSize: number, total: number) => ({ page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
const activeFilter = (active: Filters['active']) => active === 'all' ? undefined : active === 'true';
const compact = (data: Record<string, unknown>) => Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
const coordinates = (data: Record<string, unknown>) => compact({ ...data, latitude: typeof data.latitude === 'number' ? new Prisma.Decimal(data.latitude) : data.latitude, longitude: typeof data.longitude === 'number' ? new Prisma.Decimal(data.longitude) : data.longitude });

export class SupplyChainService {
  listWorkspaces(userId: string, isAdmin: boolean) { return db.customer.findMany({ where: isAdmin ? {} : { memberships: { some: { userId } } }, select: { id: true, name: true }, orderBy: { name: 'asc' } }); }
  async listCompanies(customerId: string, f: Filters) {
    const onlyActive = activeFilter(f.active);
    const where: Prisma.CompanyWhereInput = { customerId, ...(typeof onlyActive === 'boolean' ? { active: onlyActive } : {}), ...(f.country ? { country: f.country } : {}), ...(f.category ? { category: f.category } : {}), ...(f.search ? { name: { contains: f.search, mode: 'insensitive' as const } } : {}) };
    const [items, total] = await db.$transaction([db.company.findMany({ where, orderBy: { name: 'asc' }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }), db.company.count({ where })]);
    return { items, pagination: pagination(f.page, f.pageSize, total) };
  }
  async getCompany(customerId: string, id: string) { const item = await db.company.findFirst({ where: { id, customerId }, include: { companySuppliers: { include: { supplier: true } } } }); if (!item) throw new ServiceError('COMPANY_NOT_FOUND', 'Company not found', 404); return item; }
  createCompany(customerId: string, data: CompanyInput) { return db.company.create({ data: compact({ ...data, customerId }) as unknown as Prisma.CompanyUncheckedCreateInput }); }
  async updateCompany(customerId: string, id: string, data: Update) { await this.getCompany(customerId, id); return db.company.update({ where: { id }, data }); }
  async archiveCompany(customerId: string, id: string) { return this.updateCompany(customerId, id, { active: false }); }
  async listSuppliers(customerId: string, f: Filters) {
    const onlyActive = activeFilter(f.active);
    const where: Prisma.SupplierWhereInput = { customerId, ...(typeof onlyActive === 'boolean' ? { active: onlyActive } : {}), ...(f.country ? { country: f.country } : {}), ...(f.tier ? { tier: f.tier } : {}), ...(f.criticality ? { criticality: f.criticality } : {}), ...(f.search ? { name: { contains: f.search, mode: 'insensitive' as const } } : {}) };
    const [items, total] = await db.$transaction([db.supplier.findMany({ where, orderBy: { name: 'asc' }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }), db.supplier.count({ where })]);
    return { items, pagination: pagination(f.page, f.pageSize, total) };
  }
  async getSupplier(customerId: string, id: string) {
    const item = await db.supplier.findFirst({ where: { id, customerId }, include: { factories: true, supplierProducts: { include: { product: true } }, routeSuppliers: { include: { route: true } } } });
    if (!item) throw new ServiceError('SUPPLIER_NOT_FOUND', 'Supplier not found', 404); return item;
  }
  createSupplier(customerId: string, data: SupplierInput) { return db.supplier.create({ data: { ...coordinates(data), customerId } as Prisma.SupplierUncheckedCreateInput }); }
  async updateSupplier(customerId: string, id: string, data: Update) { await this.getSupplier(customerId, id); return db.supplier.update({ where: { id }, data: coordinates(data) as Prisma.SupplierUncheckedUpdateInput }); }
  async archiveSupplier(customerId: string, id: string) { return this.updateSupplier(customerId, id, { active: false }); }

  async listFactories(customerId: string, f: Filters) {
    const onlyActive = activeFilter(f.active);
    const where: Prisma.FactoryWhereInput = { customerId, ...(typeof onlyActive === 'boolean' ? { active: onlyActive } : {}), ...(f.country ? { country: f.country } : {}), ...(f.supplierId ? { supplierId: f.supplierId } : {}), ...(f.criticality ? { criticality: f.criticality } : {}), ...(f.search ? { name: { contains: f.search, mode: 'insensitive' as const } } : {}) };
    const [items, total] = await db.$transaction([db.factory.findMany({ where, include: { supplier: true }, orderBy: { name: 'asc' }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }), db.factory.count({ where })]);
    return { items, pagination: pagination(f.page, f.pageSize, total) };
  }
  async getFactory(customerId: string, id: string) { const item = await db.factory.findFirst({ where: { id, customerId }, include: { supplier: true, factoryProducts: { include: { product: true } }, routeFactories: { include: { route: true } } } }); if (!item) throw new ServiceError('FACTORY_NOT_FOUND', 'Factory not found', 404); return item; }
  async createFactory(customerId: string, data: FactoryInput) { if (data.supplierId) await this.requireOwned('supplier', customerId, data.supplierId); return db.factory.create({ data: { ...coordinates(data), customerId } as Prisma.FactoryUncheckedCreateInput }); }
  async updateFactory(customerId: string, id: string, data: Update) { await this.getFactory(customerId, id); if (typeof data.supplierId === 'string') await this.requireOwned('supplier', customerId, data.supplierId); return db.factory.update({ where: { id }, data: coordinates(data) as Prisma.FactoryUncheckedUpdateInput }); }
  async archiveFactory(customerId: string, id: string) { return this.updateFactory(customerId, id, { active: false }); }

  async listProducts(customerId: string, f: Filters) { const onlyActive = activeFilter(f.active); const where: Prisma.ProductWhereInput = { customerId, ...(typeof onlyActive === 'boolean' ? { active: onlyActive } : {}), ...(f.category ? { category: f.category } : {}), ...(f.criticality ? { criticality: f.criticality } : {}), ...(f.search ? { name: { contains: f.search, mode: 'insensitive' as const } } : {}) }; const [items, total] = await db.$transaction([db.product.findMany({ where, orderBy: { name: 'asc' }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }), db.product.count({ where })]); return { items, pagination: pagination(f.page, f.pageSize, total) }; }
  async getProduct(customerId: string, id: string) { const item = await db.product.findFirst({ where: { id, customerId }, include: { supplierProducts: { include: { supplier: true } }, factoryProducts: { include: { factory: true } }, productMaterials: { include: { material: true } } } }); if (!item) throw new ServiceError('PRODUCT_NOT_FOUND', 'Product not found', 404); return item; }
  createProduct(customerId: string, data: ProductInput) { return db.product.create({ data: compact({ ...data, customerId }) as unknown as Prisma.ProductUncheckedCreateInput }); }
  async updateProduct(customerId: string, id: string, data: Update) { await this.getProduct(customerId, id); return db.product.update({ where: { id }, data }); }
  async archiveProduct(customerId: string, id: string) { return this.updateProduct(customerId, id, { active: false }); }

  async listMaterials(customerId: string, f: Filters) { const onlyActive = activeFilter(f.active); const where: Prisma.MaterialWhereInput = { customerId, ...(typeof onlyActive === 'boolean' ? { active: onlyActive } : {}), ...(f.category ? { category: f.category } : {}), ...(f.criticality ? { criticality: f.criticality } : {}), ...(f.search ? { name: { contains: f.search, mode: 'insensitive' as const } } : {}) }; const [items, total] = await db.$transaction([db.material.findMany({ where, orderBy: { name: 'asc' }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }), db.material.count({ where })]); return { items, pagination: pagination(f.page, f.pageSize, total) }; }
  async getMaterial(customerId: string, id: string) { const item = await db.material.findFirst({ where: { id, customerId }, include: { productMaterials: { include: { product: true } } } }); if (!item) throw new ServiceError('MATERIAL_NOT_FOUND', 'Material not found', 404); return item; }
  createMaterial(customerId: string, data: MaterialInput) { return db.material.create({ data: compact({ ...data, customerId }) as unknown as Prisma.MaterialUncheckedCreateInput }); }
  async updateMaterial(customerId: string, id: string, data: Update) { await this.getMaterial(customerId, id); return db.material.update({ where: { id }, data }); }
  async archiveMaterial(customerId: string, id: string) { return this.updateMaterial(customerId, id, { active: false }); }

  async listRoutes(customerId: string, f: Filters) { const onlyActive = activeFilter(f.active); const where: Prisma.RouteWhereInput = { customerId, ...(typeof onlyActive === 'boolean' ? { active: onlyActive } : {}), ...(f.transportMode ? { transportMode: f.transportMode } : {}), ...(f.criticality ? { criticality: f.criticality } : {}), ...(f.search ? { name: { contains: f.search, mode: 'insensitive' as const } } : {}) }; const [items, total] = await db.$transaction([db.route.findMany({ where, orderBy: { name: 'asc' }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }), db.route.count({ where })]); return { items, pagination: pagination(f.page, f.pageSize, total) }; }
  async getRoute(customerId: string, id: string) { const item = await db.route.findFirst({ where: { id, customerId }, include: { routeSuppliers: { include: { supplier: true } }, routeFactories: { include: { factory: true } }, routePorts: { include: { port: true }, orderBy: { sequence: 'asc' } } } }); if (!item) throw new ServiceError('ROUTE_NOT_FOUND', 'Route not found', 404); return item; }
  createRoute(customerId: string, data: RouteInput) { return db.route.create({ data: compact({ ...data, customerId }) as unknown as Prisma.RouteUncheckedCreateInput }); }
  async updateRoute(customerId: string, id: string, data: Update) { await this.getRoute(customerId, id); return db.route.update({ where: { id }, data }); }
  async archiveRoute(customerId: string, id: string) { return this.updateRoute(customerId, id, { active: false }); }

  async listPorts(f: Filters, customerId?: string, accessibleCustomerIds?: string[], isAdmin = false) { const onlyActive = activeFilter(f.active); const where: Prisma.PortWhereInput = { ...(typeof onlyActive === 'boolean' ? { active: onlyActive } : {}), ...(f.country ? { country: f.country } : {}), ...(f.search ? { name: { contains: f.search, mode: 'insensitive' as const } } : {}), ...(customerId ? { routePorts: { some: { customerId } } } : {}) }; const routeScope = customerId ? { customerId } : isAdmin ? {} : { customerId: { in: accessibleCustomerIds ?? [] } }; const args = { where, orderBy: { name: 'asc' as const }, skip: (f.page - 1) * f.pageSize, take: f.pageSize, include: { routePorts: { where: routeScope, include: { route: true }, orderBy: { sequence: 'asc' as const } } } }; const [items, total] = await db.$transaction([db.port.findMany(args), db.port.count({ where })]); return { items, pagination: pagination(f.page, f.pageSize, total) }; }
  createPort(data: PortInput) { return db.port.create({ data: coordinates(data) as unknown as Prisma.PortUncheckedCreateInput }); }
  async createCustomerPort(customerId: string, data: PortInput & { routeId: string; sequence: number } & Required<RelationshipProvenance>) {
    await this.requireOwned('route', customerId, data.routeId);
    const { routeId, sequence, collectedAt, confidence, ...portData } = data;
    try {
      return await db.$transaction(async (tx) => {
        const port = await tx.port.create({ data: coordinates(portData) as unknown as Prisma.PortUncheckedCreateInput });
        await tx.routePort.create({ data: { customerId, routeId, portId: port.id, sequence, sourceName: data.sourceName, sourceUrl: data.sourceUrl, collectedAt, confidence } });
        return port;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ServiceError('PORT_OR_SEQUENCE_ALREADY_EXISTS', 'Port code or route sequence is already used', 409);
      throw error;
    }
  }
  async getPort(id: string, customerIds: string[], isAdmin: boolean) { const port = await db.port.findUnique({ where: { id }, include: { routePorts: { ...(isAdmin ? {} : { where: { customerId: { in: customerIds } } }), include: { route: true }, orderBy: { sequence: 'asc' } } } }); if (!port) throw new ServiceError('PORT_NOT_FOUND', 'Port not found', 404); return port; }
  async updatePort(id: string, data: Update) { const port = await db.port.findUnique({ where: { id } }); if (!port) throw new ServiceError('PORT_NOT_FOUND', 'Port not found', 404); return db.port.update({ where: { id }, data: coordinates(data) as Prisma.PortUncheckedUpdateInput }); }
  archivePort(id: string) { return this.updatePort(id, { active: false }); }

  async attach(customerId: string, kind: 'supplier-product' | 'factory-product' | 'product-material' | 'route-supplier' | 'route-factory' | 'company-supplier', sourceId: string, targetId: string, provenance: RelationshipProvenance = {}) {
    const evidence = requiredProvenance(provenance);
    if (kind === 'company-supplier') {
      await this.requireOwned('company', customerId, sourceId); await this.requireOwned('supplier', customerId, targetId);
      try { return await db.companySupplier.create({ data: { customerId, companyId: sourceId, supplierId: targetId, ...evidence } }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ServiceError('RELATIONSHIP_ALREADY_EXISTS', 'Relationship already exists', 409); throw error; }
    }
    const config = { 'supplier-product': ['supplier', 'product', db.supplierProduct, { supplierId: sourceId, productId: targetId }], 'factory-product': ['factory', 'product', db.factoryProduct, { factoryId: sourceId, productId: targetId }], 'product-material': ['product', 'material', db.productMaterial, { productId: sourceId, materialId: targetId }], 'route-supplier': ['route', 'supplier', db.routeSupplier, { routeId: sourceId, supplierId: targetId }], 'route-factory': ['route', 'factory', db.routeFactory, { routeId: sourceId, factoryId: targetId }] }[kind] as [OwnedKind, OwnedKind, { create(args: unknown): Promise<unknown> }, Record<string, string>];
    await this.requireOwned(config[0], customerId, sourceId); await this.requireOwned(config[1], customerId, targetId);
    try { return await config[2].create({ data: { ...config[3], customerId, ...evidence } }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ServiceError('RELATIONSHIP_ALREADY_EXISTS', 'Relationship already exists', 409); throw error; }
  }
  async detach(customerId: string, kind: 'supplier-product' | 'factory-product' | 'product-material' | 'route-supplier' | 'route-factory' | 'company-supplier', sourceId: string, targetId: string) {
    if (kind === 'company-supplier') {
      await this.requireOwned('company', customerId, sourceId); await this.requireOwned('supplier', customerId, targetId);
      try { return await db.companySupplier.delete({ where: { companyId_supplierId: { companyId: sourceId, supplierId: targetId } } }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw new ServiceError('INVALID_RELATIONSHIP', 'Relationship not found', 404); throw error; }
    }
    const config = { 'supplier-product': ['supplier', 'product', db.supplierProduct, { supplierId_productId: { supplierId: sourceId, productId: targetId } }], 'factory-product': ['factory', 'product', db.factoryProduct, { factoryId_productId: { factoryId: sourceId, productId: targetId } }], 'product-material': ['product', 'material', db.productMaterial, { productId_materialId: { productId: sourceId, materialId: targetId } }], 'route-supplier': ['route', 'supplier', db.routeSupplier, { routeId_supplierId: { routeId: sourceId, supplierId: targetId } }], 'route-factory': ['route', 'factory', db.routeFactory, { routeId_factoryId: { routeId: sourceId, factoryId: targetId } }] }[kind] as [OwnedKind, OwnedKind, { delete(args: unknown): Promise<unknown> }, object];
    await this.requireOwned(config[0], customerId, sourceId); await this.requireOwned(config[1], customerId, targetId);
    try { return await config[2].delete({ where: config[3] }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw new ServiceError('INVALID_RELATIONSHIP', 'Relationship not found', 404); throw error; }
  }
  async addRoutePort(customerId: string, routeId: string, portId: string, sequence: number, provenance: RelationshipProvenance = {}) { await this.requireOwned('route', customerId, routeId); if (!await db.port.findUnique({ where: { id: portId } })) throw new ServiceError('PORT_NOT_FOUND', 'Port not found', 404); try { return await db.routePort.create({ data: { customerId, routeId, portId, sequence, ...requiredProvenance(provenance) } }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ServiceError('RELATIONSHIP_ALREADY_EXISTS', 'Port or sequence is already used on this route', 409); throw error; } }
  async removeRoutePort(customerId: string, routeId: string, portId: string) { await this.requireOwned('route', customerId, routeId); try { return await db.routePort.delete({ where: { routeId_portId: { routeId, portId } } }); } catch { throw new ServiceError('INVALID_RELATIONSHIP', 'Route port not found', 404); } }
  async reorderRoutePorts(customerId: string, routeId: string, ports: { portId: string; sequence: number }[]) { await this.requireOwned('route', customerId, routeId); const existing = await db.routePort.findMany({ where: { routeId, customerId } }); if (existing.length !== ports.length || existing.some((item) => !ports.some((port) => port.portId === item.portId))) throw new ServiceError('INVALID_RELATIONSHIP', 'Reorder must include every current route port', 400); return db.$transaction(async (tx) => { for (const [index, port] of ports.entries()) await tx.routePort.update({ where: { routeId_portId: { routeId, portId: port.portId } }, data: { sequence: -(index + 1) } }); for (const port of ports) await tx.routePort.update({ where: { routeId_portId: { routeId, portId: port.portId } }, data: { sequence: port.sequence } }); return tx.routePort.findMany({ where: { routeId }, orderBy: { sequence: 'asc' } }); }); }

  async graph(customerId: string) {
    const [customer, companies, countries, locations, suppliers, factories] = await Promise.all([
      db.customer.findUnique({ where: { id: customerId } }), db.company.findMany({ where: { customerId } }), db.country.findMany({ where: { locations: { some: { customerId } } } }), db.location.findMany({ where: { customerId } }), db.supplier.findMany({ where: { customerId } }), db.factory.findMany({ where: { customerId } }),
    ]);
    const [products, materials, routes, companySuppliers, factoryLocations, supplierProducts] = await Promise.all([
      db.product.findMany({ where: { customerId } }), db.material.findMany({ where: { customerId } }), db.route.findMany({ where: { customerId } }), db.companySupplier.findMany({ where: { customerId } }), db.factoryLocation.findMany({ where: { customerId } }), db.supplierProduct.findMany({ where: { customerId } }),
    ]);
    const [factoryProducts, productMaterials, routeSuppliers, routeFactories, routePorts] = await Promise.all([
      db.factoryProduct.findMany({ where: { customerId } }), db.productMaterial.findMany({ where: { customerId } }), db.routeSupplier.findMany({ where: { customerId } }), db.routeFactory.findMany({ where: { customerId } }), db.routePort.findMany({ where: { customerId }, orderBy: [{ routeId: 'asc' }, { sequence: 'asc' }] }),
    ]);
    if (!customer) throw new ServiceError('CUSTOMER_NOT_FOUND', 'Customer not found', 404);
    const portIds = [...new Set(routePorts.map((item) => item.portId))];
    const ports = await db.port.findMany({ where: { id: { in: portIds } } });
    return { customer, companies, countries, locations, suppliers, factories, products, materials, routes, ports, relationships: { companySuppliers, factoryLocations, supplierProducts, factoryProducts, productMaterials, routeSuppliers, routeFactories, routePorts } };
  }

  private async requireOwned(kind: OwnedKind, customerId: string, id: string) { const model = { company: db.company, supplier: db.supplier, factory: db.factory, product: db.product, material: db.material, route: db.route }[kind] as { findUnique(args: unknown): Promise<{ customerId: string } | null> }; const entity = await model.findUnique({ where: { id }, select: { customerId: true } }); assertEntityBelongsToCustomer(customerId, entity, kind); }
}
type OwnedKind = 'company' | 'supplier' | 'factory' | 'product' | 'material' | 'route';
type RelationshipProvenance = { sourceName?: string; sourceUrl?: string; collectedAt?: Date; confidence?: number };
function requiredProvenance(value: RelationshipProvenance) { if (!value.sourceName || !value.sourceUrl || !value.collectedAt || typeof value.confidence !== 'number') throw new ServiceError('PROVENANCE_REQUIRED', 'Company-supplier relationships require source, URL, collection date, and confidence', 400); return value as Required<RelationshipProvenance>; }
export function assertEntityBelongsToCustomer(customerId: string, entity: { customerId: string } | null, kind: OwnedKind): void { if (!entity || entity.customerId !== customerId) throw new ServiceError('CROSS_CUSTOMER_RELATIONSHIP', `${kind} does not belong to this customer`, 409); }
export const supplyChainService = new SupplyChainService();

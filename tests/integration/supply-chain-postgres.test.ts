import { afterAll, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { db } from '../../packages/db/src/index';
import { SupplyChainService } from '../../apps/api/src/services/supply-chain';

function assertTestDatabase(): void {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw || raw !== process.env.DATABASE_URL)
    throw new Error(
      'Real database tests require matching TEST_DATABASE_URL and DATABASE_URL',
    );
  const url = new URL(raw);
  if (
    !['localhost', '127.0.0.1', '::1'].includes(url.hostname) ||
    !url.pathname.slice(1).startsWith('suppliesignal_test_') ||
    process.env.NODE_ENV === 'production'
  ) {
    throw new Error(
      'Refusing to run real database tests outside a disposable local suppliesignal_test_* database',
    );
  }
}

assertTestDatabase();
const service = new SupplyChainService();
afterAll(async () => db.$disconnect());

describe.sequential('SupplyChainService with PostgreSQL', () => {
  it('persists an explicit tenant-safe graph and preserves it when archived', async () => {
    const customerA = await db.customer.create({
      data: { name: 'Integration Customer A' },
    });
    const customerB = await db.customer.create({
      data: { name: 'Integration Customer B' },
    });
    const supplierA = await service.createSupplier(customerA.id, {
      name: 'Supplier A',
      country: 'Bangladesh',
      tier: 'TIER_1',
      criticality: 'HIGH',
    });
    const factoryA = await service.createFactory(customerA.id, {
      name: 'Factory A',
      country: 'Bangladesh',
      criticality: 'HIGH',
      supplierId: supplierA.id,
    });
    const productA = await service.createProduct(customerA.id, {
      name: 'Product A',
      criticality: 'HIGH',
    });
    const materialA = await service.createMaterial(customerA.id, {
      name: 'Material A',
      criticality: 'MEDIUM',
      substitutable: false,
    });
    const routeA = await service.createRoute(customerA.id, {
      name: 'Route A',
      originLabel: 'Dhaka',
      destinationLabel: 'Rotterdam',
      transportMode: 'SEA',
      criticality: 'HIGH',
    });
    const port = await service.createPort({
      name: 'Integration Port',
      country: 'Netherlands',
      portCode: 'ITP',
    });

    await service.attach(
      customerA.id,
      'supplier-product',
      supplierA.id,
      productA.id,
    );
    await service.attach(
      customerA.id,
      'factory-product',
      factoryA.id,
      productA.id,
    );
    await service.attach(
      customerA.id,
      'product-material',
      productA.id,
      materialA.id,
    );
    await service.attach(
      customerA.id,
      'route-supplier',
      routeA.id,
      supplierA.id,
    );
    await service.attach(customerA.id, 'route-factory', routeA.id, factoryA.id);
    await service.addRoutePort(customerA.id, routeA.id, port.id, 1);

    await expect(
      service.attach(
        customerA.id,
        'supplier-product',
        supplierA.id,
        productA.id,
      ),
    ).rejects.toMatchObject({ code: 'RELATIONSHIP_ALREADY_EXISTS' });

    const productB = await service.createProduct(customerB.id, {
      name: 'Product B',
      criticality: 'LOW',
    });
    const supplierB = await service.createSupplier(customerB.id, {
      name: 'Supplier B',
      country: 'Thailand',
      tier: 'TIER_2',
      criticality: 'LOW',
    });
    const factoryB = await service.createFactory(customerB.id, {
      name: 'Factory B',
      country: 'Thailand',
      criticality: 'LOW',
      supplierId: supplierB.id,
    });
    const routeB = await service.createRoute(customerB.id, {
      name: 'Route B',
      originLabel: 'Bangkok',
      destinationLabel: 'Singapore',
      transportMode: 'ROAD',
      criticality: 'LOW',
    });

    await expect(
      service.attach(customerA.id, 'factory-product', factoryA.id, productB.id),
    ).rejects.toMatchObject({ code: 'CROSS_CUSTOMER_RELATIONSHIP' });
    await expect(
      service.attach(customerA.id, 'route-supplier', routeB.id, supplierA.id),
    ).rejects.toMatchObject({ code: 'CROSS_CUSTOMER_RELATIONSHIP' });
    await expect(
      service.attach(customerA.id, 'route-factory', routeA.id, factoryB.id),
    ).rejects.toMatchObject({ code: 'CROSS_CUSTOMER_RELATIONSHIP' });

    await expect(
      db.factoryProduct.create({
        data: {
          customerId: customerA.id,
          factoryId: factoryA.id,
          productId: productB.id,
        },
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003',
    );
    await expect(
      db.routeFactory.create({
        data: {
          customerId: customerA.id,
          routeId: routeA.id,
          factoryId: factoryB.id,
        },
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003',
    );

    await Promise.all([
      service.archiveSupplier(customerA.id, supplierA.id),
      service.archiveFactory(customerA.id, factoryA.id),
      service.archiveProduct(customerA.id, productA.id),
      service.archiveMaterial(customerA.id, materialA.id),
      service.archiveRoute(customerA.id, routeA.id),
    ]);

    const graph = await service.graph(customerA.id);
    expect(graph.suppliers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: supplierA.id, active: false }),
      ]),
    );
    expect(graph.factories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: factoryA.id, active: false }),
      ]),
    );
    expect(graph.products).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: productA.id, active: false }),
      ]),
    );
    expect(graph.materials).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: materialA.id, active: false }),
      ]),
    );
    expect(graph.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: routeA.id, active: false }),
      ]),
    );
    expect(graph.ports).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: port.id })]),
    );
    expect(graph.relationships.supplierProducts).toContainEqual(
      expect.objectContaining({
        supplierId: supplierA.id,
        productId: productA.id,
      }),
    );
    expect(graph.relationships.factoryProducts).toContainEqual(
      expect.objectContaining({
        factoryId: factoryA.id,
        productId: productA.id,
      }),
    );
    expect(graph.relationships.productMaterials).toContainEqual(
      expect.objectContaining({
        productId: productA.id,
        materialId: materialA.id,
      }),
    );
    expect(graph.relationships.routeSuppliers).toContainEqual(
      expect.objectContaining({ routeId: routeA.id, supplierId: supplierA.id }),
    );
    expect(graph.relationships.routeFactories).toContainEqual(
      expect.objectContaining({ routeId: routeA.id, factoryId: factoryA.id }),
    );
    expect(graph.relationships.routePorts).toContainEqual(
      expect.objectContaining({
        routeId: routeA.id,
        portId: port.id,
        sequence: 1,
      }),
    );
  });
});

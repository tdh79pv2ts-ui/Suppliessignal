import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const customer = await prisma.customer.upsert({
    where: { id: '5a6ce6b4-0d65-4d16-90dc-04b751f5169b' },
    update: {},
    create: {
      id: '5a6ce6b4-0d65-4d16-90dc-04b751f5169b',
      name: 'Demo Apparel Group',
      description: 'Fictional customer used for local development.',
      defaultAlertThreshold: 60,
    },
  });

  await prisma.user.upsert({
    where: { email: 'customer@demo.suppliesignal.local' },
    update: {},
    create: {
      // In a configured environment this must match the Supabase Auth user UUID.
      id: 'f30a7d12-ecf6-4f9d-a73d-c2fd12f06e3f',
      email: 'customer@demo.suppliesignal.local',
      name: 'Demo Customer',
      role: UserRole.CUSTOMER,
    },
  });

  await prisma.customerMembership.upsert({
    where: {
      userId_customerId: {
        userId: 'f30a7d12-ecf6-4f9d-a73d-c2fd12f06e3f',
        customerId: customer.id,
      },
    },
    update: {},
    create: {
      userId: 'f30a7d12-ecf6-4f9d-a73d-c2fd12f06e3f',
      customerId: customer.id,
    },
  });

  const supplierRows = [
    ['11111111-1111-4111-8111-111111111111', 'Bengal Apparel Partners', 'Bangladesh', 'Gazipur', 'TIER_1'],
    ['22222222-2222-4222-8222-222222222222', 'Irrawaddy Garment Partners', 'Myanmar', 'Yangon', 'TIER_1'],
    ['33333333-3333-4333-8333-333333333333', 'Pearl River Accessories', 'China', 'Guangzhou', 'TIER_2'],
  ] as const;
  for (const [id, name, country, city, tier] of supplierRows) await prisma.supplier.upsert({ where: { id }, update: {}, create: { id, customerId: customer.id, name, country, city, tier, criticality: 'HIGH', supplierType: 'FICTIONAL_DEMO' } });

  const factoryRows = [
    ['41111111-1111-4111-8111-111111111111', supplierRows[0][0], 'Gazipur Apparel Works', 'Bangladesh', 'Gazipur', 'Apparel assembly'],
    ['42222222-2222-4222-8222-222222222222', supplierRows[1][0], 'Yangon Garment Works', 'Myanmar', 'Yangon', 'Cut and sew'],
    ['43333333-3333-4333-8333-333333333333', supplierRows[2][0], 'Guangzhou Bag Works', 'China', 'Guangzhou', 'Bag assembly'],
  ] as const;
  for (const [id, supplierId, name, country, city, productionType] of factoryRows) await prisma.factory.upsert({ where: { id }, update: {}, create: { id, customerId: customer.id, supplierId, name, country, city, productionType, criticality: 'HIGH' } });

  const productRows = [
    ['51111111-1111-4111-8111-111111111111', 'Cotton T-Shirt', 'APP-TSHIRT'], ['52222222-2222-4222-8222-222222222222', 'Casual Shirt', 'APP-SHIRT'],
    ['53333333-3333-4333-8333-333333333333', 'Lightweight Jacket', 'APP-JACKET'], ['54444444-4444-4444-8444-444444444444', 'Casual Apparel', 'APP-CASUAL'],
    ['55555555-5555-4555-8555-555555555555', 'Leather Handbag', 'ACC-HANDBAG'], ['56666666-6666-4666-8666-666666666666', 'Travel Bag', 'ACC-TRAVEL'],
  ] as const;
  for (const [id, name, sku] of productRows) await prisma.product.upsert({ where: { id }, update: {}, create: { id, customerId: customer.id, name, sku, category: sku.startsWith('APP') ? 'Apparel' : 'Accessories', criticality: 'HIGH' } });

  const materialNames = ['Cotton', 'Polyester', 'Leather', 'Nylon', 'Zippers', 'Metal Hardware', 'Packaging'];
  const materialIds = materialNames.map((_, index) => `6${index + 1}111111-1111-4111-8111-111111111111`);
  for (const [index, name] of materialNames.entries()) await prisma.material.upsert({ where: { id: materialIds[index]! }, update: {}, create: { id: materialIds[index]!, customerId: customer.id, name, category: index < 4 ? 'Textile and primary material' : 'Component', commodity: name, criticality: index === 6 ? 'MEDIUM' : 'HIGH', substitutable: name === 'Packaging' } });

  const ports = [
    ['71111111-1111-4111-8111-111111111111', 'Port of Chattogram', 'Bangladesh', 'Chattogram', 'BDCGP', 22.3133, 91.8008],
    ['72222222-2222-4222-8222-222222222222', 'Port of Yangon', 'Myanmar', 'Yangon', 'MMRGN', 16.7667, 96.1667],
    ['73333333-3333-4333-8333-333333333333', 'Port of Guangzhou', 'China', 'Guangzhou', 'CNCAN', 23.0833, 113.5167],
  ] as const;
  for (const [id, name, country, city, portCode, latitude, longitude] of ports) await prisma.port.upsert({ where: { id }, update: {}, create: { id, name, country, city, portCode, latitude, longitude } });

  const routeRows = [
    ['81111111-1111-4111-8111-111111111111', 'Bangladesh export route', 'Gazipur', 'European distribution hub', 'MULTIMODAL'],
    ['82222222-2222-4222-8222-222222222222', 'Myanmar export route', 'Yangon production cluster', 'European distribution hub', 'SEA'],
    ['83333333-3333-4333-8333-333333333333', 'Guangzhou accessories route', 'Guangzhou', 'European distribution hub', 'SEA'],
  ] as const;
  for (const [id, name, originLabel, destinationLabel, transportMode] of routeRows) await prisma.route.upsert({ where: { id }, update: {}, create: { id, customerId: customer.id, name, originLabel, destinationLabel, transportMode, criticality: 'HIGH' } });

  const supplierProducts = [[supplierRows[0][0], productRows[0][0]], [supplierRows[0][0], productRows[1][0]], [supplierRows[1][0], productRows[2][0]], [supplierRows[1][0], productRows[3][0]], [supplierRows[2][0], productRows[4][0]], [supplierRows[2][0], productRows[5][0]]] as const;
  for (const [supplierId, productId] of supplierProducts) await prisma.supplierProduct.upsert({ where: { supplierId_productId: { supplierId, productId } }, update: {}, create: { customerId: customer.id, supplierId, productId } });
  for (let index = 0; index < factoryRows.length; index++) for (const productIndex of [index * 2, index * 2 + 1]) await prisma.factoryProduct.upsert({ where: { factoryId_productId: { factoryId: factoryRows[index]![0], productId: productRows[productIndex]![0] } }, update: {}, create: { customerId: customer.id, factoryId: factoryRows[index]![0], productId: productRows[productIndex]![0] } });
  const productMaterials = [[0, 0], [0, 4], [1, 0], [1, 4], [2, 1], [2, 3], [3, 1], [4, 2], [4, 5], [5, 3], [5, 4], [5, 6]] as const;
  for (const [productIndex, materialIndex] of productMaterials) await prisma.productMaterial.upsert({ where: { productId_materialId: { productId: productRows[productIndex]![0], materialId: materialIds[materialIndex]! } }, update: {}, create: { customerId: customer.id, productId: productRows[productIndex]![0], materialId: materialIds[materialIndex]! } });
  for (let index = 0; index < routeRows.length; index++) {
    await prisma.routeSupplier.upsert({ where: { routeId_supplierId: { routeId: routeRows[index]![0], supplierId: supplierRows[index]![0] } }, update: {}, create: { customerId: customer.id, routeId: routeRows[index]![0], supplierId: supplierRows[index]![0] } });
    await prisma.routeFactory.upsert({ where: { routeId_factoryId: { routeId: routeRows[index]![0], factoryId: factoryRows[index]![0] } }, update: {}, create: { customerId: customer.id, routeId: routeRows[index]![0], factoryId: factoryRows[index]![0] } });
    await prisma.routePort.upsert({ where: { routeId_portId: { routeId: routeRows[index]![0], portId: ports[index]![0] } }, update: { sequence: 1 }, create: { customerId: customer.id, routeId: routeRows[index]![0], portId: ports[index]![0], sequence: 1 } });
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

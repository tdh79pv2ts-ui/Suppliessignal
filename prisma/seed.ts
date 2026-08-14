import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();
const verifiedAt = new Date('2026-08-14T00:00:00.000Z');
const appleSupplierSource = {
  sourceName: 'Apple Supplier Clean Energy Program Update 2022',
  sourceUrl: 'https://www.apple.com/vn/environment/pdf/Apple_Supplier_Clean_Energy_Program_Update_2022.pdf',
  verifiedAt,
};
const tsmcFactorySource = {
  sourceName: 'TSMC Fab Locations',
  sourceUrl: 'https://www.tsmc.com/english/aboutTSMC/tsmc_fabs',
  verifiedAt,
};
const iphoneSource = {
  sourceName: 'Apple iPhone 16e Product Environmental Report',
  sourceUrl: 'https://www.apple.com/si/environment/pdf/products/iphone/iPhone_16e_PER_June2025.pdf',
  verifiedAt,
};

async function main() {
  const customer = await prisma.customer.upsert({
    where: { id: '5a6ce6b4-0d65-4d16-90dc-04b751f5169b' },
    update: { name: 'Apple Public Supply Chain POC', description: 'Evidence-backed public-data workspace. Unknown relationships are intentionally absent.' },
    create: { id: '5a6ce6b4-0d65-4d16-90dc-04b751f5169b', name: 'Apple Public Supply Chain POC', description: 'Evidence-backed public-data workspace. Unknown relationships are intentionally absent.', defaultAlertThreshold: 60 },
  });
  await prisma.user.upsert({
    where: { email: 'customer@demo.suppliesignal.local' },
    update: {},
    create: { id: 'f30a7d12-ecf6-4f9d-a73d-c2fd12f06e3f', email: 'customer@demo.suppliesignal.local', name: 'Demo Customer', role: UserRole.CUSTOMER },
  });
  await prisma.customerMembership.upsert({
    where: { userId_customerId: { userId: 'f30a7d12-ecf6-4f9d-a73d-c2fd12f06e3f', customerId: customer.id } },
    update: {}, create: { userId: 'f30a7d12-ecf6-4f9d-a73d-c2fd12f06e3f', customerId: customer.id },
  });

  const companies = [
    ['c0000000-0000-4000-8000-000000000001', 'Apple Inc.', 'Apple Inc.', 'United States', 'Customer company', 'Apple Supply Chain', 'https://www.apple.com/supply-chain/'],
    ['c0000000-0000-4000-8000-000000000002', 'TSMC', 'Taiwan Semiconductor Manufacturing Company Limited', 'Taiwan', 'Semiconductor manufacturer', appleSupplierSource.sourceName, appleSupplierSource.sourceUrl],
    ['c0000000-0000-4000-8000-000000000003', 'Hon Hai Precision Industry', 'Hon Hai Precision Industry Co., Ltd.', 'Taiwan', 'Electronics manufacturer', appleSupplierSource.sourceName, appleSupplierSource.sourceUrl],
    ['c0000000-0000-4000-8000-000000000004', 'Corning', 'Corning Incorporated', 'United States', 'Materials manufacturer', appleSupplierSource.sourceName, appleSupplierSource.sourceUrl],
    ['c0000000-0000-4000-8000-000000000005', 'Infineon Technologies', 'Infineon Technologies AG', 'Germany', 'Semiconductor manufacturer', appleSupplierSource.sourceName, appleSupplierSource.sourceUrl],
    ['c0000000-0000-4000-8000-000000000006', 'Micron Technology', 'Micron Technology, Inc.', 'United States', 'Semiconductor manufacturer', appleSupplierSource.sourceName, appleSupplierSource.sourceUrl],
  ] as const;
  for (const [id, name, legalName, country, category, sourceName, sourceUrl] of companies) await prisma.company.upsert({
    where: { id }, update: { customerId: customer.id, name, legalName, country, category, sourceName, sourceUrl, verifiedAt, active: true },
    create: { id, customerId: customer.id, name, legalName, country, category, sourceName, sourceUrl, verifiedAt },
  });

  const suppliers = [
    ['c1000000-0000-4000-8000-000000000001', 'Taiwan Semiconductor Manufacturing Company Limited', 'Taiwan', 'Semiconductor foundry'],
    ['c1000000-0000-4000-8000-000000000002', 'Hon Hai Precision Industry Co., Ltd.', 'Taiwan', 'Electronics manufacturing'],
    ['c1000000-0000-4000-8000-000000000003', 'Corning Incorporated', 'United States', 'Materials manufacturing'],
    ['c1000000-0000-4000-8000-000000000004', 'Infineon Technologies AG', 'Germany', 'Semiconductors'],
    ['c1000000-0000-4000-8000-000000000005', 'Micron Technology, Inc.', 'United States', 'Memory and storage'],
  ] as const;
  for (const [id, name, country, category] of suppliers) await prisma.supplier.upsert({
    where: { id }, update: { customerId: customer.id, name, legalName: name, country, category, supplierType: 'Publicly disclosed Apple supplier', tier: 'TIER_1', criticality: 'HIGH', ...appleSupplierSource, active: true },
    create: { id, customerId: customer.id, name, legalName: name, country, category, supplierType: 'Publicly disclosed Apple supplier', tier: 'TIER_1', criticality: 'HIGH', ...appleSupplierSource },
  });
  for (let index = 0; index < suppliers.length; index++) await prisma.companySupplier.upsert({
    where: { companyId_supplierId: { companyId: companies[0][0], supplierId: suppliers[index]![0] } },
    update: { customerId: customer.id, sourceName: appleSupplierSource.sourceName, sourceUrl: appleSupplierSource.sourceUrl, collectedAt: verifiedAt, confidence: 1 },
    create: { customerId: customer.id, companyId: companies[0][0], supplierId: suppliers[index]![0], sourceName: appleSupplierSource.sourceName, sourceUrl: appleSupplierSource.sourceUrl, collectedAt: verifiedAt, confidence: 1 },
  });

  const countries = [
    ['c2000000-0000-4000-8000-000000000001', 'Taiwan', 'TW'],
    ['c2000000-0000-4000-8000-000000000002', 'United States', 'US'],
    ['c2000000-0000-4000-8000-000000000003', 'Germany', 'DE'],
    ['c2000000-0000-4000-8000-000000000004', 'Netherlands', 'NL'],
  ] as const;
  for (const [id, name, iso2] of countries) await prisma.country.upsert({
    where: { id }, update: { name, iso2, sourceName: 'ISO 3166 country reference', sourceUrl: 'https://www.iso.org/iso-3166-country-codes.html', verifiedAt },
    create: { id, name, iso2, sourceName: 'ISO 3166 country reference', sourceUrl: 'https://www.iso.org/iso-3166-country-codes.html', verifiedAt },
  });
  const locations = [
    ['c3000000-0000-4000-8000-000000000001', countries[0][0], 'Hsinchu Science Park', 'Taiwan', 'Hsinchu', 24.774, 121.011],
    ['c3000000-0000-4000-8000-000000000002', countries[0][0], 'Southern Taiwan Science Park', 'Taiwan', 'Tainan', 23.113, 120.276],
    ['c3000000-0000-4000-8000-000000000003', countries[0][0], 'Central Taiwan Science Park', 'Taiwan', 'Taichung', 24.218, 120.609],
  ] as const;
  for (const [id, countryId, name, countryName, location, latitude, longitude] of locations) await prisma.location.upsert({
    where: { id }, update: { customerId: customer.id, countryId, name, country: countryName, location, category: 'Semiconductor manufacturing location', latitude, longitude, ...tsmcFactorySource, active: true },
    create: { id, customerId: customer.id, countryId, name, country: countryName, location, category: 'Semiconductor manufacturing location', latitude, longitude, ...tsmcFactorySource },
  });
  const factories = [
    ['c4000000-0000-4000-8000-000000000001', 'TSMC Fab 12A', 'Hsinchu', locations[0][0]],
    ['c4000000-0000-4000-8000-000000000002', 'TSMC Fab 14', 'Tainan', locations[1][0]],
    ['c4000000-0000-4000-8000-000000000003', 'TSMC Fab 15', 'Taichung', locations[2][0]],
  ] as const;
  for (const [id, name, city, locationId] of factories) {
    await prisma.factory.upsert({
      where: { id }, update: { customerId: customer.id, supplierId: suppliers[0][0], name, country: 'Taiwan', city, productionType: 'Semiconductor wafer fabrication', category: 'Semiconductor fab', criticality: 'HIGH', ...tsmcFactorySource, supplierRelationSourceName: tsmcFactorySource.sourceName, supplierRelationSourceUrl: tsmcFactorySource.sourceUrl, supplierRelationCollectedAt: verifiedAt, supplierRelationConfidence: 1, active: true },
      create: { id, customerId: customer.id, supplierId: suppliers[0][0], name, country: 'Taiwan', city, productionType: 'Semiconductor wafer fabrication', category: 'Semiconductor fab', criticality: 'HIGH', ...tsmcFactorySource, supplierRelationSourceName: tsmcFactorySource.sourceName, supplierRelationSourceUrl: tsmcFactorySource.sourceUrl, supplierRelationCollectedAt: verifiedAt, supplierRelationConfidence: 1 },
    });
    await prisma.factoryLocation.upsert({
      where: { factoryId_locationId: { factoryId: id, locationId } }, update: { customerId: customer.id, sourceName: tsmcFactorySource.sourceName, sourceUrl: tsmcFactorySource.sourceUrl, collectedAt: verifiedAt, confidence: 1 },
      create: { customerId: customer.id, factoryId: id, locationId, sourceName: tsmcFactorySource.sourceName, sourceUrl: tsmcFactorySource.sourceUrl, collectedAt: verifiedAt, confidence: 1 },
    });
  }

  const productId = 'c5000000-0000-4000-8000-000000000001';
  await prisma.product.upsert({ where: { id: productId }, update: { customerId: customer.id, name: 'iPhone 16e', category: 'Smartphone', description: 'Product covered by Apple product environmental reporting.', criticality: 'HIGH', ...iphoneSource, active: true }, create: { id: productId, customerId: customer.id, name: 'iPhone 16e', category: 'Smartphone', description: 'Product covered by Apple product environmental reporting.', criticality: 'HIGH', ...iphoneSource } });
  const materials = ['Cobalt', 'Lithium', 'Rare earth elements', 'Tin', 'Gold', 'Copper'] as const;
  for (const [index, name] of materials.entries()) {
    const id = `c6${String(index + 1).padStart(6, '0')}-0000-4000-8000-000000000001`;
    await prisma.material.upsert({ where: { id }, update: { customerId: customer.id, name, category: 'Product material', commodity: name, criticality: 'HIGH', substitutable: false, ...iphoneSource, active: true }, create: { id, customerId: customer.id, name, category: 'Product material', commodity: name, criticality: 'HIGH', substitutable: false, ...iphoneSource } });
    await prisma.productMaterial.upsert({ where: { productId_materialId: { productId, materialId: id } }, update: { customerId: customer.id, sourceName: iphoneSource.sourceName, sourceUrl: iphoneSource.sourceUrl, collectedAt: verifiedAt, confidence: 1 }, create: { customerId: customer.id, productId, materialId: id, sourceName: iphoneSource.sourceName, sourceUrl: iphoneSource.sourceUrl, collectedAt: verifiedAt, confidence: 1 } });
  }

  const ports = [
    ['c7000000-0000-4000-8000-000000000001', 'Port of Los Angeles', 'United States', 'Los Angeles', 'USLAX', 'https://www.portoflosangeles.org/business/statistics/facts-and-figures'],
    ['c7000000-0000-4000-8000-000000000002', 'Port of Rotterdam', 'Netherlands', 'Rotterdam', 'NLRTM', 'https://www.portofrotterdam.com/en'],
  ] as const;
  for (const [id, name, country, city, portCode, sourceUrl] of ports) await prisma.port.upsert({ where: { id }, update: { name, country, city, portCode, category: 'Commercial seaport', sourceName: `${name} official website`, sourceUrl, verifiedAt, active: true }, create: { id, name, country, city, portCode, category: 'Commercial seaport', sourceName: `${name} official website`, sourceUrl, verifiedAt } });

  // BSK Fashion public-data workspace. No supplier, material, route or port
  // relationships are inferred beyond statements on BSK's own pages.
  const bskCustomer = await prisma.customer.upsert({ where: { id: 'b5000000-0000-4000-8000-000000000001' }, update: { name: 'BSK Fashion', description: 'Public-data POC for BSK Fashion bag and accessories manufacturing.' }, create: { id: 'b5000000-0000-4000-8000-000000000001', name: 'BSK Fashion', description: 'Public-data POC for BSK Fashion bag and accessories manufacturing.' } });
  await prisma.customerMembership.upsert({ where: { userId_customerId: { userId: 'f30a7d12-ecf6-4f9d-a73d-c2fd12f06e3f', customerId: bskCustomer.id } }, update: {}, create: { userId: 'f30a7d12-ecf6-4f9d-a73d-c2fd12f06e3f', customerId: bskCustomer.id } });
  const bskSource = { sourceName: 'BSK Fashion official website', sourceUrl: 'https://bskfashion.com/facilities', verifiedAt };
  const bskFactories = [
    ['b5100000-0000-4000-8000-000000000001', 'Guangzhou Bisakai Leather Co., Ltd', 'China', 'Guangzhou', 'Shiling Town, Huadu District, Guangzhou'],
    ['b5100000-0000-4000-8000-000000000002', 'Welcombine Co., Ltd', 'Myanmar', 'Yangon', 'Yangon, Myanmar'],
    ['b5100000-0000-4000-8000-000000000003', 'YLX Company Limited', 'Myanmar', 'Yangon', 'Yangon, Myanmar'],
    ['b5100000-0000-4000-8000-000000000004', 'BSK Bangladesh', 'Bangladesh', 'Cumilla', 'Cumilla EPZ, Bangladesh'],
  ] as const;
  for (const [id, name, country, city, address] of bskFactories) await prisma.factory.upsert({ where: { id }, update: { customerId: bskCustomer.id, name, country, city, address, category: 'Bag manufacturing', productionType: 'Bag production', criticality: 'MEDIUM', ...bskSource, active: true }, create: { id, customerId: bskCustomer.id, name, country, city, address, category: 'Bag manufacturing', productionType: 'Bag production', criticality: 'MEDIUM', ...bskSource } });
  const bskProducts = [['b5200000-0000-4000-8000-000000000001', 'Handbag'], ['b5200000-0000-4000-8000-000000000002', 'Backpack'], ['b5200000-0000-4000-8000-000000000003', 'Travel Bag'], ['b5200000-0000-4000-8000-000000000004', 'Crossbody Bag'], ['b5200000-0000-4000-8000-000000000005', 'Cosmetic Bag'], ['b5200000-0000-4000-8000-000000000006', 'Wallet']] as const;
  for (const [id, name] of bskProducts) await prisma.product.upsert({ where: { id }, update: { customerId: bskCustomer.id, name, category: 'Bags and accessories', sourceName: 'BSK Fashion product catalog', sourceUrl: 'https://bskfashion.com/products', verifiedAt, active: true }, create: { id, customerId: bskCustomer.id, name, category: 'Bags and accessories', criticality: 'MEDIUM', sourceName: 'BSK Fashion product catalog', sourceUrl: 'https://bskfashion.com/products', verifiedAt } });
  for (const productId of [bskProducts[0][0], bskProducts[1][0]]) await prisma.factoryProduct.upsert({ where: { factoryId_productId: { factoryId: bskFactories[1][0], productId } }, update: { customerId: bskCustomer.id, sourceName: bskSource.sourceName, sourceUrl: bskSource.sourceUrl, collectedAt: verifiedAt, confidence: 1 }, create: { customerId: bskCustomer.id, factoryId: bskFactories[1][0], productId, sourceName: bskSource.sourceName, sourceUrl: bskSource.sourceUrl, collectedAt: verifiedAt, confidence: 1 } });

  const sources = [
    ['BGMEA', 'https://www.bgmea.com.bd/', 'Bangladesh', 'INDUSTRY', 'MEDIUM'],
    ['Myanmar National Trade Portal', 'https://www.myanmartradeportal.gov.mm/', 'Myanmar', 'TRADE', 'PRIMARY'],
    ['Myanmar Customs', 'https://www.customs.gov.mm/', 'Myanmar', 'GOVERNMENT', 'PRIMARY'],
    ['Guangzhou Municipal Government', 'https://www.gz.gov.cn/', 'China', 'GOVERNMENT', 'PRIMARY'],
    ['European Commission Trade', 'https://policy.trade.ec.europa.eu/', null, 'REGULATOR', 'PRIMARY'],
    ['International Maritime Organization', 'https://www.imo.org/', null, 'LOGISTICS', 'PRIMARY'],
  ] as const;
  for (const [name, baseUrl, country, category, reliability] of sources) if (!await prisma.source.findFirst({ where: { name } })) await prisma.source.create({ data: { name, sourceType: 'WEB', baseUrl, country, category, reliability, active: true, collectionEnabled: false } });
  const realNewsSources = [
    { id: 'a1000000-0000-4000-8000-000000000001', name: 'USGS Significant Earthquakes', sourceType: 'ATOM' as const, baseUrl: 'https://earthquake.usgs.gov/', feedUrl: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.atom', category: 'WEATHER' as const },
    { id: 'a1000000-0000-4000-8000-000000000002', name: 'World Trade Organization News', sourceType: 'RSS' as const, baseUrl: 'https://www.wto.org/', feedUrl: 'https://www.wto.org/library/rss/latest_news_e.xml', category: 'TRADE' as const },
  ];
  for (const source of realNewsSources) await prisma.source.upsert({ where: { id: source.id }, update: { ...source, reliability: 'PRIMARY', active: true, collectionEnabled: true, collectionIntervalMinutes: 15 }, create: { ...source, reliability: 'PRIMARY', active: true, collectionEnabled: true, collectionIntervalMinutes: 15 } });
  await prisma.newsletterPreference.upsert({ where: { userId_customerId: { userId: 'f30a7d12-ecf6-4f9d-a73d-c2fd12f06e3f', customerId: customer.id } }, update: {}, create: { userId: 'f30a7d12-ecf6-4f9d-a73d-c2fd12f06e3f', customerId: customer.id, enabled: false, deliveryTime: '08:00', timezone: 'Europe/Amsterdam', email: 'customer@demo.suppliesignal.local' } });
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });

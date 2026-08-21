import { PrismaClient, UserRole } from '@prisma/client';
import { bskPublicSourceCatalog } from './source-catalog.js';

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
  await prisma.company.upsert({ where: { id: 'b5050000-0000-4000-8000-000000000001' }, update: { customerId: bskCustomer.id, name: 'BSK Fashion', category: 'Bag and accessories manufacturer', country: 'China', sourceName: 'BSK Fashion company history', sourceUrl: 'https://bskfashion.com/about', verifiedAt, active: true }, create: { id: 'b5050000-0000-4000-8000-000000000001', customerId: bskCustomer.id, name: 'BSK Fashion', category: 'Bag and accessories manufacturer', country: 'China', sourceName: 'BSK Fashion company history', sourceUrl: 'https://bskfashion.com/about', verifiedAt } });
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
  const bskMaterialSource = { sourceName: 'BSK Fashion product catalog', sourceUrl: 'https://bskfashion.com/products', verifiedAt };
  for (const [index, name] of ['Faux leather', 'Nylon', 'Polyester', 'PU', 'Semi PU'].entries()) {
    const id = `b53${String(index + 1).padStart(5, '0')}-0000-4000-8000-000000000001`;
    await prisma.material.upsert({ where: { id }, update: { customerId: bskCustomer.id, name, category: 'Published catalog material', commodity: name, criticality: 'MEDIUM', substitutable: false, ...bskMaterialSource, active: true }, create: { id, customerId: bskCustomer.id, name, category: 'Published catalog material', commodity: name, criticality: 'MEDIUM', substitutable: false, ...bskMaterialSource } });
  }
  const bskCountries = [
    ['b5400000-0000-4000-8000-000000000001', 'China', 'CN'],
    ['b5400000-0000-4000-8000-000000000002', 'Myanmar', 'MM'],
    ['b5400000-0000-4000-8000-000000000003', 'Bangladesh', 'BD'],
  ] as const;
  for (const [id, name, iso2] of bskCountries) await prisma.country.upsert({ where: { iso2 }, update: { name, sourceName: 'ISO 3166 country reference', sourceUrl: 'https://www.iso.org/iso-3166-country-codes.html', verifiedAt }, create: { id, name, iso2, sourceName: 'ISO 3166 country reference', sourceUrl: 'https://www.iso.org/iso-3166-country-codes.html', verifiedAt } });
  const persistedBskCountries = await prisma.country.findMany({ where: { iso2: { in: bskCountries.map((country) => country[2]) } } });
  const bskLocations = [
    ['b5500000-0000-4000-8000-000000000001', 'Guangzhou, China', 'China', 'CN', 'Guangzhou', bskFactories[0][0]],
    ['b5500000-0000-4000-8000-000000000002', 'Yangon, Myanmar', 'Myanmar', 'MM', 'Yangon', bskFactories[1][0]],
    ['b5500000-0000-4000-8000-000000000003', 'Yangon, Myanmar — YLX', 'Myanmar', 'MM', 'Yangon', bskFactories[2][0]],
    ['b5500000-0000-4000-8000-000000000004', 'Cumilla EPZ, Bangladesh', 'Bangladesh', 'BD', 'Cumilla EPZ', bskFactories[3][0]],
  ] as const;
  for (const [id, name, country, iso2, location, factoryId] of bskLocations) {
    const countryId = persistedBskCountries.find((entry) => entry.iso2 === iso2)!.id;
    await prisma.location.upsert({ where: { id }, update: { customerId: bskCustomer.id, countryId, name, country, location, category: 'Published production location', ...bskSource, active: true }, create: { id, customerId: bskCustomer.id, countryId, name, country, location, category: 'Published production location', ...bskSource } });
    await prisma.factoryLocation.upsert({ where: { factoryId_locationId: { factoryId, locationId: id } }, update: { customerId: bskCustomer.id, sourceName: bskSource.sourceName, sourceUrl: bskSource.sourceUrl, collectedAt: verifiedAt, confidence: 1 }, create: { customerId: bskCustomer.id, factoryId, locationId: id, sourceName: bskSource.sourceName, sourceUrl: bskSource.sourceUrl, collectedAt: verifiedAt, confidence: 1 } });
  }

  const sources = [
    ['BGMEA', 'https://www.bgmea.com.bd/', 'Bangladesh', 'South Asia', 'Apparel and garment manufacturing', 'INDUSTRY', 'MEDIUM'],
    ['Bangladesh Trade Portal', 'https://www.bangladeshtradeportal.gov.bd/', 'Bangladesh', 'South Asia', 'Trade regulation and export procedures', 'GOVERNMENT', 'PRIMARY'],
    ['Bangladesh Customs', 'https://bangladeshcustoms.gov.bd/', 'Bangladesh', 'South Asia', 'Customs and import/export procedures', 'GOVERNMENT', 'PRIMARY'],
    ['Myanmar National Trade Portal', 'https://www.myanmartradeportal.gov.mm/', 'Myanmar', 'Southeast Asia', 'Trade and manufacturing', 'TRADE', 'PRIMARY'],
    ['Myanmar Customs', 'https://www.customs.gov.mm/', 'Myanmar', 'Southeast Asia', 'Customs and logistics', 'GOVERNMENT', 'PRIMARY'],
    ['Myanmar Ministry of Commerce', 'https://commerce.gov.mm/', 'Myanmar', 'Southeast Asia', 'Trade policy and market access', 'GOVERNMENT', 'PRIMARY'],
    ['Myanmar Ministry of Industry', 'https://industry.gov.mm/', 'Myanmar', 'Southeast Asia', 'Manufacturing and industrial policy', 'GOVERNMENT', 'PRIMARY'],
    ['Guangzhou Municipal Government', 'https://www.gz.gov.cn/', 'China', 'Greater China', 'Manufacturing and regulation', 'GOVERNMENT', 'PRIMARY'],
    ['General Administration of Customs of China', 'https://www.customs.gov.cn/', 'China', 'Greater China', 'Customs and import/export regulation', 'GOVERNMENT', 'PRIMARY'],
    ['European Commission Trade', 'https://policy.trade.ec.europa.eu/', null, 'Europe', 'Trade regulation', 'REGULATOR', 'PRIMARY'],
    ['International Maritime Organization', 'https://www.imo.org/', null, null, 'Maritime logistics', 'LOGISTICS', 'PRIMARY'],
    ['World Customs Organization', 'https://www.wcoomd.org/en/media.aspx', null, null, 'Customs and trade facilitation', 'TRADE', 'PRIMARY'],
    ['ASEAN Secretariat News', 'https://asean.org/category/news/', null, 'Southeast Asia', 'Regional trade and policy', 'GOVERNMENT', 'PRIMARY'],
    ['Reuters Asia Pacific', 'https://www.reuters.com/world/asia-pacific/', null, null, 'Regional business and logistics news', 'NEWS', 'HIGH'],
    ['Financial Times Supply Chain', 'https://www.ft.com/supply-chain', null, null, 'Global supply-chain business news', 'MARKET', 'HIGH'],
    ['Associated Press Asia Pacific', 'https://apnews.com/hub/asia-pacific', null, null, 'Regional public-interest news', 'NEWS', 'HIGH'],
  ] as const;
  for (const [name, baseUrl, country, region, industry, category, reliability] of sources) {
    const existing = await prisma.source.findFirst({ where: { name } });
    const data = { name, sourceType: 'WEB' as const, baseUrl, country, region, industry, category, reliability, active: true, collectionEnabled: false };
    if (existing) await prisma.source.update({ where: { id: existing.id }, data });
    else await prisma.source.create({ data });
  }
  const regionalNewsSources = [
    { id: 'a2000000-0000-4000-8000-000000000001', name: 'South China Morning Post — China', sourceType: 'RSS' as const, baseUrl: 'https://www.scmp.com/', feedUrl: 'https://www.scmp.com/rss/4/feed', country: 'China', region: 'Greater China', industry: 'Manufacturing, trade and logistics', category: 'LOCAL_NEWS' as const, reliability: 'HIGH' as const, language: 'en' },
    { id: 'a2000000-0000-4000-8000-000000000002', name: 'The Daily Star — Business', sourceType: 'RSS' as const, baseUrl: 'https://www.thedailystar.net/', feedUrl: 'https://www.thedailystar.net/business/rss.xml', country: 'Bangladesh', region: 'South Asia', industry: 'Apparel, manufacturing and trade', category: 'LOCAL_NEWS' as const, reliability: 'HIGH' as const, language: 'en' },
    { id: 'a2000000-0000-4000-8000-000000000003', name: 'Myanmar Trade Training Institute', sourceType: 'RSS' as const, baseUrl: 'https://tti.commerce.gov.mm/', feedUrl: 'https://tti.commerce.gov.mm/rss.xml', country: 'Myanmar', region: 'Southeast Asia', industry: 'Trade and manufacturing', category: 'GOVERNMENT' as const, reliability: 'PRIMARY' as const, language: 'en' },
  ];
  for (const source of regionalNewsSources) await prisma.source.upsert({ where: { id: source.id }, update: { ...source, active: true, collectionEnabled: true, collectionIntervalMinutes: 5 }, create: { ...source, active: true, collectionEnabled: true, collectionIntervalMinutes: 5 } });
  const realNewsSources = [
    { id: 'a1000000-0000-4000-8000-000000000001', name: 'USGS Significant Earthquakes', sourceType: 'ATOM' as const, baseUrl: 'https://earthquake.usgs.gov/', feedUrl: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.atom', industry: 'Physical disruption monitoring', category: 'WEATHER' as const, language: 'en' },
    { id: 'a1000000-0000-4000-8000-000000000002', name: 'World Trade Organization News', sourceType: 'RSS' as const, baseUrl: 'https://www.wto.org/', feedUrl: 'https://www.wto.org/library/rss/latest_news_e.xml', industry: 'Global trade policy', category: 'TRADE' as const, language: 'en' },
  ];
  for (const source of realNewsSources) await prisma.source.upsert({ where: { id: source.id }, update: { ...source, reliability: 'PRIMARY', active: true, collectionEnabled: true, collectionIntervalMinutes: 5 }, create: { ...source, reliability: 'PRIMARY', active: true, collectionEnabled: true, collectionIntervalMinutes: 5 } });
  for (const catalogSource of bskPublicSourceCatalog) {
    const existing = await prisma.source.findFirst({ where: { name: catalogSource.name } });
    const data = {
      ...catalogSource,
      sourceType: catalogSource.sourceType ?? ('WEB' as const),
      feedUrl: catalogSource.feedUrl ?? null,
      active: true,
      collectionEnabled: catalogSource.collectionEnabled ?? false,
      collectionIntervalMinutes: catalogSource.collectionEnabled ? 5 : 15,
    };
    if (existing) await prisma.source.update({ where: { id: existing.id }, data });
    else await prisma.source.create({ data });
  }
  const bskSourceUniverse = await prisma.source.findMany({
    where: {
      active: true,
      OR: [
        { country: { in: ['Bangladesh', 'China', 'Myanmar'] } },
        { region: { in: ['South Asia', 'Greater China', 'Southeast Asia'] } },
        { country: null, region: null },
      ],
    },
  });
  for (const source of bskSourceUniverse) await prisma.customerSourcePreference.upsert({
    where: { customerId_sourceId: { customerId: bskCustomer.id, sourceId: source.id } },
    update: { recommended: true },
    create: {
      customerId: bskCustomer.id,
      sourceId: source.id,
      enabled: source.collectionEnabled || !['RSS', 'ATOM'].includes(source.sourceType),
      recommended: true,
      reason: source.country
        ? `Covers verified BSK operations in ${source.country}.`
        : 'Global fallback for trade, logistics, labour, material, regulatory, or physical-disruption context.',
    },
  });
  for (const customerId of [customer.id, bskCustomer.id]) await prisma.dailyBriefPreference.upsert({ where: { userId_customerId: { userId: 'f30a7d12-ecf6-4f9d-a73d-c2fd12f06e3f', customerId } }, update: {}, create: { userId: 'f30a7d12-ecf6-4f9d-a73d-c2fd12f06e3f', customerId, enabled: false, deliveryTime: '08:00', timezone: 'Europe/Amsterdam', email: 'customer@demo.suppliesignal.local', language: 'en' } });
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });

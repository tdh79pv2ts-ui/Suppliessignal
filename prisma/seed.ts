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
    [
      '11111111-1111-4111-8111-111111111111',
      'Bengal Apparel Partners',
      'Bangladesh',
      'Gazipur',
      'TIER_1',
    ],
    [
      '22222222-2222-4222-8222-222222222222',
      'Irrawaddy Garment Partners',
      'Myanmar',
      'Yangon',
      'TIER_1',
    ],
    [
      '33333333-3333-4333-8333-333333333333',
      'Pearl River Accessories',
      'China',
      'Guangzhou',
      'TIER_2',
    ],
  ] as const;
  for (const [id, name, country, city, tier] of supplierRows)
    await prisma.supplier.upsert({
      where: { id },
      update: {},
      create: {
        id,
        customerId: customer.id,
        name,
        country,
        city,
        tier,
        criticality: 'HIGH',
        supplierType: 'FICTIONAL_DEMO',
      },
    });

  const factoryRows = [
    [
      '41111111-1111-4111-8111-111111111111',
      supplierRows[0][0],
      'Gazipur Apparel Works',
      'Bangladesh',
      'Gazipur',
      'Apparel assembly',
    ],
    [
      '42222222-2222-4222-8222-222222222222',
      supplierRows[1][0],
      'Yangon Garment Works',
      'Myanmar',
      'Yangon',
      'Cut and sew',
    ],
    [
      '43333333-3333-4333-8333-333333333333',
      supplierRows[2][0],
      'Guangzhou Bag Works',
      'China',
      'Guangzhou',
      'Bag assembly',
    ],
  ] as const;
  for (const [
    id,
    supplierId,
    name,
    country,
    city,
    productionType,
  ] of factoryRows)
    await prisma.factory.upsert({
      where: { id },
      update: {},
      create: {
        id,
        customerId: customer.id,
        supplierId,
        name,
        country,
        city,
        productionType,
        criticality: 'HIGH',
      },
    });

  const productRows = [
    ['51111111-1111-4111-8111-111111111111', 'Cotton T-Shirt', 'APP-TSHIRT'],
    ['52222222-2222-4222-8222-222222222222', 'Casual Shirt', 'APP-SHIRT'],
    [
      '53333333-3333-4333-8333-333333333333',
      'Lightweight Jacket',
      'APP-JACKET',
    ],
    ['54444444-4444-4444-8444-444444444444', 'Casual Apparel', 'APP-CASUAL'],
    ['55555555-5555-4555-8555-555555555555', 'Leather Handbag', 'ACC-HANDBAG'],
    ['56666666-6666-4666-8666-666666666666', 'Travel Bag', 'ACC-TRAVEL'],
  ] as const;
  for (const [id, name, sku] of productRows)
    await prisma.product.upsert({
      where: { id },
      update: {},
      create: {
        id,
        customerId: customer.id,
        name,
        sku,
        category: sku.startsWith('APP') ? 'Apparel' : 'Accessories',
        criticality: 'HIGH',
      },
    });

  const materialNames = [
    'Cotton',
    'Polyester',
    'Leather',
    'Nylon',
    'Zippers',
    'Metal Hardware',
    'Packaging',
  ];
  const materialIds = materialNames.map(
    (_, index) => `6${index + 1}111111-1111-4111-8111-111111111111`,
  );
  for (const [index, name] of materialNames.entries())
    await prisma.material.upsert({
      where: { id: materialIds[index]! },
      update: {},
      create: {
        id: materialIds[index]!,
        customerId: customer.id,
        name,
        category: index < 4 ? 'Textile and primary material' : 'Component',
        commodity: name,
        criticality: index === 6 ? 'MEDIUM' : 'HIGH',
        substitutable: name === 'Packaging',
      },
    });

  const ports = [
    [
      '71111111-1111-4111-8111-111111111111',
      'Port of Chattogram',
      'Bangladesh',
      'Chattogram',
      'BDCGP',
      22.3133,
      91.8008,
    ],
    [
      '72222222-2222-4222-8222-222222222222',
      'Port of Yangon',
      'Myanmar',
      'Yangon',
      'MMRGN',
      16.7667,
      96.1667,
    ],
    [
      '73333333-3333-4333-8333-333333333333',
      'Port of Guangzhou',
      'China',
      'Guangzhou',
      'CNCAN',
      23.0833,
      113.5167,
    ],
  ] as const;
  for (const [id, name, country, city, portCode, latitude, longitude] of ports)
    await prisma.port.upsert({
      where: { id },
      update: {},
      create: { id, name, country, city, portCode, latitude, longitude },
    });

  const routeRows = [
    [
      '81111111-1111-4111-8111-111111111111',
      'Bangladesh export route',
      'Gazipur',
      'European distribution hub',
      'MULTIMODAL',
    ],
    [
      '82222222-2222-4222-8222-222222222222',
      'Myanmar export route',
      'Yangon production cluster',
      'European distribution hub',
      'SEA',
    ],
    [
      '83333333-3333-4333-8333-333333333333',
      'Guangzhou accessories route',
      'Guangzhou',
      'European distribution hub',
      'SEA',
    ],
  ] as const;
  for (const [
    id,
    name,
    originLabel,
    destinationLabel,
    transportMode,
  ] of routeRows)
    await prisma.route.upsert({
      where: { id },
      update: {},
      create: {
        id,
        customerId: customer.id,
        name,
        originLabel,
        destinationLabel,
        transportMode,
        criticality: 'HIGH',
      },
    });

  const supplierProducts = [
    [supplierRows[0][0], productRows[0][0]],
    [supplierRows[0][0], productRows[1][0]],
    [supplierRows[1][0], productRows[2][0]],
    [supplierRows[1][0], productRows[3][0]],
    [supplierRows[2][0], productRows[4][0]],
    [supplierRows[2][0], productRows[5][0]],
  ] as const;
  for (const [supplierId, productId] of supplierProducts)
    await prisma.supplierProduct.upsert({
      where: { supplierId_productId: { supplierId, productId } },
      update: {},
      create: { customerId: customer.id, supplierId, productId },
    });
  for (let index = 0; index < factoryRows.length; index++)
    for (const productIndex of [index * 2, index * 2 + 1])
      await prisma.factoryProduct.upsert({
        where: {
          factoryId_productId: {
            factoryId: factoryRows[index]![0],
            productId: productRows[productIndex]![0],
          },
        },
        update: {},
        create: {
          customerId: customer.id,
          factoryId: factoryRows[index]![0],
          productId: productRows[productIndex]![0],
        },
      });
  const productMaterials = [
    [0, 0],
    [0, 4],
    [1, 0],
    [1, 4],
    [2, 1],
    [2, 3],
    [3, 1],
    [4, 2],
    [4, 5],
    [5, 3],
    [5, 4],
    [5, 6],
  ] as const;
  for (const [productIndex, materialIndex] of productMaterials)
    await prisma.productMaterial.upsert({
      where: {
        productId_materialId: {
          productId: productRows[productIndex]![0],
          materialId: materialIds[materialIndex]!,
        },
      },
      update: {},
      create: {
        customerId: customer.id,
        productId: productRows[productIndex]![0],
        materialId: materialIds[materialIndex]!,
      },
    });
  for (let index = 0; index < routeRows.length; index++) {
    await prisma.routeSupplier.upsert({
      where: {
        routeId_supplierId: {
          routeId: routeRows[index]![0],
          supplierId: supplierRows[index]![0],
        },
      },
      update: {},
      create: {
        customerId: customer.id,
        routeId: routeRows[index]![0],
        supplierId: supplierRows[index]![0],
      },
    });
    await prisma.routeFactory.upsert({
      where: {
        routeId_factoryId: {
          routeId: routeRows[index]![0],
          factoryId: factoryRows[index]![0],
        },
      },
      update: {},
      create: {
        customerId: customer.id,
        routeId: routeRows[index]![0],
        factoryId: factoryRows[index]![0],
      },
    });
    await prisma.routePort.upsert({
      where: {
        routeId_portId: {
          routeId: routeRows[index]![0],
          portId: ports[index]![0],
        },
      },
      update: { sequence: 1 },
      create: {
        customerId: customer.id,
        routeId: routeRows[index]![0],
        portId: ports[index]![0],
        sequence: 1,
      },
    });
  }

  const sources = [
    ['BGMEA', 'https://www.bgmea.com.bd/', 'Bangladesh', 'INDUSTRY', 'MEDIUM'],
    [
      'Myanmar National Trade Portal',
      'https://www.myanmartradeportal.gov.mm/',
      'Myanmar',
      'TRADE',
      'PRIMARY',
    ],
    [
      'Myanmar Customs',
      'https://www.customs.gov.mm/',
      'Myanmar',
      'GOVERNMENT',
      'PRIMARY',
    ],
    [
      'Guangzhou Municipal Government',
      'https://www.gz.gov.cn/',
      'China',
      'GOVERNMENT',
      'PRIMARY',
    ],
    [
      'Guangdong Provincial Government',
      'https://www.gd.gov.cn/',
      'China',
      'GOVERNMENT',
      'PRIMARY',
    ],
    [
      'European Commission Trade',
      'https://policy.trade.ec.europa.eu/',
      null,
      'REGULATOR',
      'PRIMARY',
    ],
    [
      'European Commission Taxation and Customs',
      'https://taxation-customs.ec.europa.eu/',
      null,
      'REGULATOR',
      'PRIMARY',
    ],
    [
      'International Maritime Organization',
      'https://www.imo.org/',
      null,
      'LOGISTICS',
      'PRIMARY',
    ],
    [
      'World Trade Organization',
      'https://www.wto.org/',
      null,
      'TRADE',
      'PRIMARY',
    ],
    ['ASEAN', 'https://www.asean.org/', null, 'TRADE', 'PRIMARY'],
    ['World Bank', 'https://www.worldbank.org/', null, 'TRADE', 'HIGH'],
  ] as const;
  for (const [name, baseUrl, country, category, reliability] of sources) {
    const existing = await prisma.source.findFirst({ where: { name } });
    if (!existing)
      await prisma.source.create({
        data: {
          name,
          sourceType: 'WEB',
          baseUrl,
          country,
          category,
          reliability,
          active: true,
          collectionEnabled: false,
        },
      });
  }

  const radarSourceId = 'a1000000-0000-4000-8000-000000000001';
  await prisma.source.upsert({
    where: { id: radarSourceId },
    update: {},
    create: {
      id: radarSourceId,
      name: 'Fictional Supply Chain News Desk',
      sourceType: 'MANUAL',
      baseUrl: 'https://news-radar-fixture.invalid',
      category: 'NEWS',
      reliability: 'HIGH',
      active: true,
      collectionEnabled: false,
      collectionIntervalMinutes: 15,
    },
  });
  const radarFixtures = [
    {
      articleId: 'a2000000-0000-4000-8000-000000000001',
      exposureId: 'a3000000-0000-4000-8000-000000000001',
      title: 'Fictional fire halts work at Gazipur Apparel Works',
      text: 'A fictional fire caused a production shutdown at Gazipur Apparel Works in Gazipur, Bangladesh.',
      entityType: 'FACTORY' as const,
      topic: 'OPERATIONAL' as const,
      method: 'UNIQUE_EXACT_NAME' as const,
      matchKey: `factory:${factoryRows[0][0]}`,
      confidence: 0.92,
      reason: 'Factory name occurs exactly in disruptive coverage.',
      matchedTerms: ['Gazipur Apparel Works'],
      factoryId: factoryRows[0][0],
      path: [
        { nodeType: 'CUSTOMER', id: customer.id, label: customer.name },
        { nodeType: 'SUPPLIER', id: supplierRows[0][0], label: supplierRows[0][1], relationship: 'explicit supplier' },
        { nodeType: 'FACTORY', id: factoryRows[0][0], label: factoryRows[0][2], relationship: 'explicit factory' },
      ],
    },
    {
      articleId: 'a2000000-0000-4000-8000-000000000002',
      exposureId: 'a3000000-0000-4000-8000-000000000002',
      title: 'Fictional Port of Chattogram closure delays shipping',
      text: 'A fictional port closure at the Port of Chattogram caused shipping delays.',
      entityType: 'PORT' as const,
      topic: 'LOGISTICS' as const,
      method: 'EXACT_PORT_NAME' as const,
      matchKey: `port:${routeRows[0][0]}:${ports[0][0]}`,
      confidence: 0.93,
      reason: 'A named port is explicitly present on this customer route.',
      matchedTerms: ['Port of Chattogram'],
      routePortRouteId: routeRows[0][0],
      portId: ports[0][0],
      path: [
        { nodeType: 'CUSTOMER', id: customer.id, label: customer.name },
        { nodeType: 'ROUTE', id: routeRows[0][0], label: routeRows[0][1], relationship: 'explicit route' },
        { nodeType: 'PORT', id: ports[0][0], label: ports[0][1], relationship: 'route port sequence 1' },
      ],
    },
    {
      articleId: 'a2000000-0000-4000-8000-000000000003',
      exposureId: 'a3000000-0000-4000-8000-000000000003',
      title: 'Fictional export restriction affects Bengal Apparel Partners in Bangladesh',
      text: 'A fictional export restriction affects Bengal Apparel Partners in Bangladesh.',
      entityType: 'SUPPLIER' as const,
      topic: 'TRADE' as const,
      method: 'NAME_AND_LOCATION' as const,
      matchKey: `supplier:${supplierRows[0][0]}`,
      confidence: 0.9,
      reason: 'Supplier name and location occur exactly in disruptive coverage.',
      matchedTerms: ['Bengal Apparel Partners', 'Bangladesh'],
      supplierId: supplierRows[0][0],
      path: [
        { nodeType: 'CUSTOMER', id: customer.id, label: customer.name },
        { nodeType: 'SUPPLIER', id: supplierRows[0][0], label: supplierRows[0][1], relationship: 'explicit supplier' },
      ],
    },
    {
      articleId: 'a2000000-0000-4000-8000-000000000004',
      exposureId: 'a3000000-0000-4000-8000-000000000004',
      title: 'Fictional cotton shortage disrupts apparel production',
      text: 'A fictional cotton shortage disrupts apparel production across the region.',
      entityType: 'MATERIAL' as const,
      topic: 'OPERATIONAL' as const,
      method: 'UNIQUE_EXACT_NAME' as const,
      matchKey: `material:${materialIds[0]}`,
      confidence: 0.84,
      reason: 'Material or commodity name occurs exactly in disruptive coverage.',
      matchedTerms: ['Cotton'],
      materialId: materialIds[0],
      path: [
        { nodeType: 'CUSTOMER', id: customer.id, label: customer.name },
        { nodeType: 'PRODUCT', id: productRows[0][0], label: productRows[0][1], relationship: 'explicit product' },
        { nodeType: 'MATERIAL', id: materialIds[0], label: materialNames[0], relationship: 'explicit product material' },
      ],
    },
  ];
  for (const fixture of radarFixtures) {
    await prisma.sourceArticle.upsert({
      where: { id: fixture.articleId },
      update: {},
      create: {
        id: fixture.articleId,
        sourceId: radarSourceId,
        originalUrl: `https://news-radar-fixture.invalid/articles/${fixture.articleId}`,
        title: fixture.title,
        excerpt: fixture.text,
        normalizedText: fixture.text,
        publishedAt: new Date('2026-08-13T00:00:00Z'),
        contentHash: `news-radar-content-${fixture.articleId}`,
        urlHash: `news-radar-url-${fixture.articleId}`,
        status: 'NORMALIZED',
      },
    });
    await prisma.newsRadarArticleProcessing.upsert({
      where: { sourceArticleId: fixture.articleId },
      update: {},
      create: {
        sourceArticleId: fixture.articleId,
        status: 'COMPLETED',
        ownerToken: 'a4000000-0000-4000-8000-000000000001',
        leaseExpiresAt: new Date('2026-08-13T00:00:00Z'),
        completedAt: new Date('2026-08-13T00:00:00Z'),
        topics: [fixture.topic],
        detectedTerms: fixture.matchedTerms,
        detectedLocations: fixture.matchedTerms.filter((value) => ['Bangladesh', 'Gazipur', 'Port of Chattogram'].includes(value)),
      },
    });
    await prisma.newsRadarExposure.upsert({
      where: { customerId_sourceArticleId_matchKey: { customerId: customer.id, sourceArticleId: fixture.articleId, matchKey: fixture.matchKey } },
      update: {},
      create: {
        id: fixture.exposureId,
        customerId: customer.id,
        sourceArticleId: fixture.articleId,
        matchKey: fixture.matchKey,
        entityType: fixture.entityType,
        topic: fixture.topic,
        matchMethod: fixture.method,
        confidence: fixture.confidence,
        reason: fixture.reason,
        matchedTerms: fixture.matchedTerms,
        pathSnapshot: fixture.path,
        supplierId: 'supplierId' in fixture ? fixture.supplierId : undefined,
        factoryId: 'factoryId' in fixture ? fixture.factoryId : undefined,
        materialId: 'materialId' in fixture ? fixture.materialId : undefined,
        routePortRouteId: 'routePortRouteId' in fixture ? fixture.routePortRouteId : undefined,
        portId: 'portId' in fixture ? fixture.portId : undefined,
      },
    });
  }

  const eventFixtureSourceId = '91000000-0000-4000-8000-000000000001';
  await prisma.source.upsert({
    where: { id: eventFixtureSourceId },
    update: {},
    create: {
      id: eventFixtureSourceId,
      name: 'Fictional Phase 5 Event Bulletin',
      sourceType: 'MANUAL',
      baseUrl: 'https://phase5-fixture.invalid',
      category: 'OTHER',
      reliability: 'HIGH',
      active: true,
      collectionEnabled: false,
    },
  });
  const eventFixtureSourceTwoId = '91000000-0000-4000-8000-000000000002';
  await prisma.source.upsert({
    where: { id: eventFixtureSourceTwoId },
    update: {},
    create: {
      id: eventFixtureSourceTwoId,
      name: 'Fictional Independent Logistics Bulletin',
      sourceType: 'MANUAL',
      baseUrl: 'https://phase5-independent-fixture.invalid',
      category: 'LOGISTICS',
      reliability: 'HIGH',
      active: true,
      collectionEnabled: false,
    },
  });

  const fixtureClaims = [
    {
      articleId: '92000000-0000-4000-8000-000000000001',
      runId: '93000000-0000-4000-8000-000000000001',
      claimId: '94000000-0000-4000-8000-000000000001',
      sourceId: eventFixtureSourceId,
      title: 'Fictional Port Aurora disruption report',
      statement: 'Port Aurora operations were disrupted on 2 March 2026.',
      claimType: 'PORT_DISRUPTION' as const,
      assertionMode: 'OBSERVED' as const,
      entityType: 'PORT' as const,
      entityName: 'Port Aurora',
      date: new Date('2026-03-02T00:00:00Z'),
    },
    {
      articleId: '92000000-0000-4000-8000-000000000002',
      runId: '93000000-0000-4000-8000-000000000002',
      claimId: '94000000-0000-4000-8000-000000000002',
      sourceId: eventFixtureSourceTwoId,
      title: 'Independent fictional Port Aurora update',
      statement: 'A second bulletin confirmed disruption at Port Aurora.',
      claimType: 'PORT_DISRUPTION' as const,
      assertionMode: 'OBSERVED' as const,
      entityType: 'PORT' as const,
      entityName: 'Port Aurora',
      date: new Date('2026-03-02T00:00:00Z'),
    },
    {
      articleId: '92000000-0000-4000-8000-000000000003',
      runId: '93000000-0000-4000-8000-000000000003',
      claimId: '94000000-0000-4000-8000-000000000003',
      sourceId: eventFixtureSourceId,
      title: 'Fictional Port Aurora fire',
      statement: 'A small fire occurred at Port Aurora.',
      claimType: 'FIRE' as const,
      assertionMode: 'OBSERVED' as const,
      entityType: 'PORT' as const,
      entityName: 'Port Aurora',
      date: new Date('2026-03-02T00:00:00Z'),
    },
    {
      articleId: '92000000-0000-4000-8000-000000000004',
      runId: '93000000-0000-4000-8000-000000000004',
      claimId: '94000000-0000-4000-8000-000000000004',
      sourceId: eventFixtureSourceId,
      title: 'Fictional Port Aurora forecast',
      statement: 'Analysts forecast a possible future Port Aurora disruption.',
      claimType: 'PORT_DISRUPTION' as const,
      assertionMode: 'FORECAST' as const,
      entityType: 'PORT' as const,
      entityName: 'Port Aurora',
      date: new Date('2026-04-02T00:00:00Z'),
    },
    {
      articleId: '92000000-0000-4000-8000-000000000005',
      runId: '93000000-0000-4000-8000-000000000005',
      claimId: '94000000-0000-4000-8000-000000000005',
      sourceId: eventFixtureSourceId,
      title: 'Fictional conflicting Port Aurora update',
      statement: 'The announced Port Aurora disruption was cancelled.',
      claimType: 'PORT_DISRUPTION' as const,
      assertionMode: 'OBSERVED' as const,
      entityType: 'PORT' as const,
      entityName: 'Port Aurora',
      date: new Date('2026-03-02T00:00:00Z'),
    },
  ];
  for (const fixture of fixtureClaims) {
    await prisma.sourceArticle.upsert({
      where: { id: fixture.articleId },
      update: {},
      create: {
        id: fixture.articleId,
        sourceId: fixture.sourceId,
        originalUrl: `https://phase5-fixture.invalid/articles/${fixture.articleId}`,
        title: fixture.title,
        normalizedText: fixture.statement,
        publishedAt: fixture.date,
        contentHash: `phase5-content-${fixture.articleId}`,
        urlHash: `phase5-url-${fixture.articleId}`,
        status: 'NORMALIZED',
      },
    });
    await prisma.articleExtractionRun.upsert({
      where: { id: fixture.runId },
      update: {},
      create: {
        id: fixture.runId,
        sourceArticleId: fixture.articleId,
        status: 'COMPLETED',
        provider: 'fixture',
        model: 'deterministic-phase5',
        promptVersion: 'fixture-1',
        schemaVersion: '1.0',
        inputHash: `phase5-input-${fixture.runId}`,
        inputCharacters: fixture.statement.length,
        claimsExtracted: 1,
        articleRelevant: true,
        completedAt: fixture.date,
      },
    });
    await prisma.claim.upsert({
      where: { id: fixture.claimId },
      update: {},
      create: {
        id: fixture.claimId,
        sourceArticleId: fixture.articleId,
        extractionRunId: fixture.runId,
        claimType: fixture.claimType,
        assertionMode: fixture.assertionMode,
        statement: fixture.statement,
        confidence: 0.85,
        occurredAt: fixture.date,
        evidenceText: fixture.statement,
        evidenceStart: 0,
        evidenceEnd: fixture.statement.length,
        entities: {
          create: {
            entityType: fixture.entityType,
            name: fixture.entityName,
            role: 'affected',
          },
        },
        locations: {
          create: {
            name: 'Aurora Harbor',
            city: 'Aurora Harbor',
            country: 'Fictionland',
          },
        },
      },
    });
  }

  const ambiguousEvents = [
    ['95000000-0000-4000-8000-000000000001', '2026-05-01'],
    ['95000000-0000-4000-8000-000000000002', '2026-05-03'],
  ] as const;
  for (const [id, dateText] of ambiguousEvents) {
    const date = new Date(`${dateText}T00:00:00Z`);
    await prisma.event.upsert({
      where: { id },
      update: {},
      create: {
        id,
        eventType: 'STRIKE',
        status: 'DETECTED',
        title: 'Fictional ambiguous Harbor Works strike candidate',
        summary: 'A fictional candidate retained to exercise ambiguity.',
        severity: 'HIGH',
        confidence: 0.7,
        assertionMode: 'OBSERVED',
        occurredAt: date,
        observedAt: date,
        temporalPrecision: 'DAY',
        firstSeenAt: date,
        lastSeenAt: date,
        fingerprint: `STRIKE|OBSERVED|FACTORY:harbor works|fictionland::aurora harbor:aurora harbor|${dateText}`,
        entities: {
          create: {
            entityType: 'FACTORY',
            name: 'Harbor Works',
            normalizedName: 'harbor works',
            normalizedKey: 'FACTORY:harbor works',
            role: 'affected',
          },
        },
        locations: {
          create: {
            locationType: 'CITY',
            name: 'Aurora Harbor',
            city: 'Aurora Harbor',
            country: 'Fictionland',
            normalizedKey: 'fictionland::aurora harbor:aurora harbor',
          },
        },
      },
    });
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

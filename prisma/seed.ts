import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const customer = await prisma.customer.upsert({
    where: { id: '5a6ce6b4-0d65-4d16-90dc-04b751f5169b' },
    update: {
      name: 'European Electronics Manufacturer',
      description: 'Fictional electronics supply-chain POC used for local demonstrations.',
    },
    create: {
      id: '5a6ce6b4-0d65-4d16-90dc-04b751f5169b',
      name: 'European Electronics Manufacturer',
      description: 'Fictional electronics supply-chain POC used for local demonstrations.',
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

  // Public BSK Fashion POC workspace. Only data explicitly published by BSK
  // Fashion is included; no suppliers, routes, ports, or unverified edges are
  // inferred. Sources: bskfashion.com/facilities and bskfashion.com/products.
  const bskCustomer = await prisma.customer.upsert({
    where: { id: 'b5000000-0000-4000-8000-000000000001' },
    update: {
      name: 'BSK Fashion',
      description:
        'Public-data POC for BSK Fashion bag and accessories manufacturing.',
    },
    create: {
      id: 'b5000000-0000-4000-8000-000000000001',
      name: 'BSK Fashion',
      description:
        'Public-data POC for BSK Fashion bag and accessories manufacturing.',
    },
  });
  await prisma.customerMembership.upsert({
    where: {
      userId_customerId: {
        userId: 'f30a7d12-ecf6-4f9d-a73d-c2fd12f06e3f',
        customerId: bskCustomer.id,
      },
    },
    update: {},
    create: {
      userId: 'f30a7d12-ecf6-4f9d-a73d-c2fd12f06e3f',
      customerId: bskCustomer.id,
    },
  });

  const bskFactories = [
    {
      id: 'b5100000-0000-4000-8000-000000000001',
      name: 'Guangzhou Bisakai Leather Co., Ltd',
      country: 'China',
      city: 'Guangzhou',
      address: 'Shiling Town, Huadu District, Guangzhou',
      productionType:
        'Head office, development center and production; established 2012; BSCI and GRS listed',
    },
    {
      id: 'b5100000-0000-4000-8000-000000000002',
      name: 'Welcombine Co., Ltd',
      country: 'Myanmar',
      city: 'Yangon',
      address: 'Yangon, Myanmar',
      productionType:
        'Bag production; established 2017; BSCI listed; handbags and backpacks publicly documented',
    },
    {
      id: 'b5100000-0000-4000-8000-000000000003',
      name: 'YLX Company Limited',
      country: 'Myanmar',
      city: 'Yangon',
      address: 'Yangon, Myanmar',
      productionType: 'Bag production; established 2018',
    },
    {
      id: 'b5100000-0000-4000-8000-000000000004',
      name: 'BSK Bangladesh',
      country: 'Bangladesh',
      city: 'Cumilla',
      address: 'Cumilla EPZ, Bangladesh',
      productionType: 'Bag production; established 2024',
    },
  ];
  for (const factory of bskFactories)
    await prisma.factory.upsert({
      where: { id: factory.id },
      update: {
        customerId: bskCustomer.id,
        name: factory.name,
        country: factory.country,
        city: factory.city,
        address: factory.address,
        productionType: factory.productionType,
        active: true,
      },
      create: {
        ...factory,
        customerId: bskCustomer.id,
        criticality: 'MEDIUM',
      },
    });

  const bskProducts = [
    ['b5200000-0000-4000-8000-000000000001', 'Handbag', 'Bags'],
    ['b5200000-0000-4000-8000-000000000002', 'Backpack', 'Bags'],
    ['b5200000-0000-4000-8000-000000000003', 'Travel Bag', 'Bags'],
    ['b5200000-0000-4000-8000-000000000004', 'Crossbody Bag', 'Bags'],
    ['b5200000-0000-4000-8000-000000000005', 'Cosmetic Bag', 'Accessories'],
    ['b5200000-0000-4000-8000-000000000006', 'Wallet', 'Accessories'],
  ] as const;
  for (const [id, name, category] of bskProducts)
    await prisma.product.upsert({
      where: { id },
      update: { customerId: bskCustomer.id, name, category, active: true },
      create: {
        id,
        customerId: bskCustomer.id,
        name,
        category,
        description: 'Product category listed in the public BSK Fashion catalog.',
        criticality: 'MEDIUM',
      },
    });

  const bskMaterials = [
    ['b5300000-0000-4000-8000-000000000001', 'Faux leather'],
    ['b5300000-0000-4000-8000-000000000002', 'Nylon'],
    ['b5300000-0000-4000-8000-000000000003', 'Polyester'],
    ['b5300000-0000-4000-8000-000000000004', 'PU'],
    ['b5300000-0000-4000-8000-000000000005', 'Semi PU'],
  ] as const;
  for (const [id, name] of bskMaterials)
    await prisma.material.upsert({
      where: { id },
      update: { customerId: bskCustomer.id, name, active: true },
      create: {
        id,
        customerId: bskCustomer.id,
        name,
        category: 'Bag material',
        commodity: name,
        criticality: 'MEDIUM',
        substitutable: false,
      },
    });

  // Welcombine is the only facility for which the public BSK pages explicitly
  // name product types. Do not infer equivalent edges for the other factories.
  for (const productId of [bskProducts[0][0], bskProducts[1][0]])
    await prisma.factoryProduct.upsert({
      where: {
        factoryId_productId: {
          factoryId: bskFactories[1]!.id,
          productId,
        },
      },
      update: { customerId: bskCustomer.id },
      create: {
        customerId: bskCustomer.id,
        factoryId: bskFactories[1]!.id,
        productId,
      },
    });

  const supplierRows = [
    [
      '11111111-1111-4111-8111-111111111111',
      'Delta Circuit Systems',
      'Vietnam',
      'Hanoi',
      'TIER_1',
    ],
    [
      '22222222-2222-4222-8222-222222222222',
      'Formosa Microelectronics',
      'Taiwan',
      'Taichung',
      'TIER_1',
    ],
    [
      '33333333-3333-4333-8333-333333333333',
      'Pearl River Power Components',
      'China',
      'Guangzhou',
      'TIER_2',
    ],
  ] as const;
  for (const [id, name, country, city, tier] of supplierRows)
    await prisma.supplier.upsert({
      where: { id },
      update: { customerId: customer.id, name, country, city, tier, criticality: 'HIGH', supplierType: 'FICTIONAL_DEMO' },
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
      'Hanoi Control Systems Plant',
      'Vietnam',
      'Hanoi',
      'Industrial controls assembly',
    ],
    [
      '42222222-2222-4222-8222-222222222222',
      supplierRows[1][0],
      'Taichung Sensor Works',
      'Taiwan',
      'Taichung',
      'Sensor and semiconductor assembly',
    ],
    [
      '43333333-3333-4333-8333-333333333333',
      supplierRows[2][0],
      'Guangzhou Power Electronics Works',
      'China',
      'Guangzhou',
      'Power electronics assembly',
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
      update: { customerId: customer.id, supplierId, name, country, city, productionType, criticality: 'HIGH', active: true },
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
    ['51111111-1111-4111-8111-111111111111', 'Industrial Control Module', 'ELEC-CONTROL'],
    ['52222222-2222-4222-8222-222222222222', 'Smart Sensor Hub', 'ELEC-SENSOR'],
    [
      '53333333-3333-4333-8333-333333333333',
      'Power Adapter',
      'ELEC-POWER',
    ],
    ['54444444-4444-4444-8444-444444444444', 'Industrial Gateway', 'ELEC-GATEWAY'],
    ['55555555-5555-4555-8555-555555555555', 'Battery Module', 'ELEC-BATTERY'],
    ['56666666-6666-4666-8666-666666666666', 'Connectivity Board', 'ELEC-CONNECT'],
  ] as const;
  for (const [id, name, sku] of productRows)
    await prisma.product.upsert({
      where: { id },
      update: { customerId: customer.id, name, sku, category: 'Electronics', criticality: 'HIGH', active: true },
      create: {
        id,
        customerId: customer.id,
        name,
        sku,
        category: 'Electronics',
        criticality: 'HIGH',
      },
    });

  const materialNames = [
    'Semiconductors',
    'Copper',
    'Lithium',
    'Nickel',
    'Rare Earth Magnets',
    'Electronic Connectors',
    'Packaging',
  ];
  const materialIds = materialNames.map(
    (_, index) => `6${index + 1}111111-1111-4111-8111-111111111111`,
  );
  for (const [index, name] of materialNames.entries())
    await prisma.material.upsert({
      where: { id: materialIds[index]! },
      update: { customerId: customer.id, name, category: index < 4 ? 'Primary material' : 'Component', commodity: name, criticality: index === 6 ? 'MEDIUM' : 'HIGH', active: true },
      create: {
        id: materialIds[index]!,
        customerId: customer.id,
        name,
        category: index < 4 ? 'Primary material' : 'Component',
        commodity: name,
        criticality: index === 6 ? 'MEDIUM' : 'HIGH',
        substitutable: name === 'Packaging',
      },
    });

  const ports = [
    [
      '71111111-1111-4111-8111-111111111111',
      'Port of Hai Phong',
      'Vietnam',
      'Hai Phong',
      'VNHPH',
      20.8449,
      106.6881,
    ],
    [
      '72222222-2222-4222-8222-222222222222',
      'Port of Kaohsiung',
      'Taiwan',
      'Kaohsiung',
      'TWKHH',
      22.6163,
      120.3005,
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
      update: { name, country, city, portCode, latitude, longitude, active: true },
      create: { id, name, country, city, portCode, latitude, longitude },
    });

  const routeRows = [
    [
      '81111111-1111-4111-8111-111111111111',
      'Vietnam electronics route',
      'Hanoi',
      'Rotterdam distribution hub',
      'MULTIMODAL',
    ],
    [
      '82222222-2222-4222-8222-222222222222',
      'Taiwan semiconductor route',
      'Taichung production cluster',
      'Rotterdam distribution hub',
      'SEA',
    ],
    [
      '83333333-3333-4333-8333-333333333333',
      'Guangzhou components route',
      'Guangzhou',
      'Rotterdam distribution hub',
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
      update: { customerId: customer.id, name, originLabel, destinationLabel, transportMode, criticality: 'HIGH', active: true },
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

  // Expand the fictional electronics POC to the requested customer-value
  // scale. Every edge below is explicit synthetic demo master data.
  const fixtureId = (family: string, index: number) =>
    `${family}${String(index).padStart(8 - family.length, '0')}-0000-4000-8000-${String(index).padStart(12, '0')}`;
  const locations = [
    ['Vietnam', 'Hanoi'], ['China', 'Shenzhen'], ['Taiwan', 'Taichung'],
    ['Malaysia', 'Penang'], ['Indonesia', 'Batam'], ['Chile', 'Santiago'],
    ['USA', 'Austin'], ['Germany', 'Dresden'], ['Netherlands', 'Eindhoven'],
  ] as const;
  const extraSupplierNames = [
    'Saigon Embedded Technologies', 'Shenzhen Motion Controls', 'Taipei Precision Circuits',
    'Penang Electronics Assembly', 'Batam Cable Systems', 'Andes Copper Components',
    'Lone Star Industrial Computing', 'Saxony Semiconductor Services', 'Brabant Sensor Technologies',
    'Mekong Battery Systems', 'Dongguan Connector Group', 'Hsinchu Logic Devices',
    'Kuala Lumpur Power Systems', 'Java Industrial Enclosures', 'Atacama Lithium Components',
    'Pacific Network Hardware', 'Rhine Automation Components',
  ];
  const extraSuppliers = extraSupplierNames.map((name, index) => ({
    id: fixtureId('d1', index + 1), name,
    country: locations[index % locations.length]![0], city: locations[index % locations.length]![1],
  }));
  for (const supplier of extraSuppliers) await prisma.supplier.upsert({
    where: { id: supplier.id },
    update: { ...supplier, customerId: customer.id, tier: 'TIER_1', criticality: 'HIGH', supplierType: 'FICTIONAL_DEMO', active: true },
    create: { ...supplier, customerId: customer.id, tier: 'TIER_1', criticality: 'HIGH', supplierType: 'FICTIONAL_DEMO' },
  });
  const allSuppliers = [
    ...supplierRows.map(([id, name, country, city]) => ({ id, name, country, city })),
    ...extraSuppliers,
  ];

  const allProductNames = [
    ...productRows.map(([, name]) => name),
    'Motor Controller', 'Edge Computer', 'Industrial Display', 'Power Supply Unit',
    'Machine Vision Camera', 'Programmable Relay', 'Temperature Sensor', 'Pressure Sensor',
    'Network Switch', 'Servo Drive', 'Charging Controller', 'Energy Meter',
    'IoT Communication Module', 'Safety Controller', 'Operator Panel', 'Data Acquisition Unit',
    'Variable Frequency Drive', 'Remote I/O Module', 'Industrial Router', 'DC Converter',
    'Condition Monitoring Unit', 'Smart Circuit Breaker', 'Robotics Control Board', 'Telemetry Gateway',
  ];
  const allProducts = productRows.map(([id, name]) => ({ id, name }));
  for (let index = productRows.length; index < allProductNames.length; index++) {
    const product = { id: fixtureId('d3', index + 1), name: allProductNames[index]! };
    allProducts.push(product);
    await prisma.product.upsert({
      where: { id: product.id },
      update: { ...product, customerId: customer.id, sku: `EEM-${String(index + 1).padStart(3, '0')}`, category: 'Electronics', criticality: 'HIGH', active: true },
      create: { ...product, customerId: customer.id, sku: `EEM-${String(index + 1).padStart(3, '0')}`, category: 'Electronics', criticality: 'HIGH' },
    });
  }

  const extraMaterialNames = [
    'Aluminium', 'Printed Circuit Boards', 'Silicon Wafers', 'Cobalt', 'Tin', 'Gold',
    'Engineering Plastics', 'Ceramic Capacitors', 'Power MOSFETs', 'Memory Chips',
    'Industrial Adhesives', 'Insulated Wire', 'Thermal Interface Material',
  ];
  const allMaterials = materialNames.map((name, index) => ({ id: materialIds[index]!, name }));
  for (const [index, name] of extraMaterialNames.entries()) {
    const material = { id: fixtureId('d4', index + 1), name };
    allMaterials.push(material);
    await prisma.material.upsert({
      where: { id: material.id },
      update: { ...material, customerId: customer.id, category: 'Electronics material', commodity: name, criticality: 'HIGH', substitutable: false, active: true },
      create: { ...material, customerId: customer.id, category: 'Electronics material', commodity: name, criticality: 'HIGH', substitutable: false },
    });
  }

  const allFactories = factoryRows.map(([id, supplierId, name, country, city]) => ({ id, supplierId, name, country, city }));
  for (let index = factoryRows.length; index < 50; index++) {
    const supplier = allSuppliers[index % allSuppliers.length]!;
    const factory = {
      id: fixtureId('d2', index + 1), supplierId: supplier.id,
      name: `${supplier.city} Electronics Plant ${Math.floor(index / allSuppliers.length) + 1}`,
      country: supplier.country, city: supplier.city,
    };
    allFactories.push(factory);
    await prisma.factory.upsert({
      where: { id: factory.id },
      update: { ...factory, customerId: customer.id, productionType: 'Electronics manufacturing', criticality: 'HIGH', active: true },
      create: { ...factory, customerId: customer.id, productionType: 'Electronics manufacturing', criticality: 'HIGH' },
    });
  }

  const extraPorts = [
    ['Port of Rotterdam', 'Netherlands', 'Rotterdam', 'NLRTM'],
    ['Port Klang', 'Malaysia', 'Klang', 'MYPKG'],
    ['Port of Tanjung Priok', 'Indonesia', 'Jakarta', 'IDTPP'],
    ['Port of San Antonio', 'Chile', 'San Antonio', 'CLSAI'],
    ['Port of Los Angeles', 'USA', 'Los Angeles', 'USLAX'],
    ['Port of Hamburg', 'Germany', 'Hamburg', 'DEHAM'],
    ['Port of Singapore', 'Singapore', 'Singapore', 'SGSIN'],
  ] as const;
  const allPorts = ports.map(([id, name, country, city, portCode]) => ({ id, name, country, city, portCode }));
  for (const [index, [name, country, city, portCode]] of extraPorts.entries()) {
    const port = { id: fixtureId('d5', index + 1), name, country, city, portCode };
    allPorts.push(port);
    await prisma.port.upsert({ where: { id: port.id }, update: { ...port, active: true }, create: port });
  }

  const allRoutes = routeRows.map(([id, name, originLabel, destinationLabel]) => ({ id, name, originLabel, destinationLabel }));
  for (let index = routeRows.length; index < 15; index++) {
    const supplier = allSuppliers[index % allSuppliers.length]!;
    const route = { id: fixtureId('d6', index + 1), name: `${supplier.city} to Rotterdam route`, originLabel: supplier.city, destinationLabel: 'Rotterdam' };
    allRoutes.push(route);
    await prisma.route.upsert({
      where: { id: route.id },
      update: { ...route, customerId: customer.id, transportMode: 'MULTIMODAL', criticality: 'HIGH', active: true },
      create: { ...route, customerId: customer.id, transportMode: 'MULTIMODAL', criticality: 'HIGH' },
    });
  }

  // Complete a navigable Supplier → Factory → Product → Material graph and
  // Route → Port graph without inferred real-world relationships.
  for (const [index, factory] of allFactories.entries()) {
    const product = allProducts[index % allProducts.length]!;
    await prisma.factoryProduct.upsert({ where: { factoryId_productId: { factoryId: factory.id, productId: product.id } }, update: { customerId: customer.id }, create: { customerId: customer.id, factoryId: factory.id, productId: product.id } });
    await prisma.supplierProduct.upsert({ where: { supplierId_productId: { supplierId: factory.supplierId, productId: product.id } }, update: { customerId: customer.id }, create: { customerId: customer.id, supplierId: factory.supplierId, productId: product.id } });
  }
  for (const [index, product] of allProducts.entries()) {
    const material = allMaterials[index % allMaterials.length]!;
    await prisma.productMaterial.upsert({ where: { productId_materialId: { productId: product.id, materialId: material.id } }, update: { customerId: customer.id }, create: { customerId: customer.id, productId: product.id, materialId: material.id } });
  }
  for (const [index, route] of allRoutes.entries()) {
    const supplier = allSuppliers[index % allSuppliers.length]!;
    const factory = allFactories.find((item) => item.supplierId === supplier.id) ?? allFactories[index]!;
    const port = allPorts[index % allPorts.length]!;
    await prisma.routeSupplier.upsert({ where: { routeId_supplierId: { routeId: route.id, supplierId: supplier.id } }, update: { customerId: customer.id }, create: { customerId: customer.id, routeId: route.id, supplierId: supplier.id } });
    await prisma.routeFactory.upsert({ where: { routeId_factoryId: { routeId: route.id, factoryId: factory.id } }, update: { customerId: customer.id }, create: { customerId: customer.id, routeId: route.id, factoryId: factory.id } });
    await prisma.routePort.upsert({ where: { routeId_portId: { routeId: route.id, portId: port.id } }, update: { customerId: customer.id, sequence: 1 }, create: { customerId: customer.id, routeId: route.id, portId: port.id, sequence: 1 } });
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
      title: 'Fictional fire halts work at Hanoi Control Systems Plant',
      text: 'A fictional fire caused a production shutdown at Hanoi Control Systems Plant in Hanoi, Vietnam.',
      entityType: 'FACTORY' as const,
      topic: 'OPERATIONAL' as const,
      method: 'UNIQUE_EXACT_NAME' as const,
      matchKey: `factory:${factoryRows[0][0]}`,
      confidence: 0.92,
      reason: 'Factory name occurs exactly in disruptive coverage.',
      matchedTerms: ['Hanoi Control Systems Plant'],
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
      title: 'Fictional Port of Hai Phong closure delays shipping',
      text: 'A fictional port closure at the Port of Hai Phong caused shipping delays.',
      entityType: 'PORT' as const,
      topic: 'LOGISTICS' as const,
      method: 'EXACT_PORT_NAME' as const,
      matchKey: `port:${routeRows[0][0]}:${ports[0][0]}`,
      confidence: 0.93,
      reason: 'A named port is explicitly present on this customer route.',
      matchedTerms: ['Port of Hai Phong'],
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
      title: 'Fictional export restriction affects Delta Circuit Systems in Vietnam',
      text: 'A fictional export restriction affects Delta Circuit Systems in Vietnam.',
      entityType: 'SUPPLIER' as const,
      topic: 'TRADE' as const,
      method: 'NAME_AND_LOCATION' as const,
      matchKey: `supplier:${supplierRows[0][0]}`,
      confidence: 0.9,
      reason: 'Supplier name and location occur exactly in disruptive coverage.',
      matchedTerms: ['Delta Circuit Systems', 'Vietnam'],
      supplierId: supplierRows[0][0],
      path: [
        { nodeType: 'CUSTOMER', id: customer.id, label: customer.name },
        { nodeType: 'SUPPLIER', id: supplierRows[0][0], label: supplierRows[0][1], relationship: 'explicit supplier' },
      ],
    },
    {
      articleId: 'a2000000-0000-4000-8000-000000000004',
      exposureId: 'a3000000-0000-4000-8000-000000000004',
      title: 'Fictional semiconductor shortage disrupts control module production',
      text: 'A fictional semiconductor shortage disrupts Industrial Control Module production across the region.',
      entityType: 'MATERIAL' as const,
      topic: 'OPERATIONAL' as const,
      method: 'UNIQUE_EXACT_NAME' as const,
      matchKey: `material:${materialIds[0]}`,
      confidence: 0.84,
      reason: 'Material or commodity name occurs exactly in disruptive coverage.',
      matchedTerms: ['Semiconductors'],
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
        detectedLocations: fixture.matchedTerms.filter((value) => ['Vietnam', 'Hanoi', 'Port of Hai Phong'].includes(value)),
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

  for (let index = 5; index <= 100; index++) {
    const articleId = `a2000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
    const exposureId = `a3000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
    const kind = index % 6;
    const supplier = allSuppliers[index % allSuppliers.length]!;
    const factory = allFactories[index % allFactories.length]!;
    const product = allProducts[index % allProducts.length]!;
    const material = allMaterials[index % allMaterials.length]!;
    const route = allRoutes[index % allRoutes.length]!;
    const publishedAt = new Date(Date.UTC(2026, 7, 13, index % 24, index % 60));
    const base = {
      title: '', text: '', entityType: 'SUPPLIER' as 'SUPPLIER' | 'FACTORY' | 'PRODUCT' | 'MATERIAL' | 'ROUTE' | 'PORT',
      topic: 'OPERATIONAL' as 'OPERATIONAL' | 'LOGISTICS' | 'TRADE' | 'ECONOMIC',
      method: 'UNIQUE_EXACT_NAME' as 'UNIQUE_EXACT_NAME' | 'NAME_AND_LOCATION' | 'EXACT_PORT_NAME',
      matchKey: '', confidence: 0.84, reason: '', matchedTerms: [] as string[], path: [] as Array<{ nodeType: string; id: string; label: string; relationship?: string }>,
      supplierId: undefined as string | undefined, factoryId: undefined as string | undefined,
      productId: undefined as string | undefined, materialId: undefined as string | undefined,
      routeId: undefined as string | undefined, routePortRouteId: undefined as string | undefined,
      portId: undefined as string | undefined,
    };
    const customerPath = { nodeType: 'CUSTOMER', id: customer.id, label: customer.name };
    if (kind === 0) Object.assign(base, {
      title: `Fictional export restriction affects ${supplier.name} in ${supplier.country}`,
      text: `A fictional export restriction affects ${supplier.name} operations in ${supplier.city}, ${supplier.country}.`,
      entityType: 'SUPPLIER', topic: 'TRADE', method: 'NAME_AND_LOCATION', matchKey: `supplier:${supplier.id}`, confidence: 0.9,
      reason: 'Supplier name and location occur exactly in disruptive coverage.', matchedTerms: [supplier.name, supplier.country], supplierId: supplier.id,
      path: [customerPath, { nodeType: 'SUPPLIER', id: supplier.id, label: supplier.name, relationship: 'explicit synthetic demo supplier' }],
    });
    if (kind === 1) Object.assign(base, {
      title: `Fictional fire disrupts ${factory.name}`,
      text: `A fictional fire caused a production shutdown at ${factory.name} in ${factory.city}, ${factory.country}.`,
      entityType: 'FACTORY', matchKey: `factory:${factory.id}`, confidence: 0.92,
      reason: 'Factory name occurs exactly in disruptive coverage.', matchedTerms: [factory.name], factoryId: factory.id,
      path: [customerPath, { nodeType: 'SUPPLIER', id: factory.supplierId, label: allSuppliers.find((item) => item.id === factory.supplierId)?.name ?? 'Supplier', relationship: 'explicit synthetic demo supplier' }, { nodeType: 'FACTORY', id: factory.id, label: factory.name, relationship: 'explicit synthetic demo factory' }],
    });
    if (kind === 2) Object.assign(base, {
      title: `Fictional component shortage disrupts ${product.name} production`,
      text: `A fictional component shortage disrupts production of the ${product.name}.`,
      entityType: 'PRODUCT', matchKey: `product:${product.id}`, confidence: 0.82,
      reason: 'Product name occurs exactly in disruptive coverage.', matchedTerms: [product.name], productId: product.id,
      path: [customerPath, { nodeType: 'PRODUCT', id: product.id, label: product.name, relationship: 'explicit synthetic demo product' }],
    });
    if (kind === 3) Object.assign(base, {
      title: `Fictional ${material.name} shortage affects electronics manufacturing`,
      text: `A fictional ${material.name} shortage disrupts electronics production.`,
      entityType: 'MATERIAL', topic: 'ECONOMIC', matchKey: `material:${material.id}`, confidence: 0.84,
      reason: 'Material name occurs exactly in disruptive coverage.', matchedTerms: [material.name], materialId: material.id,
      path: [customerPath, { nodeType: 'PRODUCT', id: product.id, label: product.name, relationship: 'explicit synthetic demo product' }, { nodeType: 'MATERIAL', id: material.id, label: material.name, relationship: 'explicit synthetic demo material' }],
    });
    if (kind === 4) Object.assign(base, {
      title: `Fictional shipping disruption on ${route.name}`,
      text: `A fictional route disruption caused shipping delays on the ${route.name}.`,
      entityType: 'ROUTE', topic: 'LOGISTICS', matchKey: `route:${route.id}`, confidence: 0.9,
      reason: 'Route name occurs exactly in disruptive coverage.', matchedTerms: [route.name], routeId: route.id,
      path: [customerPath, { nodeType: 'ROUTE', id: route.id, label: route.name, relationship: 'explicit synthetic demo route' }],
    });
    if (kind === 5) {
      const routeIndex = index % allRoutes.length;
      const routeForPort = allRoutes[routeIndex]!;
      const routePort = allPorts[routeIndex % allPorts.length]!;
      Object.assign(base, {
        title: `Fictional port closure at ${routePort.name}`,
        text: `A fictional port closure at ${routePort.name} caused shipping delays.`,
        entityType: 'PORT', topic: 'LOGISTICS', method: 'EXACT_PORT_NAME', matchKey: `port:${routeForPort.id}:${routePort.id}`, confidence: 0.93,
        reason: 'A named port is explicitly present on this synthetic customer route.', matchedTerms: [routePort.name], routePortRouteId: routeForPort.id, portId: routePort.id,
        path: [customerPath, { nodeType: 'ROUTE', id: routeForPort.id, label: routeForPort.name, relationship: 'explicit synthetic demo route' }, { nodeType: 'PORT', id: routePort.id, label: routePort.name, relationship: 'explicit route port' }],
      });
    }
    await prisma.sourceArticle.upsert({ where: { id: articleId }, update: { title: base.title, excerpt: base.text, normalizedText: base.text, publishedAt }, create: { id: articleId, sourceId: radarSourceId, originalUrl: `https://news-radar-fixture.invalid/articles/${articleId}`, title: base.title, excerpt: base.text, normalizedText: base.text, publishedAt, contentHash: `news-radar-content-${articleId}`, urlHash: `news-radar-url-${articleId}`, status: 'NORMALIZED' } });
    await prisma.newsRadarArticleProcessing.upsert({ where: { sourceArticleId: articleId }, update: { status: 'COMPLETED', topics: [base.topic], detectedTerms: base.matchedTerms, completedAt: publishedAt }, create: { sourceArticleId: articleId, status: 'COMPLETED', ownerToken: 'a4000000-0000-4000-8000-000000000001', leaseExpiresAt: publishedAt, completedAt: publishedAt, topics: [base.topic], detectedTerms: base.matchedTerms, detectedLocations: base.entityType === 'PORT' ? base.matchedTerms : [] } });
    await prisma.newsRadarExposure.upsert({ where: { customerId_sourceArticleId_matchKey: { customerId: customer.id, sourceArticleId: articleId, matchKey: base.matchKey } }, update: { topic: base.topic, reason: base.reason, pathSnapshot: base.path }, create: { id: exposureId, customerId: customer.id, sourceArticleId: articleId, matchKey: base.matchKey, entityType: base.entityType, topic: base.topic, matchMethod: base.method, confidence: base.confidence, reason: base.reason, matchedTerms: base.matchedTerms, pathSnapshot: base.path, supplierId: base.supplierId, factoryId: base.factoryId, productId: base.productId, materialId: base.materialId, routeId: base.routeId, routePortRouteId: base.routePortRouteId, portId: base.portId } });
  }

  await prisma.newsletterPreference.upsert({
    where: { userId_customerId: { userId: 'f30a7d12-ecf6-4f9d-a73d-c2fd12f06e3f', customerId: customer.id } },
    update: {},
    create: { userId: 'f30a7d12-ecf6-4f9d-a73d-c2fd12f06e3f', customerId: customer.id, enabled: false, deliveryTime: '08:00', timezone: 'Europe/Amsterdam', email: 'customer@demo.suppliesignal.local' },
  });
  const demoBrief = await prisma.dailyBrief.upsert({
    where: { customerId_briefDate: { customerId: customer.id, briefDate: new Date('2026-08-14T00:00:00Z') } },
    update: { graphRevision: 0, supplyChainSnapshot: { suppliers: 20, factories: 50, products: 30, materials: 20, routes: 15, ports: 10 } },
    create: { customerId: customer.id, briefDate: new Date('2026-08-14T00:00:00Z'), graphRevision: 0, supplyChainSnapshot: { suppliers: 20, factories: 50, products: 30, materials: 20, routes: 15, ports: 10 } },
  });
  await prisma.dailyBriefItem.deleteMany({ where: { briefId: demoBrief.id } });
  await prisma.dailyBriefItem.createMany({ data: Array.from({ length: 20 }, (_, offset) => ({ customerId: customer.id, briefId: demoBrief.id, exposureId: `a3000000-0000-4000-8000-${String(100 - offset).padStart(12, '0')}`, section: offset < 5 ? 'TOP_DEVELOPMENTS' : offset < 15 ? 'POTENTIAL_EXPOSURES' : 'WATCHLIST', position: offset + 1 })) });

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

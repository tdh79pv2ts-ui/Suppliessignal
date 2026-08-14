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

  const realNewsSources = [
    {
      id: 'a1000000-0000-4000-8000-000000000001',
      name: 'USGS Significant Earthquakes',
      sourceType: 'ATOM' as const,
      baseUrl: 'https://earthquake.usgs.gov/',
      feedUrl:
        'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.atom',
      category: 'WEATHER' as const,
    },
    {
      id: 'a1000000-0000-4000-8000-000000000002',
      name: 'World Trade Organization News',
      sourceType: 'RSS' as const,
      baseUrl: 'https://www.wto.org/',
      feedUrl: 'https://www.wto.org/library/rss/latest_news_e.xml',
      category: 'TRADE' as const,
    },
  ];
  for (const source of realNewsSources) {
    await prisma.source.upsert({
      where: { id: source.id },
      update: {
        name: source.name,
        sourceType: source.sourceType,
        baseUrl: source.baseUrl,
        feedUrl: source.feedUrl,
        category: source.category,
        reliability: 'PRIMARY',
        active: true,
        collectionEnabled: true,
        collectionIntervalMinutes: 15,
      },
      create: {
        ...source,
        reliability: 'PRIMARY',
        active: true,
        collectionEnabled: true,
        collectionIntervalMinutes: 15,
      },
    });
  }

  await prisma.newsletterPreference.upsert({
    where: { userId_customerId: { userId: 'f30a7d12-ecf6-4f9d-a73d-c2fd12f06e3f', customerId: customer.id } },
    update: {},
    create: { userId: 'f30a7d12-ecf6-4f9d-a73d-c2fd12f06e3f', customerId: customer.id, enabled: false, deliveryTime: '08:00', timezone: 'Europe/Amsterdam', email: 'customer@demo.suppliesignal.local' },
  });
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

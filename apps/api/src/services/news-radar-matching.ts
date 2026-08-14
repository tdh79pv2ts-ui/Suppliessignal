import type {
  NewsRadarEntityType,
  NewsRadarMatchMethod,
  NewsRadarTopic,
} from '@suppliesignal/db';

type Node = { id: string; name: string; country?: string | null; city?: string | null };
type SupplierNode = Node & { legalName?: string | null };
type FactoryNode = Node & { supplier?: SupplierNode | null };
type ProductNode = Node & { category?: string | null };
type MaterialNode = Node & {
  commodity?: string | null;
  productMaterials?: Array<{ product: ProductNode }>;
};
type PortNode = Node & { portCode?: string | null };
type RouteNode = Node & {
  originLabel: string;
  destinationLabel: string;
  routePorts?: Array<{ port: PortNode; sequence: number }>;
};

export type NewsRadarGraph = {
  customer: { id: string; name: string };
  suppliers: SupplierNode[];
  factories: FactoryNode[];
  products: ProductNode[];
  materials: MaterialNode[];
  routes: RouteNode[];
};

export type NewsRadarMatch = {
  matchKey: string;
  entityType: NewsRadarEntityType;
  topic: NewsRadarTopic;
  matchMethod: NewsRadarMatchMethod;
  confidence: number;
  reason: string;
  matchedTerms: string[];
  pathSnapshot: Array<{
    nodeType: 'CUSTOMER' | NewsRadarEntityType;
    id: string;
    label: string;
    relationship?: string;
  }>;
  supplierId?: string;
  factoryId?: string;
  productId?: string;
  materialId?: string;
  routeId?: string;
  routePortRouteId?: string;
  portId?: string;
};

const topicTerms: Record<NewsRadarTopic, string[]> = {
  GEOPOLITICAL: ['war', 'conflict', 'political instability', 'border restriction', 'civil unrest', 'election'],
  ECONOMIC: ['currency', 'inflation', 'interest rate', 'commodity price', 'energy price', 'labor cost', 'labour cost', 'downturn', 'shortage'],
  OPERATIONAL: ['fire', 'explosion', 'shutdown', 'production halt', 'bankruptcy', 'cyber incident', 'strike', 'labor dispute', 'labour dispute'],
  LOGISTICS: ['port closure', 'shipping delay', 'shipping disruption', 'freight disruption', 'route disruption', 'port congestion', 'border closure'],
  ENVIRONMENTAL: ['flood', 'flooding', 'earthquake', 'storm', 'cyclone', 'typhoon', 'wildfire', 'drought'],
  TRADE: ['sanction', 'tariff', 'trade restriction', 'export control', 'export restriction', 'import restriction', 'customs restriction'],
  TECHNOLOGY: ['semiconductor restriction', 'technology export control', 'cyber incident', 'cyberattack', 'cyber attack'],
};

const disruptionTerms = [
  'disrupt', 'disruption', 'closed', 'closure', 'delay', 'shortage', 'restricted',
  'restriction', 'halt', 'shutdown', 'strike', 'fire', 'flood', 'flooding',
  'earthquake', 'storm', 'cyclone', 'typhoon', 'bankruptcy', 'sanction', 'tariff',
  'export control', 'cyber incident', 'congestion', 'explosion',
  'cyberattack', 'cyber attack',
];

export function normalizeRadarText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function containsPhrase(text: string, value?: string | null): boolean {
  if (!value) return false;
  const phrase = normalizeRadarText(value);
  return phrase.length >= 3 && ` ${text} `.includes(` ${phrase} `);
}

function firstTopic(topics: NewsRadarTopic[]): NewsRadarTopic {
  return topics[0] ?? 'OPERATIONAL';
}

export function detectNewsRadarTopics(text: string): NewsRadarTopic[] {
  const normalized = normalizeRadarText(text);
  return (Object.entries(topicTerms) as Array<[NewsRadarTopic, string[]]>)
    .filter(([, terms]) => terms.some((term) => containsPhrase(normalized, term)))
    .map(([topic]) => topic);
}

function customerStep(graph: NewsRadarGraph) {
  return { nodeType: 'CUSTOMER' as const, id: graph.customer.id, label: graph.customer.name };
}

function pushUnique(matches: NewsRadarMatch[], match: NewsRadarMatch) {
  if (!matches.some((value) => value.matchKey === match.matchKey)) matches.push(match);
}

export function matchArticleToSupplyChain(
  article: { title: string; excerpt?: string | null; normalizedText?: string | null },
  graph: NewsRadarGraph,
): { topics: NewsRadarTopic[]; matches: NewsRadarMatch[]; detectedTerms: string[]; detectedLocations: string[] } {
  const text = normalizeRadarText([article.title, article.excerpt, article.normalizedText].filter(Boolean).join(' '));
  const topics = detectNewsRadarTopics(text);
  const magnitudeSignal = /\bm [4-9](?: \d+)?\b/.test(text);
  const hasDisruption = magnitudeSignal || disruptionTerms.some((term) => containsPhrase(text, term));
  if (magnitudeSignal && !topics.includes('ENVIRONMENTAL')) topics.push('ENVIRONMENTAL');
  const matches: NewsRadarMatch[] = [];
  const detectedTerms = new Set<string>();
  const detectedLocations = new Set<string>();
  if (!hasDisruption || topics.length === 0) return { topics, matches, detectedTerms: [], detectedLocations: [] };
  const topic = firstTopic(topics);

  const supplierNameCounts = new Map<string, number>();
  for (const supplier of graph.suppliers) {
    const key = normalizeRadarText(supplier.name);
    supplierNameCounts.set(key, (supplierNameCounts.get(key) ?? 0) + 1);
  }
  for (const supplier of graph.suppliers) {
    const legal = containsPhrase(text, supplier.legalName);
    const named = containsPhrase(text, supplier.name);
    if (!legal && !named) continue;
    const location = containsPhrase(text, supplier.city) || containsPhrase(text, supplier.country);
    const uniqueName = supplierNameCounts.get(normalizeRadarText(supplier.name)) === 1;
    if (!legal && !location && !uniqueName) continue;
    const method: NewsRadarMatchMethod = legal ? 'EXACT_LEGAL_NAME' : location ? 'NAME_AND_LOCATION' : 'UNIQUE_EXACT_NAME';
    const terms = [legal ? supplier.legalName! : supplier.name, ...(location ? [supplier.city ?? supplier.country ?? ''] : [])].filter(Boolean);
    terms.forEach((term) => detectedTerms.add(term));
    if (location) detectedLocations.add(supplier.city ?? supplier.country ?? '');
    pushUnique(matches, {
      matchKey: `supplier:${supplier.id}`,
      entityType: 'SUPPLIER', topic, matchMethod: method,
      confidence: legal ? 0.97 : location ? 0.9 : 0.84,
      reason: `${method === 'NAME_AND_LOCATION' ? 'Supplier name and location' : 'Supplier identity'} occur exactly in disruptive coverage.`,
      matchedTerms: terms,
      pathSnapshot: [customerStep(graph), { nodeType: 'SUPPLIER', id: supplier.id, label: supplier.name, relationship: 'explicit supplier' }],
      supplierId: supplier.id,
    });
  }

  const factoryNameCounts = new Map<string, number>();
  for (const factory of graph.factories) factoryNameCounts.set(normalizeRadarText(factory.name), (factoryNameCounts.get(normalizeRadarText(factory.name)) ?? 0) + 1);
  for (const factory of graph.factories) {
    const named = containsPhrase(text, factory.name) && factoryNameCounts.get(normalizeRadarText(factory.name)) === 1;
    const cityCountry = containsPhrase(text, factory.city) && containsPhrase(text, factory.country);
    const countryOnly = !cityCountry && containsPhrase(text, factory.country);
    if (!named && !cityCountry && !countryOnly) continue;
    const method: NewsRadarMatchMethod = named ? 'UNIQUE_EXACT_NAME' : cityCountry ? 'EXACT_CITY_COUNTRY' : 'EXACT_COUNTRY';
    const terms = named ? [factory.name] : [factory.city, factory.country].filter(Boolean) as string[];
    terms.forEach((term) => { detectedTerms.add(term); detectedLocations.add(term); });
    const path: NewsRadarMatch['pathSnapshot'] = [customerStep(graph)];
    if (factory.supplier) path.push({ nodeType: 'SUPPLIER' as const, id: factory.supplier.id, label: factory.supplier.name, relationship: 'explicit supplier' });
    path.push({ nodeType: 'FACTORY', id: factory.id, label: factory.name, relationship: 'explicit factory' });
    pushUnique(matches, {
      matchKey: `factory:${factory.id}`,
      entityType: 'FACTORY', topic, matchMethod: method,
      confidence: named ? 0.92 : cityCountry ? 0.78 : 0.64,
      reason: named ? 'Factory name occurs exactly in disruptive coverage.' : `Disruptive factory coverage names ${cityCountry ? 'the exact city and country' : 'the factory country'}.`,
      matchedTerms: terms, pathSnapshot: path, factoryId: factory.id,
    });
  }

  for (const product of graph.products) {
    if (!containsPhrase(text, product.name)) continue;
    detectedTerms.add(product.name);
    pushUnique(matches, {
      matchKey: `product:${product.id}`, entityType: 'PRODUCT', topic,
      matchMethod: 'UNIQUE_EXACT_NAME', confidence: 0.82,
      reason: 'Product name occurs exactly in disruptive coverage.', matchedTerms: [product.name],
      pathSnapshot: [customerStep(graph), { nodeType: 'PRODUCT', id: product.id, label: product.name, relationship: 'explicit product' }],
      productId: product.id,
    });
  }

  for (const material of graph.materials) {
    const term = [material.name, material.commodity].find((value) => containsPhrase(text, value));
    if (!term) continue;
    detectedTerms.add(term);
    const linked = [...(material.productMaterials ?? [])].sort((a, b) => a.product.name.localeCompare(b.product.name))[0]?.product;
    const path: NewsRadarMatch['pathSnapshot'] = [customerStep(graph)];
    if (linked) path.push({ nodeType: 'PRODUCT' as const, id: linked.id, label: linked.name, relationship: 'explicit product' });
    path.push({ nodeType: 'MATERIAL', id: material.id, label: material.name, relationship: linked ? 'explicit product material' : 'explicit material' });
    pushUnique(matches, {
      matchKey: `material:${material.id}`, entityType: 'MATERIAL', topic,
      matchMethod: 'UNIQUE_EXACT_NAME', confidence: 0.84,
      reason: 'Material or commodity name occurs exactly in disruptive coverage.', matchedTerms: [term],
      pathSnapshot: path, materialId: material.id,
    });
  }

  for (const route of graph.routes) {
    const named = containsPhrase(text, route.name);
    const endpoints = containsPhrase(text, route.originLabel) && containsPhrase(text, route.destinationLabel);
    if (named || endpoints) {
      const terms = named ? [route.name] : [route.originLabel, route.destinationLabel];
      terms.forEach((term) => detectedTerms.add(term));
      pushUnique(matches, {
        matchKey: `route:${route.id}`, entityType: 'ROUTE', topic,
        matchMethod: named ? 'UNIQUE_EXACT_NAME' : 'ROUTE_ENDPOINTS', confidence: named ? 0.9 : 0.86,
        reason: named ? 'Route name occurs exactly in disruptive coverage.' : 'Both explicit route endpoints occur in disruptive coverage.',
        matchedTerms: terms,
        pathSnapshot: [customerStep(graph), { nodeType: 'ROUTE', id: route.id, label: route.name, relationship: 'explicit route' }],
        routeId: route.id,
      });
    }
    for (const routePort of route.routePorts ?? []) {
      const code = containsPhrase(text, routePort.port.portCode);
      const name = containsPhrase(text, routePort.port.name);
      if (!code && !name) continue;
      const term = code ? routePort.port.portCode! : routePort.port.name;
      detectedTerms.add(term); detectedLocations.add(routePort.port.city ?? routePort.port.country ?? routePort.port.name);
      pushUnique(matches, {
        matchKey: `port:${route.id}:${routePort.port.id}`, entityType: 'PORT', topic,
        matchMethod: code ? 'EXACT_PORT_CODE' : 'EXACT_PORT_NAME', confidence: code ? 0.97 : 0.93,
        reason: 'A named port is explicitly present on this customer route.', matchedTerms: [term],
        pathSnapshot: [customerStep(graph), { nodeType: 'ROUTE', id: route.id, label: route.name, relationship: 'explicit route' }, { nodeType: 'PORT', id: routePort.port.id, label: routePort.port.name, relationship: `route port sequence ${routePort.sequence}` }],
        routePortRouteId: route.id, portId: routePort.port.id,
      });
    }
  }

  return { topics, matches, detectedTerms: [...detectedTerms].filter(Boolean).sort(), detectedLocations: [...detectedLocations].filter(Boolean).sort() };
}

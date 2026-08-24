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
  monitoringTags?: Array<{ label: string; type: 'AUTO' | 'SUGGESTED' | 'CUSTOM' }>;
};

export type NewsRadarMatch = {
  matchKey: string;
  entityType: NewsRadarEntityType;
  topic: NewsRadarTopic;
  matchMethod: NewsRadarMatchMethod;
  confidence: number;
  relevanceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
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
  GEOPOLITICAL: ['war', 'conflict', 'political instability', 'border restriction', 'civil unrest', 'oorlog', 'conflit', 'guerra', '战争', '戦争', '전쟁', 'chiến tranh'],
  ECONOMIC: ['currency', 'inflation', 'interest rate', 'commodity price', 'energy price', 'labor cost', 'labour cost', 'downturn', 'shortage', 'inflatie', 'inflation', 'pénurie', 'escasez', '短缺', '不足', '부족', 'thiếu hụt'],
  OPERATIONAL: ['fire', 'explosion', 'shutdown', 'production halt', 'bankruptcy', 'cyber incident', 'strike', 'labor dispute', 'labour dispute', 'brand', 'staking', 'streik', 'incendie', 'grève', 'incendio', 'huelga', '火灾', '罢工', '火災', 'ストライキ', '화재', '파업', 'hỏa hoạn', 'đình công'],
  LOGISTICS: ['port closure', 'shipping delay', 'shipping disruption', 'freight disruption', 'route disruption', 'port congestion', 'border closure', 'havensluiting', 'lieferverzögerung', 'fermeture du port', 'cierre del puerto', '港口关闭', '港湾閉鎖', '항만 폐쇄', 'đóng cửa cảng'],
  ENVIRONMENTAL: ['flood', 'flooding', 'earthquake', 'storm', 'cyclone', 'typhoon', 'wildfire', 'drought', 'overstroming', 'aardbeving', 'überschwemmung', 'erdbeben', 'inondation', 'séisme', 'inundación', 'terremoto', '洪水', '地震', '洪水', '지진', 'lũ lụt', 'động đất'],
  TRADE: ['sanction', 'tariff', 'trade restriction', 'export control', 'export restriction', 'import restriction', 'customs restriction', 'sanctie', 'exportbeperking', 'sanktion', 'exportkontrolle', 'sanction commerciale', 'contrôle des exportations', 'sanción', 'control de exportaciones', '制裁', '出口管制', '制裁', '輸出規制', '제재', '수출 통제', 'trừng phạt', 'kiểm soát xuất khẩu'],
  TECHNOLOGY: ['semiconductor restriction', 'technology export control', 'cyber incident', 'cyberattack', 'cyber attack', 'halfgeleider', 'halbleiter', 'semi-conducteur', 'semiconductor', '半导体', '半導体', '반도체', 'chất bán dẫn'],
};

const disruptionTerms = [
  'disrupt', 'disruption', 'closed', 'closure', 'delay', 'shortage', 'restricted',
  'restriction', 'halt', 'shutdown', 'strike', 'fire', 'flood', 'flooding',
  'earthquake', 'storm', 'cyclone', 'typhoon', 'bankruptcy', 'sanction', 'tariff',
  'export control', 'cyber incident', 'congestion', 'explosion',
  'cyberattack', 'cyber attack',
  'overstroming', 'aardbeving', 'staking', 'streik', 'überschwemmung', 'erdbeben',
  'grève', 'inondation', 'séisme', 'huelga', 'inundación', 'terremoto',
  '火灾', '罢工', '港口关闭', '洪水', '地震', '制裁', '出口管制',
  '火災', 'ストライキ', '港湾閉鎖', '制裁', '輸出規制',
  '화재', '파업', '항만 폐쇄', '지진', '제재', '수출 통제',
  'hỏa hoạn', 'đình công', 'đóng cửa cảng', 'lũ lụt', 'động đất', 'trừng phạt',
];

const countryAliases: Record<string, string[]> = {
  china: ['china', '中国', '中国', '중국', 'trung quốc'],
  myanmar: ['myanmar', 'burma', 'မြန်မာ'],
  bangladesh: ['bangladesh', 'বাংলাদেশ'],
};

export function normalizeRadarText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function matchingLocationTerm(text: string, value?: string | null): string | null {
  if (!value) return null;
  const aliases = countryAliases[normalizeRadarText(value)] ?? [value];
  return aliases.find((alias) => containsPhrase(text, alias)) ?? null;
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

const broaderPathwayTerms: Record<NewsRadarTopic, string[]> = {
  GEOPOLITICAL: ['trade', 'border', 'sanction', 'shipping', 'port', 'supply chain', 'energy', 'commodity', 'export', 'import', 'factory', 'manufacturing', 'infrastructure'],
  ECONOMIC: ['trade', 'freight', 'shipping', 'supply chain', 'energy', 'commodity', 'raw material', 'export', 'import', 'factory', 'manufacturing'],
  OPERATIONAL: ['factory', 'production', 'manufacturing', 'supplier', 'supply chain', 'warehouse', 'port', 'logistics', 'infrastructure'],
  LOGISTICS: ['port', 'shipping', 'freight', 'route', 'border', 'warehouse', 'logistics', 'supply chain'],
  ENVIRONMENTAL: ['factory', 'production', 'manufacturing', 'supplier', 'port', 'shipping', 'route', 'road', 'rail', 'infrastructure', 'supply chain'],
  TRADE: ['sanction', 'tariff', 'trade restriction', 'export control', 'export restriction', 'import restriction', 'customs restriction'],
  TECHNOLOGY: ['semiconductor', 'export control', 'infrastructure', 'port', 'shipping', 'logistics', 'manufacturing', 'supply chain'],
};

export function isBroaderSupplyChainDevelopment(
  article: { title: string; excerpt?: string | null; normalizedText?: string | null; translatedTitle?: string | null; translatedSummary?: string | null },
  topics = detectNewsRadarTopics([article.title, article.excerpt, article.normalizedText, article.translatedTitle, article.translatedSummary].filter(Boolean).join(' ')),
): boolean {
  const text = normalizeRadarText([article.title, article.excerpt, article.normalizedText, article.translatedTitle, article.translatedSummary].filter(Boolean).join(' '));
  if (topics.length === 0) return false;
  const environmentalMagnitude = /\bm [5-9](?: \d+)?\b/.test(text) ||
    ['major', 'severe', 'catastrophic'].some((term) => containsPhrase(text, term));
  return topics.some((topic) =>
    (topic === 'ENVIRONMENTAL' && environmentalMagnitude) ||
    broaderPathwayTerms[topic].some((term) => containsPhrase(text, term)),
  );
}

function customerStep(graph: NewsRadarGraph) {
  return { nodeType: 'CUSTOMER' as const, id: graph.customer.id, label: graph.customer.name };
}

function pushUnique(matches: NewsRadarMatch[], match: NewsRadarMatch) {
  if (!matches.some((value) => value.matchKey === match.matchKey)) matches.push(match);
}

export function matchArticleToSupplyChain(
  article: { title: string; excerpt?: string | null; normalizedText?: string | null; translatedTitle?: string | null; translatedSummary?: string | null },
  graph: NewsRadarGraph,
): { topics: NewsRadarTopic[]; matches: NewsRadarMatch[]; detectedTerms: string[]; detectedLocations: string[] } {
  const text = normalizeRadarText([article.title, article.excerpt, article.normalizedText, article.translatedTitle, article.translatedSummary].filter(Boolean).join(' '));
  const topics = detectNewsRadarTopics(text);
  const monitoringTagMatches = (graph.monitoringTags ?? []).filter((tag) => containsPhrase(text, tag.label));
  const magnitudeSignal = /\bm [4-9](?: \d+)?\b/.test(text);
  const hasDisruption = magnitudeSignal || disruptionTerms.some((term) => containsPhrase(text, term)) || monitoringTagMatches.length > 0;
  if (magnitudeSignal && !topics.includes('ENVIRONMENTAL')) topics.push('ENVIRONMENTAL');
  if (monitoringTagMatches.length > 0 && topics.length === 0) topics.push('OPERATIONAL');
  const matches: NewsRadarMatch[] = [];
  const detectedTerms = new Set<string>();
  const detectedLocations = new Set<string>();
  if (!hasDisruption || topics.length === 0) return { topics, matches, detectedTerms: [], detectedLocations: [] };
  monitoringTagMatches.forEach((tag) => detectedTerms.add(tag.label));
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
      relevanceLevel: 'HIGH',
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
    const countryTerm = matchingLocationTerm(text, factory.country);
    const cityCountry = containsPhrase(text, factory.city) && Boolean(countryTerm);
    const countryOnly = !cityCountry && Boolean(countryTerm);
    if (!named && !cityCountry && !countryOnly) continue;
    const method: NewsRadarMatchMethod = named ? 'UNIQUE_EXACT_NAME' : cityCountry ? 'EXACT_CITY_COUNTRY' : 'EXACT_COUNTRY';
    const terms = named ? [factory.name] : cityCountry ? [factory.city!, countryTerm!] : [countryTerm!];
    terms.forEach((term) => { detectedTerms.add(term); detectedLocations.add(term); });
    const path: NewsRadarMatch['pathSnapshot'] = [customerStep(graph)];
    if (factory.supplier) path.push({ nodeType: 'SUPPLIER' as const, id: factory.supplier.id, label: factory.supplier.name, relationship: 'explicit supplier' });
    path.push({ nodeType: 'FACTORY', id: factory.id, label: factory.name, relationship: 'explicit factory' });
    pushUnique(matches, {
      matchKey: `factory:${factory.id}`,
      entityType: 'FACTORY', topic, matchMethod: method,
      confidence: named ? 0.92 : cityCountry ? 0.78 : 0.64,
      relevanceLevel: named ? 'HIGH' : 'MEDIUM',
      reason: named ? 'Factory name occurs exactly in disruptive coverage.' : cityCountry ? 'Disruptive coverage names the exact factory city and country.' : 'Disruptive coverage explicitly names the factory country.',
      matchedTerms: terms, pathSnapshot: path, factoryId: factory.id,
    });
  }

  for (const product of graph.products) {
    if (!containsPhrase(text, product.name)) continue;
    detectedTerms.add(product.name);
    pushUnique(matches, {
      matchKey: `product:${product.id}`, entityType: 'PRODUCT', topic,
      matchMethod: 'UNIQUE_EXACT_NAME', confidence: 0.82,
      relevanceLevel: 'HIGH',
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
      relevanceLevel: 'HIGH',
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
        relevanceLevel: 'HIGH',
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
        relevanceLevel: 'HIGH',
        reason: 'A named port is explicitly present on this customer route.', matchedTerms: [term],
        pathSnapshot: [customerStep(graph), { nodeType: 'ROUTE', id: route.id, label: route.name, relationship: 'explicit route' }, { nodeType: 'PORT', id: routePort.port.id, label: routePort.port.name, relationship: `route port sequence ${routePort.sequence}` }],
        routePortRouteId: route.id, portId: routePort.port.id,
      });
    }
  }

  for (const product of graph.products) {
    if (!product.category || !containsPhrase(text, product.category) || matches.some((match) => match.productId === product.id)) continue;
    pushUnique(matches, {
      matchKey: `industry:product:${product.id}`, entityType: 'PRODUCT', topic,
      matchMethod: 'INDUSTRY_CONTEXT', confidence: 0.4, relevanceLevel: 'LOW',
      reason: 'Coverage mentions only the product industry; this low-specificity context is excluded from the main overview.',
      matchedTerms: [product.category],
      pathSnapshot: [customerStep(graph), { nodeType: 'PRODUCT', id: product.id, label: product.name, relationship: 'explicit product category' }],
      productId: product.id,
    });
  }

  return { topics, matches, detectedTerms: [...detectedTerms].filter(Boolean).sort(), detectedLocations: [...detectedLocations].filter(Boolean).sort() };
}

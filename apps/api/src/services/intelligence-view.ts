import crypto from 'node:crypto';

export type IntelligenceLevel = 'DIRECT' | 'POTENTIAL' | 'BROADER';

export type IntelligenceArticleInput = {
  id: string;
  title: string;
  summary: string | null;
  originalTitle: string;
  originalSummary: string | null;
  translated: boolean;
  relevance: 'HIGH' | 'MEDIUM' | 'LOW';
  url: string;
  publishedAt: Date | null;
  discoveredAt: Date;
  topic: string;
  category: string;
  country: string | null;
  region: string | null;
  language: string | null;
  source: { name: string; status: string };
  relatedSuppliers: string[];
  relatedFactories: string[];
  relatedProducts: string[];
  relatedMaterials: string[];
  relatedCountries: string[];
  relatedLocations: string[];
  reasons: string[];
};

export type IntelligenceDevelopment = {
  id: string;
  level: IntelligenceLevel;
  title: string;
  summary: string | null;
  topic: string;
  category: string;
  country: string | null;
  region: string | null;
  publishedAt: Date | null;
  explanation: string;
  sourceCount: number;
  relatedSuppliers: string[];
  relatedFactories: string[];
  relatedProducts: string[];
  relatedMaterials: string[];
  relatedCountries: string[];
  relatedLocations: string[];
  evidence: Array<{
    id: string;
    title: string;
    originalTitle: string;
    translated: boolean;
    url: string;
    source: string;
    language: string | null;
    publishedAt: Date | null;
  }>;
};

const stopWords = new Set([
  'after', 'amid', 'and', 'are', 'from', 'into', 'near', 'over', 'that', 'the',
  'this', 'with', 'says', 'new', 'update', 'latest', 'report', 'reports',
]);

function normalizedTokens(title: string) {
  return [...new Set(title.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').split(/\s+/)
    .filter((token) => token.length >= 3 && !stopWords.has(token)))].sort();
}

function similarity(left: string[], right: string[]) {
  const intersection = left.filter((token) => right.includes(token)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

function levelFor(relevance: IntelligenceArticleInput['relevance']): IntelligenceLevel {
  if (relevance === 'HIGH') return 'DIRECT';
  if (relevance === 'MEDIUM') return 'POTENTIAL';
  return 'BROADER';
}

function explanationFor(item: IntelligenceArticleInput, level: IntelligenceLevel) {
  if (level !== 'BROADER') return item.reasons[0] ?? 'Matched deterministically to explicit BSK supply-chain data.';
  const pathways: Record<string, string> = {
    GEOPOLITICAL: 'trade routes, sanctions or cross-border operations',
    ECONOMIC: 'input costs, currencies, energy or demand',
    LOGISTICS: 'shipping routes, ports or freight availability',
    ENVIRONMENTAL: 'manufacturing locations or transport infrastructure',
    TRADE: 'tariffs, customs or import and export flows',
    TECHNOLOGY: 'digital or critical logistics infrastructure',
    OPERATIONAL: 'manufacturing or logistics continuity',
  };
  return `No direct BSK exposure is confirmed. This development could affect ${pathways[item.topic] ?? 'manufacturing, trade or logistics'}.`;
}

function addUnique(target: string[], values: string[]) {
  for (const value of values) if (!target.includes(value)) target.push(value);
}

export function buildIntelligenceView(items: IntelligenceArticleInput[]) {
  const sorted = [...items].sort((a, b) =>
    (b.publishedAt ?? b.discoveredAt).getTime() - (a.publishedAt ?? a.discoveredAt).getTime(),
  );
  const developments: Array<IntelligenceDevelopment & { tokens: string[]; referenceDate: Date }> = [];
  for (const item of sorted) {
    const level = levelFor(item.relevance);
    const tokens = normalizedTokens(item.title);
    const date = item.publishedAt ?? item.discoveredAt;
    const existing = developments.find((development) =>
      development.level === level &&
      development.topic === item.topic &&
      Math.abs(development.referenceDate.getTime() - date.getTime()) <= 7 * 24 * 60 * 60 * 1000 &&
      similarity(development.tokens, tokens) >= 0.6,
    );
    if (existing) {
      if (!existing.evidence.some((evidence) => evidence.id === item.id)) existing.evidence.push({
        id: item.id, title: item.title, originalTitle: item.originalTitle, translated: item.translated,
        url: item.url, source: item.source.name, language: item.language, publishedAt: item.publishedAt,
      });
      existing.sourceCount = new Set(existing.evidence.map((evidence) => evidence.source)).size;
      addUnique(existing.relatedSuppliers, item.relatedSuppliers);
      addUnique(existing.relatedFactories, item.relatedFactories);
      addUnique(existing.relatedProducts, item.relatedProducts);
      addUnique(existing.relatedMaterials, item.relatedMaterials);
      addUnique(existing.relatedCountries, item.relatedCountries);
      addUnique(existing.relatedLocations, item.relatedLocations);
      continue;
    }
    const signature = `${level}|${item.topic}|${tokens.join('-')}|${date.toISOString().slice(0, 10)}`;
    developments.push({
      id: crypto.createHash('sha256').update(signature).digest('hex').slice(0, 20),
      level, title: item.title, summary: item.summary, topic: item.topic, category: item.category,
      country: item.country, region: item.region, publishedAt: item.publishedAt,
      explanation: explanationFor(item, level), sourceCount: 1,
      relatedSuppliers: [...item.relatedSuppliers], relatedFactories: [...item.relatedFactories],
      relatedProducts: [...item.relatedProducts], relatedMaterials: [...item.relatedMaterials],
      relatedCountries: [...item.relatedCountries], relatedLocations: [...item.relatedLocations],
      evidence: [{ id: item.id, title: item.title, originalTitle: item.originalTitle, translated: item.translated, url: item.url, source: item.source.name, language: item.language, publishedAt: item.publishedAt }],
      tokens, referenceDate: date,
    });
  }
  const clean = developments.map((development) => {
    const result: Partial<typeof development> = { ...development };
    delete result.tokens;
    delete result.referenceDate;
    return result as IntelligenceDevelopment;
  });
  return {
    developments: clean,
    counts: {
      direct: clean.filter((item) => item.level === 'DIRECT').length,
      potential: clean.filter((item) => item.level === 'POTENTIAL').length,
      broader: clean.filter((item) => item.level === 'BROADER').length,
    },
  };
}

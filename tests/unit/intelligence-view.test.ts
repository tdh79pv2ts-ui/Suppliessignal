import { describe, expect, it } from 'vitest';
import { buildIntelligenceView, type IntelligenceArticleInput } from '../../apps/api/src/services/intelligence-view';

const article = (overrides: Partial<IntelligenceArticleInput> = {}): IntelligenceArticleInput => ({
  id: 'article-a', title: 'Port strike disrupts Bangladesh garment exports', summary: 'Exports are delayed.',
  originalTitle: 'Port strike disrupts Bangladesh garment exports', originalSummary: 'Exports are delayed.',
  translated: false, relevance: 'HIGH', url: 'https://source.example/a', publishedAt: new Date('2026-08-20T10:00:00Z'),
  discoveredAt: new Date('2026-08-20T10:05:00Z'), topic: 'LOGISTICS', category: 'LOCAL_NEWS', country: 'Bangladesh',
  region: 'South Asia', language: 'en', source: { name: 'Source A', status: 'NORMALIZED' },
  relatedSuppliers: [], relatedFactories: ['BSK Bangladesh'], relatedProducts: [], relatedMaterials: [],
  relatedCountries: ['Bangladesh'], relatedLocations: ['Cumilla'], reasons: ['BSK has a factory in the affected country.'],
  ...overrides,
});

describe('lightweight intelligence development view', () => {
  it('maps strict graph matches to Direct and contextual matches to Potential', () => {
    const result = buildIntelligenceView([
      article(),
      article({ id: 'article-b', title: 'Flooding disrupts factories in Bangladesh', relevance: 'MEDIUM', topic: 'ENVIRONMENTAL', source: { name: 'Source B', status: 'NORMALIZED' } }),
    ]);
    expect(result.counts).toEqual({ direct: 1, potential: 1, broader: 0 });
    expect(result.developments.map((item) => item.level)).toEqual(['DIRECT', 'POTENTIAL']);
  });

  it('groups similar reporting while preserving every evidence URL', () => {
    const result = buildIntelligenceView([
      article(),
      article({ id: 'article-b', title: 'Bangladesh port strike disrupts garment exports', url: 'https://source.example/b', source: { name: 'Source B', status: 'NORMALIZED' } }),
    ]);
    expect(result.developments).toHaveLength(1);
    expect(result.developments[0]).toMatchObject({ sourceCount: 2 });
    expect(result.developments[0]?.evidence.map((item) => item.url)).toEqual(['https://source.example/a', 'https://source.example/b']);
  });

  it('keeps unrelated developments separate and labels broader context conservatively', () => {
    const result = buildIntelligenceView([
      article({ relevance: 'LOW', relatedFactories: [], relatedCountries: [], relatedLocations: [], reasons: [] }),
      article({ id: 'article-b', title: 'Currency shock raises global energy prices', relevance: 'LOW', topic: 'ECONOMIC', country: null, source: { name: 'Source B', status: 'NORMALIZED' } }),
    ]);
    expect(result.developments).toHaveLength(2);
    expect(result.developments.every((item) => item.level === 'BROADER')).toBe(true);
    expect(result.developments.every((item) => item.explanation.startsWith('No direct BSK exposure is confirmed.'))).toBe(true);
  });
});

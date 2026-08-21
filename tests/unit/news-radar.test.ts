import { describe, expect, it } from 'vitest';
import { matchArticleToSupplyChain, type NewsRadarGraph } from '../../apps/api/src/services/news-radar-matching';

function graph(overrides: Partial<NewsRadarGraph> = {}): NewsRadarGraph {
  return {
    customer: { id: 'customer-a', name: 'Electronics Manufacturer' },
    suppliers: [{ id: 'supplier-a', name: 'Foxconn Precision Components', legalName: 'Foxconn Precision Components Vietnam Ltd', country: 'Vietnam', city: 'Bac Ninh' }],
    factories: [{ id: 'factory-a', name: 'Bac Ninh Module Factory', country: 'Vietnam', city: 'Bac Ninh', supplier: { id: 'supplier-a', name: 'Foxconn Precision Components', country: 'Vietnam' } }],
    products: [{ id: 'product-a', name: 'Battery Module' }],
    materials: [{ id: 'material-a', name: 'Lithium', commodity: 'Lithium carbonate', productMaterials: [{ product: { id: 'product-a', name: 'Battery Module' } }] }],
    routes: [{ id: 'route-a', name: 'Shanghai Rotterdam shipping', originLabel: 'Shanghai', destinationLabel: 'Rotterdam', routePorts: [{ sequence: 2, port: { id: 'port-a', name: 'Port of Rotterdam', country: 'Netherlands', city: 'Rotterdam', portCode: 'NLRTM' } }] }],
    ...overrides,
  };
}

const match = (text: string, value = graph()) => matchArticleToSupplyChain({ title: text }, value).matches;

describe('deterministic supply-chain news radar matching', () => {
  it('matches a unique exact supplier name in disruptive coverage', () => {
    expect(match('Fire disrupts Foxconn Precision Components production')).toEqual(expect.arrayContaining([expect.objectContaining({ entityType: 'SUPPLIER', matchMethod: 'UNIQUE_EXACT_NAME', relevanceLevel: 'HIGH' })]));
  });

  it('does not match a same-name supplier without a disambiguating location', () => {
    const value = graph({ suppliers: [
      { id: 'one', name: 'Acme Components', country: 'Vietnam' },
      { id: 'two', name: 'Acme Components', country: 'Thailand' },
    ] });
    expect(match('Fire disrupts Acme Components production', value).filter((item) => item.entityType === 'SUPPLIER')).toHaveLength(0);
    expect(match('Fire disrupts Acme Components production in Thailand', value).filter((item) => item.entityType === 'SUPPLIER')).toEqual([expect.objectContaining({ supplierId: 'two', matchMethod: 'NAME_AND_LOCATION' })]);
  });

  it('matches a factory country location only in explicit factory disruption coverage', () => {
    expect(match('Flooding disrupts factories in Vietnam')).toEqual(expect.arrayContaining([expect.objectContaining({ entityType: 'FACTORY', matchMethod: 'EXACT_COUNTRY' })]));
  });

  it('does not treat source metadata as evidence that an article affects the source country', () => {
    expect(matchArticleToSupplyChain(
      { title: 'Flooding disrupts industrial production' },
      graph(),
    ).matches).toHaveLength(0);
  });

  it('matches a real-feed-shaped earthquake magnitude to an exact country dependency', () => {
    const result = match('M 6.2 - 45 km south of Santiago, Chile', graph({
      factories: [{ id: 'factory-chile', name: 'Chile Materials Plant', country: 'Chile', city: 'Valparaiso' }],
    }));
    expect(result).toEqual(expect.arrayContaining([expect.objectContaining({ entityType: 'FACTORY', matchMethod: 'EXACT_COUNTRY', topic: 'ENVIRONMENTAL' })]));
  });

  it('classifies technology disruptions without fuzzy matching', () => {
    expect(match('Cyberattack disrupts Foxconn Precision Components production')).toEqual(expect.arrayContaining([expect.objectContaining({ entityType: 'SUPPLIER', topic: 'TECHNOLOGY' })]));
  });

  it('matches a material shortage but ignores an unrelated product mention', () => {
    expect(match('Lithium shortage disrupts regional production')).toEqual(expect.arrayContaining([expect.objectContaining({ entityType: 'MATERIAL' })]));
    expect(match('Battery Module receives an international design award')).toHaveLength(0);
  });

  it('matches an explicit route port and retains the customer route path', () => {
    const result = match('Port of Rotterdam closure causes shipping disruption');
    expect(result).toEqual(expect.arrayContaining([expect.objectContaining({ entityType: 'PORT', routePortRouteId: 'route-a', portId: 'port-a' })]));
    expect(result.find((item) => item.entityType === 'PORT')?.pathSnapshot.map((step) => step.nodeType)).toEqual(['CUSTOMER', 'ROUTE', 'PORT']);
  });

  it('matches both explicit route endpoints', () => {
    expect(match('Shanghai Rotterdam shipping disruption delays freight')).toEqual(expect.arrayContaining([expect.objectContaining({ entityType: 'ROUTE', matchMethod: 'UNIQUE_EXACT_NAME' })]));
  });

  it('does not match an unrelated country', () => {
    expect(match('Flooding disrupts factories in Thailand').filter((item) => item.entityType === 'FACTORY')).toHaveLength(0);
  });

  it('classifies an explicit customer country match as MEDIUM', () => {
    expect(match('Flooding disrupts factories in Vietnam')).toEqual(expect.arrayContaining([
      expect.objectContaining({ entityType: 'FACTORY', relevanceLevel: 'MEDIUM', matchMethod: 'EXACT_COUNTRY' }),
    ]));
  });

  it('keeps industry-only context LOW so it can be excluded from the overview', () => {
    const value = graph({ products: [{ id: 'product-a', name: 'Battery Module', category: 'Bags and accessories' }] });
    expect(match('Strike disrupts the bags and accessories industry', value)).toEqual(expect.arrayContaining([
      expect.objectContaining({ entityType: 'PRODUCT', relevanceLevel: 'LOW', matchMethod: 'INDUSTRY_CONTEXT' }),
    ]));
  });

  it('matches translated evidence while retaining deterministic exact terms', () => {
    const result = matchArticleToSupplyChain({
      title: '工場に関する現地報道',
      translatedTitle: 'Fire disrupts Foxconn Precision Components production',
    }, graph()).matches;
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ entityType: 'SUPPLIER', relevanceLevel: 'HIGH' }),
    ]));
  });
});

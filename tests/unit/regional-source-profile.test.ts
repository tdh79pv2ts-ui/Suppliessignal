import { describe, expect, it } from 'vitest';
import { buildRegionalProfile, sourceRecommendation } from '../../apps/api/src/services/regional-source-profile';

describe('BSK regional source profile', () => {
  const profile = buildRegionalProfile({
    customerId: 'bsk',
    companies: [{ name: 'BSK Fashion', country: 'China', category: 'Bag manufacturer' }],
    suppliers: [],
    factories: [
      { name: 'Guangzhou Factory', country: 'China', city: 'Guangzhou', category: 'Bag manufacturing' },
      { name: 'Yangon Factory', country: 'Myanmar', city: 'Yangon', category: 'Bag manufacturing' },
      { name: 'Cumilla Factory', country: 'Bangladesh', city: 'Cumilla', category: 'Bag manufacturing' },
    ],
    products: [{ name: 'Handbag', category: 'Bags and accessories' }],
    materials: [{ name: 'Nylon', category: 'Published catalog material' }],
    routes: [],
    locations: [
      { name: 'Guangzhou, China', country: 'China', location: 'Guangzhou' },
      { name: 'Yangon, Myanmar', country: 'Myanmar', location: 'Yangon' },
      { name: 'Cumilla EPZ, Bangladesh', country: 'Bangladesh', location: 'Cumilla EPZ' },
    ],
  });

  it('derives countries, regions, industries and keywords only from graph data', () => {
    expect(profile.countries).toEqual(['Bangladesh', 'China', 'Myanmar']);
    expect(profile.regions).toEqual(['East Asia', 'Greater China', 'South Asia', 'Southeast Asia']);
    expect(profile.monitoringKeywords).toEqual(expect.arrayContaining(['Guangzhou Factory', 'Cumilla EPZ', 'Handbag', 'Nylon']));
    expect(profile.suppliers).toEqual([]);
  });

  it('prioritizes official country sources and excludes unrelated sources', () => {
    expect(sourceRecommendation(profile, { country: 'Myanmar', region: 'Southeast Asia', category: 'GOVERNMENT', reliability: 'PRIMARY', collectionEnabled: true })).toMatchObject({ priority: 1, scope: 'COUNTRY' });
    expect(sourceRecommendation(profile, { country: 'Bangladesh', region: 'South Asia', category: 'LOCAL_NEWS', reliability: 'HIGH', collectionEnabled: true })).toMatchObject({ priority: 3, scope: 'COUNTRY' });
    expect(sourceRecommendation(profile, { country: 'Brazil', region: 'South America', category: 'LOCAL_NEWS', reliability: 'HIGH', collectionEnabled: true })).toBeNull();
  });
});

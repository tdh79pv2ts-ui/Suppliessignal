import { describe, expect, it } from 'vitest';
import { bskPublicSourceCatalog } from '../../prisma/source-catalog';

const countryEntries = (country: string) => bskPublicSourceCatalog.filter((source) => source.country === country);

describe('BSK public source catalog', () => {
  it('contains a broad, uniquely named public source universe with valid URLs', () => {
    expect(bskPublicSourceCatalog.length).toBeGreaterThanOrEqual(125);
    expect(new Set(bskPublicSourceCatalog.map((source) => source.name)).size).toBe(bskPublicSourceCatalog.length);
    for (const source of bskPublicSourceCatalog) {
      expect(['http:', 'https:']).toContain(new URL(source.baseUrl).protocol);
      if (['RSS', 'ATOM'].includes(source.sourceType ?? 'WEB')) {
        expect(['http:', 'https:']).toContain(new URL(source.feedUrl!).protocol);
      }
      expect(source.collectionEnabled ?? false).toBe(['RSS', 'ATOM'].includes(source.sourceType ?? 'WEB'));
    }
  });

  it.each([
    ['Bangladesh', ['bn', 'en']],
    ['China', ['zh', 'en']],
    ['Myanmar', ['my', 'en']],
  ])('meets the regional category and language baseline for %s', (country, languages) => {
    const entries = countryEntries(country);
    const count = (...categories: string[]) => entries.filter((source) => categories.includes(source.category)).length;
    expect(count('GOVERNMENT', 'REGULATOR', 'TRADE')).toBeGreaterThanOrEqual(3);
    expect(count('INDUSTRY')).toBeGreaterThanOrEqual(2);
    expect(count('LOGISTICS', 'PORT')).toBeGreaterThanOrEqual(2);
    expect(count('LOCAL_NEWS')).toBeGreaterThanOrEqual(3);
    expect(count('WEATHER')).toBeGreaterThanOrEqual(1);
    for (const language of languages) expect(entries.some((source) => source.language === language)).toBe(true);
  });
});

import type { Source, SourceCategory, SourceReliability } from '@suppliesignal/db';

type Named = { name: string; country?: string | null; city?: string | null; category?: string | null };
type Material = Named & { commodity?: string | null };
type Route = Named & { originLabel: string; destinationLabel: string };
type Location = Named & { location?: string | null };

export type RegionalProfile = {
  customerId: string;
  countries: string[];
  regions: string[];
  industries: string[];
  suppliers: string[];
  factories: string[];
  products: string[];
  materials: string[];
  locations: string[];
  logisticsDependencies: string[];
  monitoringKeywords: string[];
  searchLanguages: string[];
};

const countryRegions: Record<string, string[]> = {
  China: ['Greater China', 'East Asia'],
  Myanmar: ['Southeast Asia'],
  Bangladesh: ['South Asia'],
};
const countryLanguages: Record<string, string[]> = {
  China: ['en', 'zh'],
  Myanmar: ['en'],
  Bangladesh: ['en'],
};

const unique = (values: Array<string | null | undefined>) =>
  [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))].sort();

export function buildRegionalProfile(input: {
  customerId: string;
  companies: Named[];
  suppliers: Named[];
  factories: Named[];
  products: Named[];
  materials: Material[];
  routes: Route[];
  locations: Location[];
}): RegionalProfile {
  const countries = unique([
    ...input.companies.map((item) => item.country),
    ...input.suppliers.map((item) => item.country),
    ...input.factories.map((item) => item.country),
    ...input.locations.map((item) => item.country),
  ]);
  const regions = unique(countries.flatMap((country) => countryRegions[country] ?? []));
  const industries = unique([
    ...input.companies.map((item) => item.category),
    ...input.suppliers.map((item) => item.category),
    ...input.factories.map((item) => item.category),
    ...input.products.map((item) => item.category),
    ...input.materials.map((item) => item.category),
  ]);
  const suppliers = unique(input.suppliers.map((item) => item.name));
  const factories = unique(input.factories.map((item) => item.name));
  const products = unique(input.products.map((item) => item.name));
  const materials = unique(input.materials.flatMap((item) => [item.name, item.commodity]));
  const locations = unique(input.locations.flatMap((item) => [item.name, item.location, item.city]));
  const logisticsDependencies = unique(input.routes.flatMap((item) => [item.name, item.originLabel, item.destinationLabel]));
  return {
    customerId: input.customerId,
    countries,
    regions,
    industries,
    suppliers,
    factories,
    products,
    materials,
    locations,
    logisticsDependencies,
    monitoringKeywords: unique([...suppliers, ...factories, ...products, ...materials, ...locations, ...countries, ...logisticsDependencies]),
    searchLanguages: unique(['en', ...countries.flatMap((country) => countryLanguages[country] ?? [])]),
  };
}

type ProfileSource = Pick<Source, 'country' | 'region' | 'category' | 'reliability' | 'collectionEnabled'>;
const officialCategories = new Set<SourceCategory>(['GOVERNMENT', 'REGULATOR', 'PORT']);
const globalFallbackCategories = new Set<SourceCategory>(['NEWS', 'TRADE', 'WEATHER', 'LOGISTICS', 'MARKET']);

export function sourceRecommendation(profile: RegionalProfile, source: ProfileSource) {
  const countryMatch = Boolean(source.country && profile.countries.includes(source.country));
  const regionMatch = Boolean(source.region && profile.regions.includes(source.region));
  const globalFallback = !source.country && !source.region && globalFallbackCategories.has(source.category);
  if (!countryMatch && !regionMatch && !globalFallback) return null;
  const official = source.reliability === ('PRIMARY' satisfies SourceReliability) || officialCategories.has(source.category);
  const priority = official ? 1 : source.category === 'INDUSTRY' ? 2 : source.category === 'LOCAL_NEWS' ? 3 : 4;
  const reason = countryMatch
    ? `Covers verified BSK operations in ${source.country}.`
    : regionMatch
      ? `Covers the BSK region ${source.region}.`
      : 'Global fallback for trade, logistics, or physical disruption context.';
  return { priority, reason, scope: countryMatch ? 'COUNTRY' : regionMatch ? 'REGION' : 'GLOBAL_FALLBACK' } as const;
}

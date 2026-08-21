import { db } from '../packages/db/src/index.js';
import { NEWS_RADAR_POLICY_VERSION } from '../apps/api/src/services/news-radar.js';

const failures: string[] = [];
const warnings: string[] = [];
const validHttpUrl = (value: string | null) => {
  if (!value) return false;
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
};

async function main() {
try {
  const customer = await db.customer.findFirst({ where: { name: 'BSK Fashion' } });
  if (!customer) throw new Error('BSK Fashion customer workspace does not exist');
  const [sources, preferences, exposures, duplicateUrls, duplicateContent, crossTenantRefs] = await Promise.all([
    db.source.findMany({ orderBy: { name: 'asc' } }),
    db.customerSourcePreference.findMany({ where: { customerId: customer.id }, include: { source: true } }),
    db.newsRadarExposure.findMany({
      where: { customerId: customer.id, policyVersion: NEWS_RADAR_POLICY_VERSION, relevanceLevel: { in: ['HIGH', 'MEDIUM'] } },
      include: { sourceArticle: { include: { source: true } } },
    }),
    db.$queryRaw<Array<{ value: string; count: bigint }>>`
      SELECT "canonical_url" AS value, COUNT(*) AS count
      FROM "source_articles" WHERE "canonical_url" IS NOT NULL
      GROUP BY "canonical_url" HAVING COUNT(*) > 1
    `,
    db.$queryRaw<Array<{ value: string; count: bigint }>>`
      SELECT "content_hash" AS value, COUNT(*) AS count
      FROM "source_articles"
      WHERE length(trim(COALESCE("normalized_text", ''))) >= 20
      GROUP BY "content_hash" HAVING COUNT(*) > 1
    `,
    db.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) AS count FROM "news_radar_exposures" e
      LEFT JOIN "suppliers" s ON s."id" = e."supplier_id"
      LEFT JOIN "factories" f ON f."id" = e."factory_id"
      LEFT JOIN "products" p ON p."id" = e."product_id"
      LEFT JOIN "materials" m ON m."id" = e."material_id"
      LEFT JOIN "routes" r ON r."id" = e."route_id"
      WHERE (s."id" IS NOT NULL AND s."customer_id" <> e."customer_id")
         OR (f."id" IS NOT NULL AND f."customer_id" <> e."customer_id")
         OR (p."id" IS NOT NULL AND p."customer_id" <> e."customer_id")
         OR (m."id" IS NOT NULL AND m."customer_id" <> e."customer_id")
         OR (r."id" IS NOT NULL AND r."customer_id" <> e."customer_id")
    `,
  ]);

  if (sources.length < 125) failures.push(`Source universe contains ${sources.length}; release minimum is 125 verified sources.`);
  for (const source of sources) {
    if (!validHttpUrl(source.baseUrl)) failures.push(`Invalid source base URL: ${source.name}`);
    if (['RSS', 'ATOM'].includes(source.sourceType) && !validHttpUrl(source.feedUrl)) failures.push(`Collectible source lacks a valid feed URL: ${source.name}`);
  }
  const enabledCollectible = preferences.filter((item) => item.enabled && ['RSS', 'ATOM'].includes(item.source.sourceType));
  for (const item of enabledCollectible) if (!item.source.language) failures.push(`Enabled collectible source lacks language metadata: ${item.source.name}`);
  if (enabledCollectible.length < 5) warnings.push(`Only ${enabledCollectible.length} machine-readable sources are enabled for BSK.`);
  for (const exposure of exposures) {
    if (!validHttpUrl(exposure.sourceArticle.originalUrl)) failures.push(`Displayed article has invalid original URL: ${exposure.sourceArticleId}`);
    if (!exposure.reason.trim()) failures.push(`Displayed exposure has no relevance explanation: ${exposure.id}`);
    if (![exposure.supplierId, exposure.factoryId, exposure.productId, exposure.materialId, exposure.routeId, exposure.portId].some(Boolean)) failures.push(`Displayed exposure has no typed graph reference: ${exposure.id}`);
  }
  if (duplicateUrls.length) failures.push(`${duplicateUrls.length} duplicate canonical article URL group(s) exist.`);
  if (duplicateContent.length) failures.push(`${duplicateContent.length} duplicate normalized article-content group(s) exist.`);
  if (Number(crossTenantRefs[0]?.count ?? 0) > 0) failures.push('Cross-customer news-radar graph references exist.');

  const coverage = Object.values(preferences.reduce<Record<string, { region: string; total: number; enabled: number; categories: Record<string, number>; languages: string[] }>>((groups, preference) => {
    const region = preference.source.country ?? preference.source.region ?? 'Global';
    const group = groups[region] ?? { region, total: 0, enabled: 0, categories: {}, languages: [] };
    group.total++;
    if (preference.enabled) group.enabled++;
    group.categories[preference.source.category] = (group.categories[preference.source.category] ?? 0) + 1;
    if (preference.source.language && !group.languages.includes(preference.source.language)) group.languages.push(preference.source.language);
    groups[region] = group;
    return groups;
  }, {}));
  console.log(JSON.stringify({ status: failures.length ? 'FAILED' : 'PASSED', policyVersion: NEWS_RADAR_POLICY_VERSION, customerId: customer.id, sources: sources.length, customerSources: preferences.length, enabledSources: preferences.filter((item) => item.enabled).length, enabledCollectibleSources: enabledCollectible.length, displayedArticles: new Set(exposures.map((item) => item.sourceArticleId)).size, coverage, failures, warnings }, null, 2));
  if (failures.length) process.exitCode = 1;
} finally {
  await db.$disconnect();
}
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

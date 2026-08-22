import { db, type MonitoringTagCategory, type MonitoringTagStatus } from '@suppliesignal/db';
import type { CustomMonitoringTagInput, MonitoringTagUpdateInput } from '@suppliesignal/shared';
import { ServiceError } from './errors.js';
import { buildRegionalProfile, sourceRecommendation } from './regional-source-profile.js';

type TagDefinition = {
  key: string;
  label: string;
  category: MonitoringTagCategory;
  reason: string;
};

const suggestionRules: Record<string, Array<[string, string]>> = {
  Bangladesh: [
    ['labor unrest', 'Manufacturing exposure in Bangladesh can be affected by labour disruption.'],
    ['minimum wage', 'Bangladesh garment production is sensitive to wage regulation.'],
    ['flooding', 'Flooding can interrupt factories, roads and export logistics in Bangladesh.'],
    ['garment exports', 'BSK has apparel and bag-manufacturing exposure in Bangladesh.'],
    ['energy shortages', 'Factory output can be affected by electricity and gas availability.'],
    ['port congestion', 'Bangladesh production depends on reliable import and export logistics.'],
    ['customs', 'Customs changes can affect material imports and finished-goods exports.'],
    ['trade restrictions', 'Trade measures can affect Bangladesh manufacturing flows.'],
  ],
  China: [
    ['export controls', 'BSK has manufacturing and material exposure in China.'],
    ['tariffs', 'Tariff changes can affect China-linked inputs and finished goods.'],
    ['raw material shortages', 'China-linked production depends on material availability.'],
    ['energy shortages', 'Energy availability can affect manufacturing continuity in China.'],
    ['sanctions', 'Sanctions can alter trade and supplier operating conditions.'],
    ['manufacturing disruption', 'BSK has verified manufacturing exposure in China.'],
  ],
  Myanmar: [
    ['political instability', 'BSK has verified factory exposure in Myanmar.'],
    ['border restrictions', 'Myanmar manufacturing relies on cross-border material and trade flows.'],
    ['power shortages', 'Power availability can affect Myanmar factory continuity.'],
    ['labor unrest', 'Labour disruption can affect BSK-linked manufacturing in Myanmar.'],
    ['customs', 'Customs changes can affect Myanmar import and export flows.'],
    ['port disruption', 'Port disruption can affect Myanmar manufacturing logistics.'],
  ],
};

const PROFILE_SYNC_TRANSACTION_TIMEOUT_MS = 30_000;

function normalized(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function definition(category: MonitoringTagCategory, label: string, reason: string): TagDefinition {
  return { key: `${category.toLowerCase()}:${normalized(label)}`, label, category, reason };
}

function uniqueDefinitions(values: TagDefinition[]) {
  return [...new Map(values.map((value) => [value.key, value])).values()].sort((a, b) => a.label.localeCompare(b.label));
}

export class MonitoringProfileService {
  async get(customerId: string) {
    const data = await this.derive(customerId);
    await this.syncDerived(customerId, data.autoTags, data.suggestedTags, data.sources);
    const [tags, preferences] = await Promise.all([
      db.customerMonitoringTag.findMany({
        where: { customerId, OR: [{ type: 'CUSTOM' }, { derivedActive: true }] },
        orderBy: [{ type: 'asc' }, { category: 'asc' }, { label: 'asc' }],
      }),
      db.customerSourcePreference.findMany({ where: { customerId }, select: { sourceId: true, enabled: true, recommended: true } }),
    ]);
    const preferenceMap = new Map(preferences.map((item) => [item.sourceId, item]));
    const sources = data.sources.map(({ source, recommendation }) => ({
      id: source.id,
      name: source.name,
      type: source.sourceType,
      url: source.feedUrl ?? source.baseUrl,
      country: source.country,
      region: source.region,
      category: source.category,
      language: source.language,
      reliability: source.reliability,
      collectible: ['RSS', 'ATOM'].includes(source.sourceType),
      enabled: preferenceMap.get(source.id)?.enabled ?? false,
      recommended: preferenceMap.get(source.id)?.recommended ?? Boolean(recommendation),
      recommendation,
    }));
    const groupedCoverage = Object.values(sources.reduce<Record<string, {
      region: string; total: number; enabled: number; categories: Record<string, number>; languages: string[];
    }>>((groups, source) => {
      const region = source.country ?? source.region ?? 'Global';
      const group = groups[region] ?? { region, total: 0, enabled: 0, categories: {}, languages: [] };
      group.total++;
      if (source.enabled) group.enabled++;
      group.categories[source.category] = (group.categories[source.category] ?? 0) + 1;
      if (source.language && !group.languages.includes(source.language)) group.languages.push(source.language);
      groups[region] = group;
      return groups;
    }, {})).sort((a, b) => a.region.localeCompare(b.region));
    return {
      ...data.profile,
      counts: {
        suppliers: data.graph.suppliers.length,
        factories: data.graph.factories.length,
        countries: data.profile.countries.length,
        products: data.graph.products.length,
        materials: data.graph.materials.length,
        routes: data.graph.routes.length,
        ports: data.graph.routes.reduce((count, route) => count + route.routePorts.length, 0),
        logisticsRegions: data.profile.regions.length,
      },
      tags: {
        auto: tags.filter((tag) => tag.type === 'AUTO'),
        suggested: tags.filter((tag) => tag.type === 'SUGGESTED'),
        custom: tags.filter((tag) => tag.type === 'CUSTOM'),
      },
      sources,
      coverage: groupedCoverage,
      generatedAt: new Date(),
    };
  }

  async activeTags(customerId: string) {
    const tags = await db.customerMonitoringTag.findMany({
      where: { customerId, status: 'ACTIVE', OR: [{ type: 'CUSTOM' }, { derivedActive: true }] },
      select: { label: true, type: true },
      orderBy: [{ type: 'asc' }, { label: 'asc' }],
    });
    return tags
      .map((tag) => ({ label: tag.label, type: tag.type }));
  }

  async createCustom(customerId: string, userId: string, input: CustomMonitoringTagInput) {
    const key = `custom:${normalized(input.label)}`;
    try {
      return await db.customerMonitoringTag.create({ data: {
        customerId, type: 'CUSTOM', key, label: input.label,
        normalizedLabel: normalized(input.label), category: input.category,
        status: 'ACTIVE', reason: 'Customer-defined watch term; it requires customer graph context before main-feed inclusion.',
        createdByUserId: userId,
      } });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ServiceError('MONITORING_TAG_EXISTS', 'This monitoring tag already exists', 409);
      throw error;
    }
  }

  async update(customerId: string, tagId: string, input: MonitoringTagUpdateInput) {
    const tag = await db.customerMonitoringTag.findFirst({ where: { id: tagId, customerId } });
    if (!tag) throw new ServiceError('MONITORING_TAG_NOT_FOUND', 'Monitoring tag not found', 404);
    if (tag.type === 'AUTO' && (input.label || input.category || !['ACTIVE', 'DISABLED'].includes(input.status ?? 'ACTIVE')))
      throw new ServiceError('AUTO_TAG_IMMUTABLE', 'Automatic tags can only be enabled or disabled', 400);
    if (tag.type === 'SUGGESTED' && (input.label || input.category || !['PENDING', 'ACTIVE', 'IGNORED', 'DISABLED'].includes(input.status ?? 'PENDING')))
      throw new ServiceError('SUGGESTED_TAG_IMMUTABLE', 'Suggested tag wording is derived from the monitoring policy', 400);
    const label = input.label ?? tag.label;
    return db.customerMonitoringTag.update({ where: { id: tag.id }, data: {
      ...(input.label ? { label, normalizedLabel: normalized(label), key: `custom:${normalized(label)}` } : {}),
      ...(input.category ? { category: input.category } : {}),
      ...(input.status ? { status: input.status as MonitoringTagStatus } : {}),
    } });
  }

  async remove(customerId: string, tagId: string) {
    const tag = await db.customerMonitoringTag.findFirst({ where: { id: tagId, customerId } });
    if (!tag) throw new ServiceError('MONITORING_TAG_NOT_FOUND', 'Monitoring tag not found', 404);
    if (tag.type !== 'CUSTOM') throw new ServiceError('MONITORING_TAG_DELETE_FORBIDDEN', 'Only custom tags can be removed', 400);
    await db.customerMonitoringTag.delete({ where: { id: tag.id } });
    return { id: tag.id, removed: true };
  }

  async setSourceEnabled(customerId: string, sourceId: string, enabled: boolean) {
    const source = await db.source.findUnique({ where: { id: sourceId } });
    if (!source) throw new ServiceError('SOURCE_NOT_FOUND', 'Source not found', 404);
    return db.customerSourcePreference.upsert({
      where: { customerId_sourceId: { customerId, sourceId } },
      create: { customerId, sourceId, enabled, recommended: false },
      update: { enabled },
    });
  }

  async enableRecommended(customerId: string, country?: string) {
    const profile = await this.get(customerId);
    const sourceIds = profile.sources
      .filter((source) => source.recommended && source.collectible && (!country || source.country === country))
      .map((source) => source.id);
    if (sourceIds.length) await db.customerSourcePreference.updateMany({ where: { customerId, sourceId: { in: sourceIds } }, data: { enabled: true } });
    return { enabled: sourceIds.length };
  }

  private async derive(customerId: string) {
    const customer = await db.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true } });
    if (!customer) throw new ServiceError('CUSTOMER_NOT_FOUND', 'Customer not found', 404);
    const [companies, suppliers, factories, products, materials, routes, locations, sources] = await Promise.all([
      db.company.findMany({ where: { customerId, active: true } }),
      db.supplier.findMany({ where: { customerId, active: true } }),
      db.factory.findMany({ where: { customerId, active: true } }),
      db.product.findMany({ where: { customerId, active: true } }),
      db.material.findMany({ where: { customerId, active: true } }),
      db.route.findMany({ where: { customerId, active: true }, include: { routePorts: { include: { port: true } } } }),
      db.location.findMany({ where: { customerId, active: true } }),
      db.source.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    ]);
    const profile = buildRegionalProfile({ customerId, companies, suppliers, factories, products, materials, routes, locations });
    const autoTags = uniqueDefinitions([
      ...suppliers.flatMap((item) => [item.name, item.legalName].filter(Boolean).map((label) => definition('SUPPLIER', label!, 'Derived from an active supplier in the customer graph.'))),
      ...factories.map((item) => definition('FACTORY', item.name, 'Derived from an active factory in the customer graph.')),
      ...products.map((item) => definition('PRODUCT', item.name, 'Derived from an active product in the customer graph.')),
      ...products.flatMap((item) => item.category ? [definition('INDUSTRY', item.category, 'Derived from an active product category.')] : []),
      ...materials.flatMap((item) => [item.name, item.commodity].filter(Boolean).map((label) => definition('MATERIAL', label!, 'Derived from an active material or commodity in the customer graph.'))),
      ...locations.flatMap((item) => [item.name, item.location].filter(Boolean).map((label) => definition('LOCATION', label!, 'Derived from a verified customer location.'))),
      ...profile.countries.map((label) => definition('COUNTRY', label, 'Derived from verified customer supply-chain geography.')),
      ...profile.regions.map((label) => definition('REGION', label, 'Derived from verified customer supply-chain geography.')),
      ...routes.map((item) => definition('ROUTE', item.name, 'Derived from an active customer route.')),
      ...routes.flatMap((item) => item.routePorts.map(({ port }) => definition('PORT', port.name, 'Derived from a port on an active customer route.'))),
    ]);
    const suggestedTags = uniqueDefinitions(profile.countries.flatMap((country) =>
      (suggestionRules[country] ?? []).map(([label, reason]) => definition('THEME', label, reason)),
    ));
    const sourceUniverse = sources.map((source) => ({ source, recommendation: sourceRecommendation(profile, source) }));
    return { profile, graph: { customer, suppliers, factories, products, materials, routes }, autoTags, suggestedTags, sources: sourceUniverse };
  }

  private async syncDerived(
    customerId: string,
    autoTags: TagDefinition[],
    suggestedTags: TagDefinition[],
    sources: Array<{ source: { id: string; sourceType: string; collectionEnabled: boolean }; recommendation: { reason: string } | null }>,
  ) {
    await db.$transaction(async (tx) => {
      await tx.customerMonitoringTag.updateMany({ where: { customerId, type: { in: ['AUTO', 'SUGGESTED'] } }, data: { derivedActive: false } });
      for (const item of autoTags) await tx.customerMonitoringTag.upsert({
        where: { customerId_type_key: { customerId, type: 'AUTO', key: item.key } },
        create: { customerId, type: 'AUTO', ...item, normalizedLabel: normalized(item.label), status: 'ACTIVE', derivedActive: true },
        update: { label: item.label, normalizedLabel: normalized(item.label), category: item.category, reason: item.reason, derivedActive: true },
      });
      for (const item of suggestedTags) await tx.customerMonitoringTag.upsert({
        where: { customerId_type_key: { customerId, type: 'SUGGESTED', key: item.key } },
        create: { customerId, type: 'SUGGESTED', ...item, normalizedLabel: normalized(item.label), status: 'PENDING', derivedActive: true },
        update: { label: item.label, normalizedLabel: normalized(item.label), category: item.category, reason: item.reason, derivedActive: true },
      });
      for (const { source, recommendation } of sources) {
        if (!recommendation) continue;
        await tx.customerSourcePreference.upsert({
          where: { customerId_sourceId: { customerId, sourceId: source.id } },
          create: { customerId, sourceId: source.id, enabled: source.collectionEnabled || !['RSS', 'ATOM'].includes(source.sourceType), recommended: true, reason: recommendation.reason },
          update: { recommended: true, reason: recommendation.reason },
        });
      }
    }, {
      // The verified source catalog is intentionally broad. Remote staging databases
      // can take longer than Prisma's five-second interactive-transaction default
      // while synchronizing the initial customer profile.
      timeout: PROFILE_SYNC_TRANSACTION_TIMEOUT_MS,
    });
  }
}

export const monitoringProfileService = new MonitoringProfileService();

import { db, type Prisma } from '@suppliesignal/db';
import type { NewsletterPreferenceInput } from '@suppliesignal/shared';
import { ServiceError } from './errors.js';

const exposureInclude = {
  sourceArticle: { include: { source: true } },
} satisfies Prisma.NewsRadarExposureInclude;

const briefInclude = {
  customer: { select: { id: true, name: true } },
  items: {
    include: { exposure: { include: exposureInclude } },
    orderBy: { position: 'asc' as const },
  },
} satisfies Prisma.DailyBriefInclude;

type BriefRecord = Prisma.DailyBriefGetPayload<{ include: typeof briefInclude }>;

function briefView(brief: BriefRecord | null) {
  return brief ? { ...brief, graphRevision: brief.graphRevision.toString() } : null;
}

function utcDate(value?: string): Date {
  const date = value ? new Date(`${value}T00:00:00.000Z`) : new Date();
  if (!value) date.setUTCHours(0, 0, 0, 0);
  if (Number.isNaN(date.getTime())) throw new ServiceError('INVALID_BRIEF_DATE', 'Brief date is invalid', 400);
  return date;
}

function localParts(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === type)?.value ?? '';
  return { date: `${part('year')}-${part('month')}-${part('day')}`, time: `${part('hour')}:${part('minute')}` };
}

export class DailyBriefService {
  async getPreference(customerId: string, userId: string) {
    const [preference, user] = await Promise.all([
      db.newsletterPreference.findUnique({ where: { userId_customerId: { userId, customerId } } }),
      db.user.findUnique({ where: { id: userId }, select: { email: true } }),
    ]);
    if (!user) throw new ServiceError('USER_NOT_FOUND', 'Application user not found', 404);
    return preference ?? { userId, customerId, enabled: false, deliveryTime: '08:00', timezone: 'UTC', email: user.email };
  }

  async updatePreference(customerId: string, userId: string, input: NewsletterPreferenceInput) {
    return db.newsletterPreference.upsert({
      where: { userId_customerId: { userId, customerId } },
      create: { userId, customerId, ...input },
      update: input,
    });
  }

  async latest(customerId: string) {
    return briefView(await db.dailyBrief.findFirst({ where: { customerId }, include: briefInclude, orderBy: [{ briefDate: 'desc' }, { generatedAt: 'desc' }] }));
  }

  async generate(customerId: string, dateValue?: string) {
    const briefDate = utcDate(dateValue);
    const windowEnd = briefDate;
    const windowStart = new Date(windowEnd.getTime() - 24 * 60 * 60 * 1000);
    const customer = await db.customer.findUnique({ where: { id: customerId }, select: { id: true, graphRevision: true } });
    if (!customer) throw new ServiceError('CUSTOMER_NOT_FOUND', 'Customer not found', 404);
    const [exposures, suppliers, factories, products, materials, routes, ports] = await Promise.all([
      db.newsRadarExposure.findMany({
        where: {
          customerId,
          OR: [
            { sourceArticle: { publishedAt: { gte: windowStart, lt: windowEnd } } },
            { sourceArticle: { publishedAt: null, discoveredAt: { gte: windowStart, lt: windowEnd } } },
          ],
        },
        orderBy: [{ confidence: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
        take: 20,
      }),
      db.supplier.count({ where: { customerId, active: true } }),
      db.factory.count({ where: { customerId, active: true } }),
      db.product.count({ where: { customerId, active: true } }),
      db.material.count({ where: { customerId, active: true } }),
      db.route.count({ where: { customerId, active: true } }),
      db.port.count({ where: { active: true, routePorts: { some: { customerId } } } }),
    ]);
    const snapshot = { suppliers, factories, products, materials, routes, ports };
    return db.$transaction(async (tx) => {
      const brief = await tx.dailyBrief.upsert({
        where: { customerId_briefDate: { customerId, briefDate } },
        create: { customerId, briefDate, graphRevision: customer.graphRevision, supplyChainSnapshot: snapshot },
        update: { generatedAt: new Date(), graphRevision: customer.graphRevision, supplyChainSnapshot: snapshot },
      });
      await tx.dailyBriefItem.deleteMany({ where: { briefId: brief.id } });
      if (exposures.length) await tx.dailyBriefItem.createMany({
        data: exposures.map((exposure, index) => ({
          customerId,
          briefId: brief.id,
          exposureId: exposure.id,
          section: index < 5 ? 'TOP_DEVELOPMENTS' : index < 15 ? 'POTENTIAL_EXPOSURES' : 'WATCHLIST',
          position: index + 1,
        })),
      });
      return briefView(await tx.dailyBrief.findUniqueOrThrow({ where: { id: brief.id }, include: briefInclude }));
    });
  }

  async generateDue(now = new Date()) {
    const preferences = await db.newsletterPreference.findMany({ where: { enabled: true }, select: { customerId: true, timezone: true, deliveryTime: true } });
    const generated: string[] = [];
    for (const preference of preferences) {
      const local = localParts(now, preference.timezone);
      if (local.time < preference.deliveryTime) continue;
      const briefDate = utcDate(local.date);
      const existing = await db.dailyBrief.findUnique({ where: { customerId_briefDate: { customerId: preference.customerId, briefDate } }, select: { id: true } });
      if (existing || generated.includes(preference.customerId)) continue;
      await this.generate(preference.customerId, local.date);
      generated.push(preference.customerId);
    }
    return { preferencesChecked: preferences.length, briefsGenerated: generated.length, customerIds: generated };
  }
}

export const dailyBriefService = new DailyBriefService();

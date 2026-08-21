import { db, type Prisma } from '@suppliesignal/db';
import type { DailyBriefPreferenceInput } from '@suppliesignal/shared';
import { ServiceError } from './errors.js';
import { ResendEmailProvider, type EmailProvider } from './email.js';
import { NEWS_RADAR_POLICY_VERSION } from './news-radar.js';

const exposureInclude = {
  sourceArticle: { include: { source: true, translations: { where: { status: 'COMPLETED' as const } } } },
  supplier: true,
  factory: true,
  product: true,
  material: true,
  route: true,
  routePort: { include: { port: true } },
} satisfies Prisma.NewsRadarExposureInclude;

const briefInclude = {
  customer: { select: { id: true, name: true } },
  items: {
    include: { exposure: { include: exposureInclude } },
    orderBy: { position: 'asc' as const },
  },
} satisfies Prisma.DailyBriefInclude;

type BriefRecord = Prisma.DailyBriefGetPayload<{ include: typeof briefInclude }>;

function briefView(brief: BriefRecord) {
  return { ...brief, graphRevision: brief.graphRevision.toString() };
}
type BriefView = ReturnType<typeof briefView>;

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
  constructor(
    private readonly emailProvider: EmailProvider | null = configuredEmailProvider(),
    private readonly fromEmail = process.env.DAILY_BRIEF_FROM_EMAIL ?? '',
  ) {}

  async getPreference(customerId: string, userId: string) {
    const [preference, user] = await Promise.all([
      db.dailyBriefPreference.findUnique({ where: { userId_customerId: { userId, customerId } } }),
      db.user.findUnique({ where: { id: userId }, select: { email: true } }),
    ]);
    if (!user) throw new ServiceError('USER_NOT_FOUND', 'Application user not found', 404);
    return { ...(preference ?? { userId, customerId, enabled: false, deliveryTime: '08:00', timezone: 'UTC', email: user.email, language: 'en' }), emailConfigured: Boolean(this.emailProvider && this.fromEmail) };
  }

  async updatePreference(customerId: string, userId: string, input: DailyBriefPreferenceInput) {
    if (input.enabled && (!this.emailProvider || !this.fromEmail))
      throw new ServiceError('EMAIL_NOT_CONFIGURED', 'Daily Brief email delivery is not configured', 503);
    return db.dailyBriefPreference.upsert({
      where: { userId_customerId: { userId, customerId } },
      create: { userId, customerId, ...input },
      update: input,
    });
  }

  async latest(customerId: string) {
    const brief = await db.dailyBrief.findFirst({ where: { customerId }, include: briefInclude, orderBy: [{ briefDate: 'desc' }, { generatedAt: 'desc' }] });
    return brief ? briefView(brief) : null;
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
          policyVersion: NEWS_RADAR_POLICY_VERSION,
          relevanceLevel: { in: ['HIGH', 'MEDIUM'] },
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
    const preferences = await db.dailyBriefPreference.findMany({ where: { enabled: true } });
    const generated = new Map<string, BriefView>();
    let emailsSent = 0;
    let emailFailures = 0;
    for (const preference of preferences) {
      const local = localParts(now, preference.timezone);
      if (local.time < preference.deliveryTime) continue;
      const briefDate = utcDate(local.date);
      const existing = await db.dailyBrief.findUnique({ where: { customerId_briefDate: { customerId: preference.customerId, briefDate } }, select: { id: true } });
      const brief = existing
        ? await db.dailyBrief.findUniqueOrThrow({ where: { id: existing.id }, include: briefInclude }).then(briefView)
        : generated.get(preference.customerId) ?? await this.generate(preference.customerId, local.date);
      generated.set(preference.customerId, brief);
      const delivered = await db.dailyBriefDelivery.findUnique({ where: { preferenceId_briefId: { preferenceId: preference.id, briefId: brief.id } } });
      if (delivered?.status === 'SENT') continue;
      const delivery = await db.dailyBriefDelivery.upsert({
        where: { preferenceId_briefId: { preferenceId: preference.id, briefId: brief.id } },
        create: { preferenceId: preference.id, briefId: brief.id, customerId: preference.customerId, userId: preference.userId, email: preference.email, language: preference.language },
        update: { status: 'PENDING', email: preference.email, language: preference.language, errorCode: null },
      });
      if (!this.emailProvider || !this.fromEmail) {
        await db.dailyBriefDelivery.update({ where: { id: delivery.id }, data: { status: 'FAILED', errorCode: 'EMAIL_NOT_CONFIGURED' } });
        emailFailures++;
        continue;
      }
      try {
        const message = renderBriefEmail(brief, preference.language, preference.email, this.fromEmail);
        const sent = await this.emailProvider.send(message);
        await db.dailyBriefDelivery.update({ where: { id: delivery.id }, data: { status: 'SENT', provider: this.emailProvider.name, providerId: sent.id, sentAt: new Date() } });
        emailsSent++;
      } catch {
        await db.dailyBriefDelivery.update({ where: { id: delivery.id }, data: { status: 'FAILED', provider: this.emailProvider.name, errorCode: 'EMAIL_DELIVERY_FAILED' } });
        emailFailures++;
      }
    }
    return { preferencesChecked: preferences.length, briefsGenerated: generated.size, customerIds: [...generated.keys()], emailsSent, emailFailures };
  }
}

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function renderBriefEmail(brief: BriefView, language: string, to: string, from: string) {
  const rows = brief.items.map(({ exposure }) => {
    const translation = exposure.sourceArticle.translations.find((value) => value.targetLanguage === language);
    const title = translation?.translatedTitle ?? exposure.sourceArticle.title;
    const affected = exposure.supplier?.name ?? exposure.factory?.name ?? exposure.product?.name ?? exposure.material?.name ?? exposure.route?.name ?? exposure.routePort?.port.name ?? 'Supply-chain asset';
    return `<li><strong>${escapeHtml(title)}</strong><br>Affected: ${escapeHtml(affected)}<br>Why this matters: ${escapeHtml(exposure.reason)}<br><a href="${escapeHtml(exposure.sourceArticle.originalUrl)}">${escapeHtml(exposure.sourceArticle.source.name)}</a></li>`;
  }).join('');
  return {
    to,
    from,
    subject: `${brief.customer.name} Supply Chain Intelligence Brief`,
    html: `<h1>${escapeHtml(brief.customer.name)} Supply Chain Intelligence Brief</h1><h2>Top relevant developments</h2><ol>${rows || '<li>No HIGH or MEDIUM developments in this period.</li>'}</ol><p>Every item is linked to its original public source and deterministic customer-graph match. No automated decision or risk score is included.</p>`,
  };
}

function configuredEmailProvider(): EmailProvider | null {
  return process.env.DAILY_BRIEF_EMAIL_ENABLED === 'true' && process.env.RESEND_API_KEY ? new ResendEmailProvider(process.env.RESEND_API_KEY) : null;
}

export const dailyBriefService = new DailyBriefService();

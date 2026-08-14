import { z } from 'zod';

export const newsRadarTopics = [
  'GEOPOLITICAL',
  'ECONOMIC',
  'OPERATIONAL',
  'LOGISTICS',
  'ENVIRONMENTAL',
  'TRADE',
  'TECHNOLOGY',
] as const;

export const newsRadarEntityTypes = [
  'SUPPLIER',
  'FACTORY',
  'PRODUCT',
  'MATERIAL',
  'ROUTE',
  'PORT',
] as const;

export const newsRadarListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  topic: z.enum(newsRadarTopics).optional(),
  entityType: z.enum(newsRadarEntityTypes).optional(),
  search: z.string().trim().max(100).optional(),
});

export const newsRadarExposureParamsSchema = z.object({
  customerId: z.string().uuid(),
  exposureId: z.string().uuid(),
});

export const newsRadarArticleParamsSchema = z.object({
  articleId: z.string().uuid(),
});

function validTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export const newsletterPreferenceSchema = z.object({
  enabled: z.boolean(),
  deliveryTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().trim().min(1).max(100).refine(validTimezone, 'Invalid IANA timezone'),
  email: z.string().trim().email().max(320),
});

export const dailyBriefDateSchema = z.object({
  date: z.string().date().optional(),
});

export type NewsRadarListInput = z.infer<typeof newsRadarListSchema>;
export type NewsletterPreferenceInput = z.infer<typeof newsletterPreferenceSchema>;

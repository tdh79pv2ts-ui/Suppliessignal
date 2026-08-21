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

export const intelligenceLanguages = [
  'en',
  'nl',
  'de',
  'fr',
  'es',
  'zh',
  'ja',
  'ko',
  'vi',
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

export const dailyBriefPreferenceSchema = z.object({
  enabled: z.boolean(),
  deliveryTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().trim().min(1).max(100).refine(validTimezone, 'Invalid IANA timezone'),
  email: z.string().trim().email().max(320),
  language: z.enum(intelligenceLanguages),
});

export const newsletterPreferenceSchema = dailyBriefPreferenceSchema;

export const dailyBriefDateSchema = z.object({
  date: z.string().date().optional(),
});

export const monitoringTagTypes = ['AUTO', 'SUGGESTED', 'CUSTOM'] as const;
export const monitoringTagStatuses = ['PENDING', 'ACTIVE', 'DISABLED', 'IGNORED'] as const;
export const monitoringTagCategories = [
  'SUPPLIER', 'FACTORY', 'PRODUCT', 'MATERIAL', 'LOCATION', 'COUNTRY',
  'REGION', 'PORT', 'ROUTE', 'INDUSTRY', 'THEME',
] as const;

export const monitoringTagParamsSchema = z.object({
  customerId: z.string().uuid(),
  tagId: z.string().uuid(),
});

export const customMonitoringTagSchema = z.object({
  label: z.string().trim().min(2).max(100),
  category: z.enum(monitoringTagCategories).default('THEME'),
});

export const monitoringTagUpdateSchema = z.object({
  label: z.string().trim().min(2).max(100).optional(),
  category: z.enum(monitoringTagCategories).optional(),
  status: z.enum(monitoringTagStatuses).optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const customerSourceParamsSchema = z.object({
  customerId: z.string().uuid(),
  sourceId: z.string().uuid(),
});

export const customerSourcePreferenceSchema = z.object({ enabled: z.boolean() });

export const enableRecommendedSourcesSchema = z.object({
  country: z.string().trim().min(2).max(100).nullable().default(null),
});

export type NewsRadarListInput = z.infer<typeof newsRadarListSchema>;
export type DailyBriefPreferenceInput = z.infer<typeof dailyBriefPreferenceSchema>;
export type NewsletterPreferenceInput = DailyBriefPreferenceInput;
export type CustomMonitoringTagInput = z.infer<typeof customMonitoringTagSchema>;
export type MonitoringTagUpdateInput = z.infer<typeof monitoringTagUpdateSchema>;

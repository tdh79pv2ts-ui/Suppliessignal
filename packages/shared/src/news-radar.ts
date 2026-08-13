import { z } from 'zod';

export const newsRadarTopics = [
  'GEOPOLITICAL',
  'ECONOMIC',
  'OPERATIONAL',
  'LOGISTICS',
  'ENVIRONMENTAL',
  'TRADE',
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

export type NewsRadarListInput = z.infer<typeof newsRadarListSchema>;

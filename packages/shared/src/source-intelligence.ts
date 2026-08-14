import { z } from 'zod';

export const sourceTypes = ['RSS', 'ATOM', 'API', 'WEB', 'MANUAL'] as const;
export const sourceCategories = [
  'NEWS',
  'GOVERNMENT',
  'REGULATOR',
  'INDUSTRY',
  'PORT',
  'LOGISTICS',
  'LABOUR',
  'TRADE',
  'WEATHER',
  'OTHER',
] as const;
export const sourceReliabilities = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'PRIMARY',
] as const;
export const articleStatuses = [
  'COLLECTED',
  'NORMALIZED',
  'FAILED',
  'IGNORED',
] as const;
const webUrl = z
  .string()
  .url()
  .max(2048)
  .superRefine((value, context) => {
    if (!['http:', 'https:'].includes(new URL(value).protocol))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Only HTTP and HTTPS URLs are allowed',
      });
  });
const optionalText = z.string().trim().min(1).max(255).nullable().optional();

const sourceFieldsSchema = z.object({
  name: z.string().trim().min(1).max(255),
  sourceType: z.enum(sourceTypes),
  baseUrl: webUrl,
  feedUrl: webUrl.nullable().optional(),
  country: optionalText,
  region: optionalText,
  language: z
    .string()
    .regex(/^[a-z]{2,3}(-[A-Z]{2})?$/)
    .nullable()
    .optional(),
  category: z.enum(sourceCategories),
  reliability: z.enum(sourceReliabilities),
  active: z.boolean().default(true),
  collectionEnabled: z.boolean().default(false),
  collectionIntervalMinutes: z
    .number()
    .int()
    .min(5)
    .max(10080)
    .nullable()
    .optional()
    .default(15),
});
export const sourceConfigurationSchema = sourceFieldsSchema.superRefine(
  (value, context) => {
    if (['RSS', 'ATOM'].includes(value.sourceType) && !value.feedUrl)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['feedUrl'],
        message: 'Feed URL is required for RSS/Atom',
      });
  },
);
export const sourceCreateSchema = sourceConfigurationSchema;
export const sourceUpdateSchema = sourceFieldsSchema
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    'At least one field is required',
  );
export const manualArticleSchema = z.object({
  sourceId: z.string().uuid(),
  originalUrl: webUrl,
  title: z.string().trim().min(1).max(1000),
  publishedAt: z.string().datetime(),
  text: z.string().max(1_000_000).nullable().optional(),
  author: optionalText,
  language: optionalText,
});
export const sourceIdSchema = z.object({ sourceId: z.string().uuid() });
export const articleIdSchema = z.object({ articleId: z.string().uuid() });
export const sourceListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  active: z.enum(['true', 'false', 'all']).default('all'),
  collectionEnabled: z.enum(['true', 'false', 'all']).default('all'),
  sourceType: z.enum(sourceTypes).optional(),
  category: z.enum(sourceCategories).optional(),
  reliability: z.enum(sourceReliabilities).optional(),
  country: z.string().trim().optional(),
  health: z.enum(['HEALTHY', 'DEGRADED', 'FAILING', 'DISABLED']).optional(),
  search: z.string().trim().max(100).optional(),
});
export const articleListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  sourceId: z.string().uuid().optional(),
  language: z.string().optional(),
  status: z.enum(articleStatuses).optional(),
  search: z.string().trim().max(100).optional(),
  publishedFrom: z.coerce.date().optional(),
  publishedTo: z.coerce.date().optional(),
  collectedFrom: z.coerce.date().optional(),
  collectedTo: z.coerce.date().optional(),
});
export type SourceInput = z.infer<typeof sourceCreateSchema>;
export type ManualArticleInput = z.infer<typeof manualArticleSchema>;

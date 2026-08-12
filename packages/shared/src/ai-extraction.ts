import { z } from 'zod';
export const extractionArticleIdSchema = z.object({ articleId: z.string().uuid() });
export const extractionIdSchema = z.object({ extractionId: z.string().uuid() });
export const claimIdSchema = z.object({ claimId: z.string().uuid() });
export const extractionListSchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(50), status: z.enum(['PROCESSING','COMPLETED','PARTIAL','FAILED']).optional(), sourceId: z.string().uuid().optional(), model: z.string().trim().max(200).optional() });
export const claimListSchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(50), claimType: z.string().optional(), sourceId: z.string().uuid().optional(), extractionRunId: z.string().uuid().optional(), entityName: z.string().trim().max(200).optional(), location: z.string().trim().max(200).optional(), confidenceMin: z.coerce.number().min(0).max(1).optional(), confidenceMax: z.coerce.number().min(0).max(1).optional() });

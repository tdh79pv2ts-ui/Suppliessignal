import { z } from 'zod';

export const EXPOSURE_POLICY_VERSION = '1.0';
export const exposureNodeTypes = ['SUPPLIER', 'FACTORY', 'PRODUCT', 'MATERIAL', 'ROUTE', 'PORT'] as const;
export const identityStatuses = ['PROPOSED', 'VERIFIED', 'UNVERIFIED', 'REJECTED'] as const;
export const identityNamespaces = ['LEI', 'DUNS', 'VAT', 'UNLOCODE', 'IMO', 'CUSTOMER_MASTER'] as const;

const identifier = z.string().trim().min(1).max(160);
export const customerExposureListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['POTENTIAL', 'CONFIRMED', 'DISMISSED', 'STALE', 'RESOLVED']).optional(),
});
export const exposureIdSchema = z.object({ id: z.string().uuid() });
export const customerExposureIdSchema = z.object({ customerId: z.string().uuid(), id: z.string().uuid() });
export const identityIdSchema = z.object({ customerId: z.string().uuid(), identityId: z.string().uuid() });
export const candidateIdSchema = z.object({ customerId: z.string().uuid(), candidateId: z.string().uuid() });
export const globalIdentifierIdSchema = z.object({ id: z.string().uuid() });
export const graphIdentitySchema = z.object({
  subjectType: z.enum(exposureNodeTypes),
  subjectId: z.string().uuid(),
  namespace: z.enum(identityNamespaces),
  identifier,
  provenanceSource: z.string().trim().min(1).max(160),
  provenanceRef: z.string().trim().url().max(2000).nullable().optional(),
  evidenceNote: z.string().trim().max(2000).nullable().optional(),
  verificationStatus: z.enum(['UNVERIFIED', 'VERIFIED']).default('UNVERIFIED'),
});
export const eventIdentityProposalSchema = z.object({
  eventEntityId: z.string().uuid(),
  namespace: z.enum(identityNamespaces),
  identifier,
  sourceClaimId: z.string().uuid().nullable().optional(),
  provenanceSource: z.string().trim().min(1).max(160),
  provenanceRef: z.string().trim().url().max(2000).nullable().optional(),
  evidenceNote: z.string().trim().max(2000).nullable().optional(),
});
export const candidateReviewSchema = z.object({
  reasonCode: z.enum(['AMBIGUOUS_ENTITY_IDENTITY', 'AMBIGUOUS_LOCATION', 'NO_SUPPORTED_MATCH']),
  resultingIdentityId: z.string().uuid().optional(),
});

export const normalizeIdentifier = (value: string) =>
  value.normalize('NFKC').trim().toLocaleUpperCase('en-US').replace(/\s+/g, ' ');

export type CustomerExposureListInput = z.infer<typeof customerExposureListSchema>;
export type GraphIdentityInput = z.infer<typeof graphIdentitySchema>;
export type EventIdentityProposalInput = z.infer<typeof eventIdentityProposalSchema>;

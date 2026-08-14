import { z } from 'zod';

export const criticalities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const supplierTiers = ['TIER_1', 'TIER_2', 'TIER_3', 'OTHER'] as const;
export const transportModes = ['ROAD', 'RAIL', 'SEA', 'AIR', 'MULTIMODAL', 'OTHER'] as const;

const optionalText = z.string().trim().min(1).max(255).nullable().optional();
const requiredText = z.string().trim().min(1).max(255);
const active = z.boolean().optional();
const sourceUrl = z.string().trim().url().refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), 'Source URL must use HTTP or HTTPS');
export const entityProvenanceSchema = z.object({
  sourceName: requiredText,
  sourceUrl,
  verifiedAt: z.coerce.date(),
});
export const relationshipProvenanceSchema = z.object({
  sourceName: requiredText,
  sourceUrl,
  collectedAt: z.coerce.date(),
  confidence: z.number().min(0).max(1),
});
const optionalEntityProvenance = entityProvenanceSchema.partial();

export const coordinateSchema = z.object({
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
});

const entityBaseSchema = z.object({ criticality: z.enum(criticalities), active }).merge(optionalEntityProvenance);

export const companyCreateSchema = z.object({
  name: requiredText,
  legalName: optionalText,
  country: optionalText,
  location: optionalText,
  category: optionalText,
  active,
}).merge(entityProvenanceSchema);
export const companyUpdateSchema = companyCreateSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const supplierCreateSchema = entityBaseSchema.extend({
  name: requiredText,
  legalName: optionalText,
  country: requiredText,
  city: optionalText,
  latitude: coordinateSchema.shape.latitude,
  longitude: coordinateSchema.shape.longitude,
  supplierType: optionalText,
  category: optionalText,
  tier: z.enum(supplierTiers),
});
export const supplierUpdateSchema = supplierCreateSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required');

const factoryFieldsSchema = entityBaseSchema.extend({
  supplierId: z.string().uuid().nullable().optional(),
  name: requiredText,
  address: z.string().trim().min(1).max(500).nullable().optional(),
  country: requiredText,
  city: optionalText,
  latitude: coordinateSchema.shape.latitude,
  longitude: coordinateSchema.shape.longitude,
  productionType: optionalText,
  category: optionalText,
  supplierRelationSourceName: optionalText,
  supplierRelationSourceUrl: sourceUrl.nullable().optional(),
  supplierRelationCollectedAt: z.coerce.date().nullable().optional(),
  supplierRelationConfidence: z.number().min(0).max(1).nullable().optional(),
});
const supplierRelationshipIsSourced = (value: Record<string, unknown>) => !value.supplierId || Boolean(value.supplierRelationSourceName && value.supplierRelationSourceUrl && value.supplierRelationCollectedAt && typeof value.supplierRelationConfidence === 'number');
export const factoryCreateSchema = factoryFieldsSchema.refine(supplierRelationshipIsSourced, { message: 'A supplier relationship requires source, URL, collection date, and confidence' });
export const factoryUpdateSchema = factoryFieldsSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required').refine(supplierRelationshipIsSourced, { message: 'A supplier relationship requires source, URL, collection date, and confidence' });

export const productCreateSchema = entityBaseSchema.extend({
  name: requiredText,
  sku: optionalText,
  category: optionalText,
  description: z.string().trim().min(1).max(2000).nullable().optional(),
  country: optionalText,
  location: optionalText,
});
export const productUpdateSchema = productCreateSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const materialCreateSchema = entityBaseSchema.extend({
  name: requiredText,
  category: optionalText,
  commodity: optionalText,
  country: optionalText,
  location: optionalText,
  substitutable: z.boolean().default(false),
});
export const materialUpdateSchema = materialCreateSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const routeCreateSchema = entityBaseSchema.extend({
  name: requiredText,
  originLabel: requiredText,
  destinationLabel: requiredText,
  transportMode: z.enum(transportModes),
  country: optionalText,
  location: optionalText,
  category: optionalText,
});
export const routeUpdateSchema = routeCreateSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const portCreateSchema = z.object({
  name: requiredText,
  country: requiredText,
  city: optionalText,
  latitude: coordinateSchema.shape.latitude,
  longitude: coordinateSchema.shape.longitude,
  portCode: z.string().trim().min(2).max(12).toUpperCase().nullable().optional(),
  location: optionalText,
  category: optionalText,
  ...optionalEntityProvenance.shape,
  active,
});
export const portUpdateSchema = portCreateSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required');
export const customerPortCreateSchema = portCreateSchema.extend({
  routeId: z.string().uuid(),
  sequence: z.number().int().min(1),
  ...relationshipProvenanceSchema.shape,
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  active: z.enum(['true', 'false', 'all']).default('true'),
  search: z.string().trim().max(100).optional(),
  country: z.string().trim().min(1).max(100).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  criticality: z.enum(criticalities).optional(),
  tier: z.enum(supplierTiers).optional(),
  transportMode: z.enum(transportModes).optional(),
  supplierId: z.string().uuid().optional(),
});

export const entityIdParamsSchema = z.object({ customerId: z.string().uuid(), id: z.string().uuid() });
export const customerParamsSchema = z.object({ customerId: z.string().uuid() });
export const relationshipSchema = z.object({ targetId: z.string().uuid(), ...relationshipProvenanceSchema.shape });
export const routePortSchema = z.object({ portId: z.string().uuid(), sequence: z.number().int().min(1), ...relationshipProvenanceSchema.shape });
export const routePortReorderSchema = z.object({ ports: z.array(z.object({ portId: z.string().uuid(), sequence: z.number().int().min(1) })).min(1) }).superRefine((value, context) => {
  if (new Set(value.ports.map((item) => item.portId)).size !== value.ports.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Port IDs must be unique' });
  if (new Set(value.ports.map((item) => item.sequence)).size !== value.ports.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Sequences must be unique' });
});

export type SupplierInput = z.infer<typeof supplierCreateSchema>;
export type CompanyInput = z.infer<typeof companyCreateSchema>;
export type FactoryInput = z.infer<typeof factoryCreateSchema>;
export type ProductInput = z.infer<typeof productCreateSchema>;
export type MaterialInput = z.infer<typeof materialCreateSchema>;
export type RouteInput = z.infer<typeof routeCreateSchema>;
export type PortInput = z.infer<typeof portCreateSchema>;

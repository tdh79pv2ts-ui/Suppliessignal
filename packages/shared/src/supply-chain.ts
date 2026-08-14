import { z } from 'zod';

export const criticalities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const supplierTiers = ['TIER_1', 'TIER_2', 'TIER_3', 'OTHER'] as const;
export const transportModes = ['ROAD', 'RAIL', 'SEA', 'AIR', 'MULTIMODAL', 'OTHER'] as const;

const optionalText = z.string().trim().min(1).max(255).nullable().optional();
const requiredText = z.string().trim().min(1).max(255);
const active = z.boolean().optional();

export const coordinateSchema = z.object({
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
});

const entityBaseSchema = z.object({ criticality: z.enum(criticalities), active });

export const supplierCreateSchema = entityBaseSchema.extend({
  name: requiredText,
  legalName: optionalText,
  country: requiredText,
  city: optionalText,
  latitude: coordinateSchema.shape.latitude,
  longitude: coordinateSchema.shape.longitude,
  supplierType: optionalText,
  tier: z.enum(supplierTiers),
});
export const supplierUpdateSchema = supplierCreateSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const factoryCreateSchema = entityBaseSchema.extend({
  supplierId: z.string().uuid().nullable().optional(),
  name: requiredText,
  address: z.string().trim().min(1).max(500).nullable().optional(),
  country: requiredText,
  city: optionalText,
  latitude: coordinateSchema.shape.latitude,
  longitude: coordinateSchema.shape.longitude,
  productionType: optionalText,
});
export const factoryUpdateSchema = factoryCreateSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const productCreateSchema = entityBaseSchema.extend({
  name: requiredText,
  sku: optionalText,
  category: optionalText,
  description: z.string().trim().min(1).max(2000).nullable().optional(),
});
export const productUpdateSchema = productCreateSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const materialCreateSchema = entityBaseSchema.extend({
  name: requiredText,
  category: optionalText,
  commodity: optionalText,
  substitutable: z.boolean().default(false),
});
export const materialUpdateSchema = materialCreateSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const routeCreateSchema = entityBaseSchema.extend({
  name: requiredText,
  originLabel: requiredText,
  destinationLabel: requiredText,
  transportMode: z.enum(transportModes),
});
export const routeUpdateSchema = routeCreateSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const portCreateSchema = z.object({
  name: requiredText,
  country: requiredText,
  city: optionalText,
  latitude: coordinateSchema.shape.latitude,
  longitude: coordinateSchema.shape.longitude,
  portCode: z.string().trim().min(2).max(12).toUpperCase().nullable().optional(),
  active,
});
export const portUpdateSchema = portCreateSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required');
export const customerPortCreateSchema = portCreateSchema.extend({
  routeId: z.string().uuid(),
  sequence: z.number().int().min(1),
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
export const relationshipSchema = z.object({ targetId: z.string().uuid() });
export const routePortSchema = z.object({ portId: z.string().uuid(), sequence: z.number().int().min(1) });
export const routePortReorderSchema = z.object({ ports: z.array(routePortSchema).min(1) }).superRefine((value, context) => {
  if (new Set(value.ports.map((item) => item.portId)).size !== value.ports.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Port IDs must be unique' });
  if (new Set(value.ports.map((item) => item.sequence)).size !== value.ports.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Sequences must be unique' });
});

export type SupplierInput = z.infer<typeof supplierCreateSchema>;
export type FactoryInput = z.infer<typeof factoryCreateSchema>;
export type ProductInput = z.infer<typeof productCreateSchema>;
export type MaterialInput = z.infer<typeof materialCreateSchema>;
export type RouteInput = z.infer<typeof routeCreateSchema>;
export type PortInput = z.infer<typeof portCreateSchema>;

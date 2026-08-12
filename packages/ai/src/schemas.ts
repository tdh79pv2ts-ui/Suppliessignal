import { z } from 'zod';

export const CLAIM_EXTRACTION_SCHEMA_VERSION = '1.0';
export const claimTypes = ['LABOUR_DISRUPTION','STRIKE','FACTORY_DISRUPTION','FACTORY_CLOSURE','PORT_DISRUPTION','LOGISTICS_DISRUPTION','TRANSPORT_DISRUPTION','WEATHER_DISRUPTION','NATURAL_HAZARD','FIRE','FLOOD','EARTHQUAKE','CYCLONE','TYPHOON','POLITICAL_DISRUPTION','CIVIL_UNREST','TRADE_RESTRICTION','IMPORT_RESTRICTION','EXPORT_RESTRICTION','SANCTION','REGULATORY_CHANGE','CUSTOMS_CHANGE','TARIFF_CHANGE','MATERIAL_SHORTAGE','ENERGY_DISRUPTION','INFRASTRUCTURE_DISRUPTION','SECURITY_INCIDENT','OTHER'] as const;
export const assertionModes = ['OBSERVED','REPORTED','ANNOUNCED','FORECAST','PLANNED','ESTIMATED'] as const;
export const entityTypes = ['ORGANIZATION','COMPANY','GOVERNMENT','REGULATOR','INDUSTRY_ASSOCIATION','LABOUR_UNION','FACTORY','PORT','AIRPORT','CITY','REGION','COUNTRY','PRODUCT','MATERIAL','COMMODITY','TRANSPORT_ROUTE','OTHER'] as const;
const confidence = z.number().finite().min(0).max(1);
const date = z.string().datetime().nullable().optional();
export const extractionOutputSchema = z.object({
  articleRelevant: z.boolean(),
  claims: z.array(z.object({
    claimType: z.enum(claimTypes), assertionMode: z.enum(assertionModes),
    statement: z.string().trim().min(1).max(2000), confidence,
    occurredAt: date, validFrom: date, validUntil: date,
    evidenceText: z.string().min(1).max(4000),
    entities: z.array(z.object({ entityType: z.enum(entityTypes), name: z.string().trim().min(1).max(500), normalizedName: z.string().trim().min(1).max(500).nullable().optional(), role: z.string().trim().min(1).max(200).nullable().optional(), confidence: confidence.nullable().optional() }).strict()).max(25).default([]),
    locations: z.array(z.object({ name: z.string().trim().min(1).max(500), country: z.string().trim().min(1).max(200).nullable().optional(), region: z.string().trim().min(1).max(200).nullable().optional(), city: z.string().trim().min(1).max(200).nullable().optional(), confidence: confidence.nullable().optional() }).strict()).max(25).default([]),
  }).strict()).max(25),
}).strict();
export type ExtractionOutput = z.infer<typeof extractionOutputSchema>;

import { z } from 'zod';

export const eventTypes = [
  'FACTORY_DISRUPTION',
  'FACTORY_CLOSURE',
  'FACTORY_EXPANSION',
  'PRODUCTION_REDUCTION',
  'PRODUCTION_INCREASE',
  'PORT_DISRUPTION',
  'PORT_CLOSURE',
  'PORT_CONGESTION',
  'SHIPPING_DISRUPTION',
  'LOGISTICS_DISRUPTION',
  'STRIKE',
  'LABOR_DISRUPTION',
  'NATURAL_HAZARD',
  'WEATHER_DISRUPTION',
  'FIRE',
  'EXPLOSION',
  'ACCIDENT',
  'POWER_OUTAGE',
  'CYBER_INCIDENT',
  'REGULATORY_CHANGE',
  'TRADE_RESTRICTION',
  'SANCTION',
  'TARIFF_CHANGE',
  'EXPORT_RESTRICTION',
  'IMPORT_RESTRICTION',
  'SUPPLIER_DISRUPTION',
  'MATERIAL_SHORTAGE',
  'CAPACITY_CHANGE',
  'OTHER',
] as const;
export const eventTypeSchema = z.enum(eventTypes);
export const eventStatusSchema = z.enum([
  'DETECTED',
  'ACTIVE',
  'RESOLVED',
  'CANCELLED',
]);
export const eventSeveritySchema = z.enum([
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
]);
export const eventEntityTypeSchema = z.enum([
  'SUPPLIER',
  'COMPANY',
  'FACTORY',
  'PORT',
  'AIRPORT',
  'WAREHOUSE',
  'DISTRIBUTION_CENTER',
  'MATERIAL',
  'PRODUCT',
  'TRANSPORT_ROUTE',
  'VESSEL',
  'REGION',
  'COUNTRY',
  'OTHER',
]);
export const eventMatchDecisionSchema = z.enum([
  'CREATE_NEW',
  'MATCH_EXISTING',
  'AMBIGUOUS',
]);
export const eventIdSchema = z.object({ eventId: z.string().uuid() });
export const processClaimParamsSchema = z.object({
  claimId: z.string().uuid(),
});
export const eventListSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    eventType: eventTypeSchema.optional(),
    status: eventStatusSchema.optional(),
    severity: eventSeveritySchema.optional(),
    assertionMode: z
      .enum([
        'OBSERVED',
        'REPORTED',
        'ANNOUNCED',
        'FORECAST',
        'PLANNED',
        'ESTIMATED',
      ])
      .optional(),
    country: z.string().trim().min(1).max(100).optional(),
    location: z.string().trim().min(1).max(160).optional(),
    entity: z.string().trim().min(1).max(200).optional(),
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
  })
  .refine(
    (value) =>
      !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo,
    { message: 'dateFrom must not be after dateTo' },
  );
export const eventStatusUpdateSchema = z.object({ status: eventStatusSchema });

export type EventTypeValue = z.infer<typeof eventTypeSchema>;
export type EventStatusValue = z.infer<typeof eventStatusSchema>;
export type EventSeverityValue = z.infer<typeof eventSeveritySchema>;
export type EventMatchDecisionValue = z.infer<typeof eventMatchDecisionSchema>;
export type EventListInput = z.infer<typeof eventListSchema>;

const claimTypeMap: Record<string, EventTypeValue> = {
  LABOUR_DISRUPTION: 'LABOR_DISRUPTION',
  STRIKE: 'STRIKE',
  FACTORY_DISRUPTION: 'FACTORY_DISRUPTION',
  FACTORY_CLOSURE: 'FACTORY_CLOSURE',
  PORT_DISRUPTION: 'PORT_DISRUPTION',
  LOGISTICS_DISRUPTION: 'LOGISTICS_DISRUPTION',
  TRANSPORT_DISRUPTION: 'SHIPPING_DISRUPTION',
  WEATHER_DISRUPTION: 'WEATHER_DISRUPTION',
  NATURAL_HAZARD: 'NATURAL_HAZARD',
  FIRE: 'FIRE',
  FLOOD: 'NATURAL_HAZARD',
  EARTHQUAKE: 'NATURAL_HAZARD',
  CYCLONE: 'WEATHER_DISRUPTION',
  TYPHOON: 'WEATHER_DISRUPTION',
  POLITICAL_DISRUPTION: 'SUPPLIER_DISRUPTION',
  CIVIL_UNREST: 'SUPPLIER_DISRUPTION',
  TRADE_RESTRICTION: 'TRADE_RESTRICTION',
  IMPORT_RESTRICTION: 'IMPORT_RESTRICTION',
  EXPORT_RESTRICTION: 'EXPORT_RESTRICTION',
  SANCTION: 'SANCTION',
  REGULATORY_CHANGE: 'REGULATORY_CHANGE',
  CUSTOMS_CHANGE: 'REGULATORY_CHANGE',
  TARIFF_CHANGE: 'TARIFF_CHANGE',
  MATERIAL_SHORTAGE: 'MATERIAL_SHORTAGE',
  ENERGY_DISRUPTION: 'POWER_OUTAGE',
  INFRASTRUCTURE_DISRUPTION: 'LOGISTICS_DISRUPTION',
  SECURITY_INCIDENT: 'CYBER_INCIDENT',
};
export function claimTypeToEventType(claimType: string): EventTypeValue | null {
  return claimTypeMap[claimType] ?? null;
}

export function normalizeEventText(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/\s+/g, ' ');
}
const entityMap: Record<string, z.infer<typeof eventEntityTypeSchema>> = {
  ORGANIZATION: 'COMPANY',
  COMPANY: 'COMPANY',
  FACTORY: 'FACTORY',
  PORT: 'PORT',
  AIRPORT: 'AIRPORT',
  PRODUCT: 'PRODUCT',
  MATERIAL: 'MATERIAL',
  COMMODITY: 'MATERIAL',
  TRANSPORT_ROUTE: 'TRANSPORT_ROUTE',
  REGION: 'REGION',
  COUNTRY: 'COUNTRY',
};
export function normalizeEventEntity(entity: {
  entityType: string;
  name: string;
  normalizedName?: string | null;
  role?: string | null;
}) {
  const entityType = entityMap[entity.entityType] ?? 'OTHER';
  const normalizedName = normalizeEventText(
    entity.normalizedName ?? entity.name,
  );
  return {
    entityType,
    name: entity.name.trim(),
    normalizedName,
    normalizedKey: `${entityType}:${normalizedName}`,
    role: entity.role ?? null,
  };
}
export function normalizeEventLocation(location: {
  name: string;
  country?: string | null;
  region?: string | null;
  city?: string | null;
}) {
  const name = location.name.trim();
  const country = location.country?.trim() || null;
  const region = location.region?.trim() || null;
  const city = location.city?.trim() || null;
  const normalizedKey = [country, region, city, name]
    .map((value) => normalizeEventText(value ?? ''))
    .join(':');
  const locationType: 'CITY' | 'REGION' | 'COUNTRY' | 'OTHER' = city
    ? 'CITY'
    : region
      ? 'REGION'
      : country && normalizeEventText(name) === normalizeEventText(country)
        ? 'COUNTRY'
        : 'OTHER';
  return { name, country, region, city, normalizedKey, locationType };
}
export function temporalBucket(value: Date | null | undefined): string {
  return value ? value.toISOString().slice(0, 10) : 'unknown';
}
export function buildEventFingerprint(input: {
  eventType: EventTypeValue;
  assertionMode: string;
  primaryEntityKey?: string | null;
  primaryLocationKey?: string | null;
  eventDate?: Date | null;
}) {
  return [
    eventTypes.includes(input.eventType) ? input.eventType : 'OTHER',
    input.assertionMode,
    input.primaryEntityKey ?? 'no-entity',
    input.primaryLocationKey ?? 'no-location',
    temporalBucket(input.eventDate),
  ].join('|');
}
export function buildEventLockKey(input: {
  eventType: EventTypeValue;
  assertionMode: string;
  primaryEntityKey?: string | null;
  primaryLocationKey?: string | null;
}) {
  return [
    input.eventType,
    input.assertionMode,
    input.primaryEntityKey ?? 'no-entity',
    input.primaryLocationKey ?? 'no-location',
  ].join('|');
}

export type EventCandidate = {
  id: string;
  fingerprint: string;
  eventType: string;
  assertionMode: string;
  startDate: Date | null;
  occurredAt: Date | null;
  entities: { normalizedKey: string }[];
  locations: { normalizedKey: string }[];
};
export function matchEvent(
  input: {
    fingerprint: string;
    eventType: string;
    assertionMode: string;
    eventDate: Date | null;
    entityKeys: string[];
    locationKeys: string[];
  },
  candidates: EventCandidate[],
): {
  decision: EventMatchDecisionValue;
  eventId?: string;
  candidateEventIds: string[];
  reason: string;
} {
  const exact = candidates.find(
    (candidate) => candidate.fingerprint === input.fingerprint,
  );
  if (exact)
    return {
      decision: 'MATCH_EXISTING',
      eventId: exact.id,
      candidateEventIds: [exact.id],
      reason: 'Exact deterministic fingerprint',
    };
  const close = candidates.filter((candidate) => {
    if (
      candidate.eventType !== input.eventType ||
      candidate.assertionMode !== input.assertionMode
    )
      return false;
    const candidateDate = candidate.occurredAt ?? candidate.startDate;
    if (
      input.eventDate &&
      candidateDate &&
      Math.abs(input.eventDate.getTime() - candidateDate.getTime()) >
        3 * 86_400_000
    )
      return false;
    if (Boolean(input.eventDate) !== Boolean(candidateDate)) return false;
    const entityMatch = input.entityKeys.length
      ? candidate.entities.some((entity) =>
          input.entityKeys.includes(entity.normalizedKey),
        )
      : true;
    const locationMatch = input.locationKeys.length
      ? candidate.locations.some((location) =>
          input.locationKeys.includes(location.normalizedKey),
        )
      : true;
    return entityMatch && locationMatch;
  });
  if (close.length === 1)
    return {
      decision: 'MATCH_EXISTING',
      eventId: close[0]!.id,
      candidateEventIds: [close[0]!.id],
      reason: 'Unique entity/location/temporal candidate',
    };
  if (close.length > 1)
    return {
      decision: 'AMBIGUOUS',
      candidateEventIds: close.map((candidate) => candidate.id),
      reason: 'Multiple conservative candidates',
    };
  return {
    decision: 'CREATE_NEW',
    candidateEventIds: [],
    reason: 'No compatible candidate',
  };
}

export function claimEligibility(input: {
  extractionStatus: string;
  claimType: string;
  confidence: number;
  evidenceText: string;
  entityCount: number;
  locationCount: number;
}) {
  if (input.extractionStatus !== 'COMPLETED')
    return { eligible: false, code: 'EXTRACTION_NOT_SUCCESSFUL' } as const;
  if (!claimTypeToEventType(input.claimType))
    return { eligible: false, code: 'UNSUPPORTED_CLAIM_TYPE' } as const;
  if (input.confidence < 0.6)
    return { eligible: false, code: 'CLAIM_CONFIDENCE_TOO_LOW' } as const;
  if (!input.evidenceText.trim())
    return { eligible: false, code: 'CLAIM_EVIDENCE_REQUIRED' } as const;
  if (input.entityCount === 0 && input.locationCount === 0)
    return { eligible: false, code: 'CLAIM_CONTEXT_REQUIRED' } as const;
  return { eligible: true, code: 'ELIGIBLE' } as const;
}

const critical = new Set<EventTypeValue>([
  'PORT_CLOSURE',
  'FACTORY_CLOSURE',
  'EXPLOSION',
]);
const high = new Set<EventTypeValue>([
  'PORT_DISRUPTION',
  'PORT_CONGESTION',
  'SHIPPING_DISRUPTION',
  'STRIKE',
  'NATURAL_HAZARD',
  'FIRE',
  'POWER_OUTAGE',
  'CYBER_INCIDENT',
  'TRADE_RESTRICTION',
  'SANCTION',
  'EXPORT_RESTRICTION',
  'IMPORT_RESTRICTION',
  'MATERIAL_SHORTAGE',
]);
export function calculateEventSeverity(
  eventType: EventTypeValue,
  locationCount: number,
): EventSeverityValue {
  if (critical.has(eventType) && locationCount > 1) return 'CRITICAL';
  if (critical.has(eventType) || high.has(eventType)) return 'HIGH';
  if (eventType === 'OTHER') return 'LOW';
  return 'MEDIUM';
}

export type ConfidenceClaim = {
  confidence: number;
  articleId: string;
  sourceId: string;
  conflicting: boolean;
};
export function aggregateEventConfidence(claims: ConfidenceClaim[]): number {
  if (!claims.length) return 0;
  const strongest = Math.max(...claims.map((claim) => claim.confidence));
  const sources = new Set(claims.map((claim) => claim.sourceId)).size;
  const articles = new Set(claims.map((claim) => claim.articleId)).size;
  const sourceBoost = Math.min(0.15, Math.max(0, sources - 1) * 0.05);
  const sameSourceArticleBoost = Math.min(
    0.06,
    Math.max(0, articles - sources) * 0.02,
  );
  const conflictPenalty = claims.some((claim) => claim.conflicting) ? 0.2 : 0;
  return Math.max(
    0,
    Math.min(
      0.99,
      Number(
        (
          strongest +
          sourceBoost +
          sameSourceArticleBoost -
          conflictPenalty
        ).toFixed(3),
      ),
    ),
  );
}
const conflictPattern =
  /\b(cancel(?:led|ed)|resolved|reopened|remains? (?:open|operational)|no (?:strike|closure|disruption))\b/i;
export function claimSignalsConflict(statement: string): boolean {
  return conflictPattern.test(statement);
}

const transitions: Record<EventStatusValue, EventStatusValue[]> = {
  DETECTED: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['RESOLVED', 'CANCELLED'],
  RESOLVED: ['ACTIVE'],
  CANCELLED: [],
};
export function canTransitionEventStatus(
  from: EventStatusValue,
  to: EventStatusValue,
): boolean {
  return from === to || transitions[from].includes(to);
}

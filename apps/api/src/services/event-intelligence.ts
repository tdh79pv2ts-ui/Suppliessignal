import { randomUUID } from 'node:crypto';
import { db, type Prisma } from '@suppliesignal/db';
import {
  aggregateEventConfidence,
  buildEventFingerprint,
  buildEventLockKey,
  calculateEventSeverity,
  canTransitionEventStatus,
  classifyClaimSignal,
  claimEligibility,
  createEventPolicy,
  claimTypeToEventType,
  matchEvent,
  normalizeEventEntity,
  normalizeEventLocation,
  supportingClaimsConflict,
  type EventPolicy,
  type EventListInput,
  type EventStatusValue,
} from '@suppliesignal/shared';
import { ServiceError } from './errors.js';

const LEASE_MS = 5 * 60 * 1000;
const detailInclude = {
  entities: true,
  locations: true,
  claimLinks: {
    orderBy: { attachedAt: 'asc' },
    include: {
      claim: {
        include: {
          entities: true,
          locations: true,
          extractionRun: true,
          sourceArticle: { include: { source: true } },
        },
      },
    },
  },
} as const;
const primaryEntity = (entities: ReturnType<typeof normalizeEventEntity>[]) =>
  [...entities].sort((a, b) =>
    a.normalizedKey.localeCompare(b.normalizedKey),
  )[0];
const primaryLocation = (
  locations: ReturnType<typeof normalizeEventLocation>[],
) =>
  [...locations].sort((a, b) =>
    a.normalizedKey.localeCompare(b.normalizedKey),
  )[0];
const seenAt = (claim: {
  sourceArticle: { publishedAt: Date | null; collectedAt: Date };
}) => claim.sourceArticle.publishedAt ?? claim.sourceArticle.collectedAt;

export class EventIntelligenceService {
  readonly policy: EventPolicy;

  constructor(policy: EventPolicy = createEventPolicy()) {
    this.policy = policy;
  }

  async processClaim(claimId: string) {
    const claim = await db.claim.findUnique({
      where: { id: claimId },
      include: {
        entities: true,
        locations: true,
        extractionRun: true,
        sourceArticle: { include: { source: true } },
        eventLinks: true,
        eventProcessing: true,
      },
    });
    if (!claim)
      throw new ServiceError('CLAIM_NOT_FOUND', 'Claim not found', 404);
    if (claim.eventLinks[0]) {
      const event = await this.getEvent(claim.eventLinks[0].eventId);
      return {
        ...event,
        processingMetadata: processingMetadata(),
      };
    }
    if (claim.eventProcessing?.status === 'SKIPPED')
      return {
        status: 'SKIPPED',
        reason: claim.eventProcessing.errorCode,
        claimId,
        processingMetadata: processingMetadata({ claimsSkipped: 1 }),
      };
    const ownerToken = randomUUID();
    const acquired = await db.$queryRaw<
      { claim_id: string }[]
    >`INSERT INTO claim_event_processing (claim_id,status,owner_token,lease_expires_at,attempts,created_at,updated_at) VALUES (${claimId}::uuid,'PROCESSING',${ownerToken}::uuid,CURRENT_TIMESTAMP + (${LEASE_MS} * INTERVAL '1 millisecond'),1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT (claim_id) DO UPDATE SET status='PROCESSING',owner_token=EXCLUDED.owner_token,lease_expires_at=EXCLUDED.lease_expires_at,attempts=claim_event_processing.attempts+1,error_code=NULL,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE (claim_event_processing.status IN ('PENDING','FAILED') AND (claim_event_processing.next_attempt_at IS NULL OR claim_event_processing.next_attempt_at<=CURRENT_TIMESTAMP)) OR (claim_event_processing.status='PROCESSING' AND claim_event_processing.lease_expires_at<=CURRENT_TIMESTAMP) RETURNING claim_id`;
    if (!acquired.length)
      throw new ServiceError(
        'EVENT_PROCESSING_ALREADY_RUNNING',
        'Claim event processing is already running or complete',
        409,
      );
    const eligibility = claimEligibility(
      {
        extractionStatus: claim.extractionRun.status,
        claimType: claim.claimType,
        confidence: Number(claim.confidence),
        evidenceText: claim.evidenceText,
        entityCount: claim.entities.length,
        locationCount: claim.locations.length,
      },
      this.policy,
    );
    if (!eligibility.eligible) {
      await db.claimEventProcessing.update({
        where: { claimId },
        data: {
          status: 'SKIPPED',
          processedAt: new Date(),
          ownerToken: null,
          leaseExpiresAt: null,
          errorCode: eligibility.code,
          errorMessage: 'Claim did not meet deterministic event eligibility',
        },
      });
      return {
        status: 'SKIPPED',
        reason: eligibility.code,
        claimId,
        processingMetadata: processingMetadata({ claimsSkipped: 1 }),
      };
    }
    const eventType = claimTypeToEventType(claim.claimType)!;
    const entities = claim.entities.map(normalizeEventEntity);
    const locations = claim.locations.map(normalizeEventLocation);
    const entity = primaryEntity(entities);
    const location = primaryLocation(locations);
    const eventDate = claim.occurredAt ?? claim.validFrom;
    const fingerprint = buildEventFingerprint({
      eventType,
      assertionMode: claim.assertionMode,
      primaryEntityKey: entity?.normalizedKey ?? null,
      primaryLocationKey: location?.normalizedKey ?? null,
      eventDate,
      fingerprintVersion: this.policy.fingerprintVersion,
    });
    const lockKey = buildEventLockKey({
      eventType,
      assertionMode: claim.assertionMode,
      primaryEntityKey: entity?.normalizedKey ?? null,
      primaryLocationKey: location?.normalizedKey ?? null,
    });
    const observed = seenAt(claim);
    try {
      const result = await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${lockKey}))`;
        const candidates = await tx.event.findMany({
          where: {
            eventType,
            assertionMode: claim.assertionMode,
            policyVersion: this.policy.version,
          },
          take: 50,
          orderBy: { lastSeenAt: 'desc' },
          include: {
            entities: { select: { normalizedKey: true } },
            locations: { select: { normalizedKey: true } },
          },
        });
        const match = matchEvent(
          {
            fingerprint,
            eventType,
            assertionMode: claim.assertionMode,
            eventDate,
            entityKeys: entities.map((value) => value.normalizedKey),
            locationKeys: locations.map((value) => value.normalizedKey),
          },
          candidates,
          this.policy,
        );
        let eventId = match.eventId;
        const eventCreated = !eventId;
        if (!eventId) {
          const title = `${eventType.replaceAll('_', ' ')} — ${entity?.name ?? location?.name ?? 'Unspecified context'}`;
          const created = await tx.event.upsert({
            where: { fingerprint },
            update: {},
            create: {
              eventType,
              status: 'DETECTED',
              title,
              summary: claim.statement,
              severity: calculateEventSeverity(eventType, locations.length),
              confidence: claim.confidence,
              assertionMode: claim.assertionMode,
              startDate: claim.validFrom,
              endDate: claim.validUntil,
              occurredAt: claim.occurredAt,
              observedAt: observed,
              temporalPrecision: eventDate
                ? claim.validUntil
                  ? 'RANGE'
                  : 'DAY'
                : 'UNKNOWN',
              firstSeenAt: observed,
              lastSeenAt: observed,
              fingerprint,
              policyVersion: this.policy.version,
              entities: { create: entities },
              locations: { create: locations },
            },
          });
          eventId = created.id;
        } else {
          const addedEntities = await tx.eventEntity.createMany({
            data: entities.map((value) => ({ ...value, eventId: eventId! })),
            skipDuplicates: true,
          });
          const addedLocations = await tx.eventLocation.createMany({
            data: locations.map((value) => ({ ...value, eventId: eventId! })),
            skipDuplicates: true,
          });
          if (addedEntities.count > 0 || addedLocations.count > 0)
            await tx.event.update({
              where: { id: eventId },
              data: { exposureVersion: { increment: 1 } },
            });
        }
        const conflictWasDetected = eventCreated
          ? false
          : (
              await tx.event.findUniqueOrThrow({
                where: { id: eventId },
                select: { conflictState: true },
              })
            ).conflictState === 'DETECTED';
        await tx.eventClaim.upsert({
          where: { eventId_claimId: { eventId, claimId } },
          update: {},
          create: {
            eventId,
            claimId,
            matchDecision: match.decision,
            matchReason: match.reason,
            claimSignal: classifyClaimSignal(claim.statement),
          },
        });
        const links = await tx.eventClaim.findMany({
          where: { eventId },
          include: { claim: { include: { sourceArticle: true } } },
        });
        const signals = links.map((link) => link.claimSignal);
        const conflict = supportingClaimsConflict(signals);
        const confidence = aggregateEventConfidence(
          links.map((link) => ({
            confidence: Number(link.claim.confidence),
            articleId: link.claim.sourceArticleId,
            sourceId: link.claim.sourceArticle.sourceId,
            conflicting: conflict,
          })),
          this.policy,
        );
        const articleIds = new Set(
          links.map((link) => link.claim.sourceArticleId),
        );
        const sourceIds = new Set(
          links.map((link) => link.claim.sourceArticle.sourceId),
        );
        const seen = links.map((link) => seenAt(link.claim));
        await tx.event.update({
          where: { id: eventId },
          data: {
            confidence,
            supportingClaimCount: links.length,
            supportingArticleCount: articleIds.size,
            supportingSourceCount: sourceIds.size,
            firstSeenAt: new Date(
              Math.min(...seen.map((value) => value.getTime())),
            ),
            lastSeenAt: new Date(
              Math.max(...seen.map((value) => value.getTime())),
            ),
            conflictState: conflict ? 'DETECTED' : 'NONE',
            conflictReason: conflict
              ? 'Supporting Claims both affirm and explicitly deny the event'
              : null,
          },
        });
        await tx.claimEventProcessing.update({
          where: { claimId },
          data: {
            status: 'COMPLETED',
            processedAt: new Date(),
            ownerToken: null,
            leaseExpiresAt: null,
            nextAttemptAt: null,
            matchDecision: match.decision,
            candidateEventIds: match.candidateEventIds,
          },
        });
        return {
          eventId,
          match,
          eventCreated,
          conflict,
          conflictNewlyDetected: conflict && !conflictWasDetected,
        };
      });
      console.info(
        JSON.stringify({
          operation: 'event_claim_processing',
          claimId,
          eventId: result.eventId,
          matchDecision: result.match.decision,
          status: 'completed',
        }),
      );
      const event = await this.getEvent(result.eventId);
      return {
        ...event,
        processingMetadata: processingMetadata({
          claimsProcessed: 1,
          eventsCreated: result.eventCreated ? 1 : 0,
          claimsAttachedToExisting: result.eventCreated ? 0 : 1,
          ambiguousMatches: result.match.decision === 'AMBIGUOUS' ? 1 : 0,
          conflictsDetected: result.conflictNewlyDetected ? 1 : 0,
        }),
      };
    } catch (error) {
      const current = await db.claimEventProcessing.findUnique({
        where: { claimId },
      });
      const attempts = current?.attempts ?? 1;
      await db.claimEventProcessing.updateMany({
        where: { claimId, ownerToken },
        data: {
          status: 'FAILED',
          ownerToken: null,
          leaseExpiresAt: null,
          nextAttemptAt: new Date(
            Date.now() + Math.min(30, attempts * 5) * 60_000,
          ),
          errorCode: 'EVENT_PROCESSING_FAILED',
          errorMessage: 'Event processing failed safely',
        },
      });
      throw error instanceof ServiceError
        ? error
        : new ServiceError(
            'EVENT_PROCESSING_FAILED',
            'Claim could not be processed safely',
            500,
          );
    }
  }

  async getEvent(id: string) {
    const event = await db.event.findUnique({
      where: { id },
      include: detailInclude,
    });
    if (!event)
      throw new ServiceError('EVENT_NOT_FOUND', 'Event not found', 404);
    return event;
  }
  async listEvents(input: EventListInput) {
    const where: Prisma.EventWhereInput = {
      ...(input.eventType ? { eventType: input.eventType } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.severity ? { severity: input.severity } : {}),
      ...(input.assertionMode ? { assertionMode: input.assertionMode } : {}),
      ...(input.country
        ? {
            locations: {
              some: { country: { equals: input.country, mode: 'insensitive' } },
            },
          }
        : {}),
      ...(input.location
        ? {
            locations: {
              some: { name: { contains: input.location, mode: 'insensitive' } },
            },
          }
        : {}),
      ...(input.entity
        ? {
            entities: {
              some: { name: { contains: input.entity, mode: 'insensitive' } },
            },
          }
        : {}),
      ...(input.dateFrom || input.dateTo
        ? {
            lastSeenAt: {
              ...(input.dateFrom ? { gte: input.dateFrom } : {}),
              ...(input.dateTo ? { lte: input.dateTo } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await db.$transaction([
      db.event.findMany({
        where,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        orderBy: { lastSeenAt: 'desc' },
        include: { entities: true, locations: true },
      }),
      db.event.count({ where }),
    ]);
    return {
      items,
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total,
        totalPages: Math.ceil(total / input.pageSize),
      },
    };
  }
  async updateStatus(id: string, status: EventStatusValue) {
    const event = await db.event.findUnique({ where: { id } });
    if (!event)
      throw new ServiceError('EVENT_NOT_FOUND', 'Event not found', 404);
    if (!canTransitionEventStatus(event.status, status))
      throw new ServiceError(
        'INVALID_EVENT_STATUS_TRANSITION',
        `Cannot transition Event from ${event.status} to ${status}`,
        409,
      );
    return db.event.update({
      where: { id },
      data: { status, exposureVersion: { increment: 1 } },
    });
  }
  async pendingClaims(limit: number) {
    return db.claim.findMany({
      where: {
        extractionRun: { status: 'COMPLETED' },
        OR: [
          { eventProcessing: null },
          {
            eventProcessing: {
              status: 'FAILED',
              attempts: { lt: 3 },
              OR: [
                { nextAttemptAt: null },
                { nextAttemptAt: { lte: new Date() } },
              ],
            },
          },
        ],
      },
      take: limit,
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
  }
}

export type EventProcessingMetrics = {
  claimsProcessed: number;
  claimsSkipped: number;
  processingFailures: number;
  eventsCreated: number;
  claimsAttachedToExisting: number;
  ambiguousMatches: number;
  conflictsDetected: number;
};
export const processingMetadata = (
  values: Partial<EventProcessingMetrics> = {},
): EventProcessingMetrics => ({
  claimsProcessed: 0,
  claimsSkipped: 0,
  processingFailures: 0,
  eventsCreated: 0,
  claimsAttachedToExisting: 0,
  ambiguousMatches: 0,
  conflictsDetected: 0,
  ...values,
});

export function eventPolicyFromEnvironment(
  env: { EVENT_MIN_CLAIM_CONFIDENCE?: string } = process.env,
): EventPolicy {
  return createEventPolicy(
    env.EVENT_MIN_CLAIM_CONFIDENCE === undefined
      ? {}
      : { minimumClaimConfidence: Number(env.EVENT_MIN_CLAIM_CONFIDENCE) },
  );
}

export const eventIntelligenceService = new EventIntelligenceService(
  eventPolicyFromEnvironment(),
);

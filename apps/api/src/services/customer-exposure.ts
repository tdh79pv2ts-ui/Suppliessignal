import { createHash } from 'node:crypto';
import { db, type Prisma, type ExposureNodeType, type ExposureType } from '@suppliesignal/db';
import {
  EXPOSURE_POLICY_VERSION,
  normalizeIdentifier,
  type CustomerExposureListInput,
  type EventIdentityProposalInput,
  type GraphIdentityInput,
} from '@suppliesignal/shared';
import { ServiceError } from './errors.js';

type Node = { customerId: string; nodeType: ExposureNodeType; id: string; label: string; active: boolean; edge?: string };
type Finding = {
  customerId: string;
  exposureType: ExposureType;
  matchState: 'VERIFIED_DIRECT' | 'GEOGRAPHIC';
  method: 'VERIFIED_IDENTIFIER' | 'GLOBAL_PORT_ID' | 'EXACT_STRUCTURED_LOCATION';
  confidence: number;
  reason: 'EXACT_SUPPLIER_IDENTIFIER' | 'EXACT_FACTORY_IDENTIFIER' | 'EXACT_PRODUCT_IDENTIFIER' | 'EXACT_MATERIAL_IDENTIFIER' | 'EXACT_ROUTE_IDENTIFIER' | 'EXACT_PORT_ID' | 'EXACT_CITY_REGION_COUNTRY';
  eventEntityIds: string[];
  eventLocationIds: string[];
  nodes: Node[];
};
const identityInclude = { supplier: true, factory: true, product: true, material: true, route: true, port: true } as const;
const pathKey = (finding: Finding) => createHash('sha256').update(JSON.stringify([EXPOSURE_POLICY_VERSION, finding.exposureType, finding.method, finding.nodes.map((node) => [node.nodeType, node.id, node.edge]), finding.eventEntityIds, finding.eventLocationIds])).digest('hex');
const subjectData = (type: ExposureNodeType, id: string) => ({ [`${type.toLowerCase()}Id`]: id });
const identityNode = (identity: Awaited<ReturnType<typeof db.customerGraphIdentity.findFirstOrThrow>> & Record<string, unknown>): Node => {
  const key = identity.subjectType.toLowerCase();
  const subject = identity[key] as { id: string; name: string; active: boolean } | undefined;
  if (!subject) throw new ServiceError('INVALID_IDENTITY_SUBJECT', 'Identity subject is unavailable', 409);
  return { customerId: identity.customerId, nodeType: identity.subjectType, id: subject.id, label: subject.name, active: subject.active };
};

export class CustomerExposureService {
  async reconcileEvent(eventId: string) {
    const event = await db.event.findUnique({
      where: { id: eventId },
      include: { entities: { include: { identifiers: true } }, locations: true },
    });
    if (!event) throw new ServiceError('EVENT_NOT_FOUND', 'Event not found', 404);
    return db.$transaction(async (tx) => {
      // Returning a boolean avoids exposing PostgreSQL's void lock result to Prisma.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`exposure:${eventId}`})) IS NULL AS locked`;
      const findings: Finding[] = [];
      for (const entity of event.entities) {
        for (const identifier of entity.identifiers.filter((item) => item.verificationStatus === 'VERIFIED')) {
          const identities = await tx.customerGraphIdentity.findMany({
            where: { verificationStatus: 'VERIFIED', namespace: identifier.namespace, normalizedIdentifier: identifier.normalizedIdentifier },
            include: identityInclude,
          });
          for (const identity of identities) {
            const node = identityNode(identity as never);
            const exposureType = `DIRECT_${node.nodeType}` as ExposureType;
            findings.push({ customerId: identity.customerId, exposureType, matchState: 'VERIFIED_DIRECT', method: node.nodeType === 'PORT' ? 'GLOBAL_PORT_ID' : 'VERIFIED_IDENTIFIER', confidence: 1, reason: `EXACT_${node.nodeType}_IDENTIFIER` as Finding['reason'], eventEntityIds: [entity.id], eventLocationIds: [], nodes: [node] });
            if (node.nodeType === 'PORT') {
              const links = await tx.routePort.findMany({ where: { portId: node.id }, include: { route: true } });
              for (const link of links) findings.push({ customerId: link.customerId, exposureType: 'DIRECT_PORT', matchState: 'VERIFIED_DIRECT', method: 'GLOBAL_PORT_ID', confidence: 1, reason: 'EXACT_PORT_ID', eventEntityIds: [entity.id], eventLocationIds: [], nodes: [node, { customerId: link.customerId, nodeType: 'ROUTE', id: link.route.id, label: link.route.name, active: link.route.active, edge: 'ROUTE_CONTAINS_PORT' }] });
            }
          }
        }
      }
      for (const location of event.locations) {
        if (location.country && location.city) {
          const factories = await tx.factory.findMany({ where: { active: true, country: { equals: location.country, mode: 'insensitive' }, city: { equals: location.city, mode: 'insensitive' } } });
          for (const factory of factories) findings.push({ customerId: factory.customerId, exposureType: 'GEOGRAPHIC_PROXIMITY', matchState: 'GEOGRAPHIC', method: 'EXACT_STRUCTURED_LOCATION', confidence: 0.75, reason: 'EXACT_CITY_REGION_COUNTRY', eventEntityIds: [], eventLocationIds: [location.id], nodes: [{ customerId: factory.customerId, nodeType: 'FACTORY', id: factory.id, label: factory.name, active: factory.active }] });
        } else if (location.country) {
          const factories = await tx.factory.findMany({ where: { active: true, country: { equals: location.country, mode: 'insensitive' } }, take: 500 });
          const byCustomer = new Map<string, typeof factories>();
          for (const factory of factories) byCustomer.set(factory.customerId, [...(byCustomer.get(factory.customerId) ?? []), factory]);
          for (const [customerId, nodes] of byCustomer) await tx.exposureCandidate.upsert({
            where: { customerId_eventId_candidateKey_exposurePolicyVersion: { customerId, eventId, candidateKey: `country:${location.id}`, exposurePolicyVersion: EXPOSURE_POLICY_VERSION } },
            update: { eventVersion: event.exposureVersion, graphRevision: (await tx.customer.findUniqueOrThrow({ where: { id: customerId } })).graphRevision, snapshot: { location }, nodes: { deleteMany: {}, create: nodes.map((factory) => ({ nodeType: 'FACTORY', factoryId: factory.id, snapshot: { name: factory.name, country: factory.country } })) } },
            create: { customerId, eventId, candidateKey: `country:${location.id}`, confidence: 0.3, matchMethods: ['EXACT_STRUCTURED_LOCATION'], reasonCodes: ['COUNTRY_ONLY_PROXIMITY'], eventEntityIds: [], eventLocationIds: [location.id], snapshot: { location }, exposurePolicyVersion: EXPOSURE_POLICY_VERSION, graphRevision: (await tx.customer.findUniqueOrThrow({ where: { id: customerId } })).graphRevision, eventVersion: event.exposureVersion, nodes: { create: nodes.map((factory) => ({ nodeType: 'FACTORY', factoryId: factory.id, snapshot: { name: factory.name, country: factory.country } })) } },
          });
        }
      }
      const grouped = new Map<string, Finding[]>();
      for (const finding of findings) grouped.set(finding.customerId, [...(grouped.get(finding.customerId) ?? []), finding]);
      for (const [customerId, matches] of grouped) {
        const customer = await tx.customer.findUniqueOrThrow({ where: { id: customerId } });
        const best = [...matches].sort((a, b) => b.confidence - a.confidence)[0]!;
        const exposure = await tx.customerExposure.upsert({
          where: { customerId_eventId: { customerId, eventId } },
          update: { ...(event.status === 'RESOLVED' || event.status === 'CANCELLED' ? { status: 'RESOLVED' as const } : {}), primaryExposureType: best.exposureType, matchConfidence: best.confidence, matchState: best.matchState, eventPolicyVersion: event.policyVersion, exposurePolicyVersion: EXPOSURE_POLICY_VERSION, eventVersion: event.exposureVersion, graphRevision: customer.graphRevision, lastMatchedAt: new Date() },
          create: { customerId, eventId, status: event.status === 'RESOLVED' || event.status === 'CANCELLED' ? 'RESOLVED' : 'POTENTIAL', primaryExposureType: best.exposureType, matchConfidence: best.confidence, matchState: best.matchState, eventPolicyVersion: event.policyVersion, exposurePolicyVersion: EXPOSURE_POLICY_VERSION, eventVersion: event.exposureVersion, graphRevision: customer.graphRevision, lastMatchedAt: new Date() },
        });
        const activeKeys: string[] = [];
        for (const finding of matches) {
          const key = pathKey(finding); activeKeys.push(key);
          await tx.exposurePath.upsert({
            where: { exposureId_pathKey: { exposureId: exposure.id, pathKey: key } },
            update: { activeMatch: true, invalidatedAt: null, lastMatchedAt: new Date(), matchConfidence: finding.confidence, graphRevision: customer.graphRevision, eventVersion: event.exposureVersion, snapshot: { eventEntityIds: finding.eventEntityIds, eventLocationIds: finding.eventLocationIds, nodes: finding.nodes } },
            create: { customerId, exposureId: exposure.id, pathKey: key, exposureType: finding.exposureType, decision: 'MATCH', matchMethod: finding.method, matchConfidence: finding.confidence, reasonCodes: [finding.reason], lastMatchedAt: new Date(), graphRevision: customer.graphRevision, eventVersion: event.exposureVersion, snapshot: { eventEntityIds: finding.eventEntityIds, eventLocationIds: finding.eventLocationIds, nodes: finding.nodes }, steps: { create: finding.nodes.map((node, sequence) => ({ sequence, nodeType: node.nodeType, ...subjectData(node.nodeType, node.id), edgeFromPrevious: node.edge ?? null, labelSnapshot: node.label, activeSnapshot: node.active })) } },
          });
        }
        await tx.exposurePath.updateMany({ where: { exposureId: exposure.id, pathKey: { notIn: activeKeys }, activeMatch: true }, data: { activeMatch: false, invalidatedAt: new Date() } });
      }
      const existing = await tx.customerExposure.findMany({ where: { eventId } });
      for (const exposure of existing.filter((item) => !grouped.has(item.customerId))) await tx.customerExposure.update({ where: { id: exposure.id }, data: { status: event.status === 'RESOLVED' || event.status === 'CANCELLED' ? 'RESOLVED' : 'STALE', staleAt: new Date() } });
      return { eventId, exposures: grouped.size, paths: findings.length };
    }, { timeout: 20_000 });
  }

  async reconcileCustomer(customerId: string) {
    await db.customer.findUniqueOrThrow({ where: { id: customerId } });
    const events = await db.event.findMany({ where: { status: { in: ['DETECTED', 'ACTIVE'] } }, select: { id: true } });
    for (const event of events) await this.reconcileEvent(event.id);
    return { customerId, eventsProcessed: events.length };
  }
  list(customerId: string, input: CustomerExposureListInput, confirmedOnly = false) { return db.customerExposure.findMany({ where: { customerId, ...(confirmedOnly ? { status: 'CONFIRMED' } : input.status ? { status: input.status } : {}) }, include: { event: { include: { entities: true, locations: true } }, paths: { where: { activeMatch: true }, include: { steps: true } } }, orderBy: { lastMatchedAt: 'desc' }, skip: (input.page - 1) * input.pageSize, take: input.pageSize }); }
  async detail(customerId: string, id: string, confirmedOnly = false) { const item = await db.customerExposure.findFirst({ where: { id, customerId, ...(confirmedOnly ? { status: 'CONFIRMED' } : {}) }, include: { paths: { include: { steps: { orderBy: { sequence: 'asc' } } } }, event: { include: { entities: true, locations: true, claimLinks: { include: { claim: { include: { sourceArticle: { include: { source: true } } } } } } } } } }); if (!item) throw new ServiceError('EXPOSURE_NOT_FOUND', 'Exposure not found', 404); return item; }
  async reviewExposure(customerId: string, id: string, userId: string, confirmed: boolean, reason: 'AMBIGUOUS_ENTITY_IDENTITY' | 'AMBIGUOUS_LOCATION' | 'NO_SUPPORTED_MATCH') { await this.detail(customerId, id); return db.customerExposure.update({ where: { id }, data: { status: confirmed ? 'CONFIRMED' : 'DISMISSED', reviewedByUserId: userId, reviewReasonCode: reason, dismissedAt: confirmed ? null : new Date() } }); }
  listCandidates(customerId: string) { return db.exposureCandidate.findMany({ where: { customerId }, include: { event: true, nodes: true, resultingIdentity: true }, orderBy: { createdAt: 'desc' } }); }
  async getCandidate(customerId: string, id: string) { const item = await db.exposureCandidate.findFirst({ where: { id, customerId }, include: { event: { include: { entities: { include: { identifiers: true } }, locations: true, claimLinks: { include: { claim: { include: { sourceArticle: { include: { source: true } } } } } } } }, nodes: true, resultingIdentity: true } }); if (!item) throw new ServiceError('CANDIDATE_NOT_FOUND', 'Exposure candidate not found', 404); return item; }
  async reviewCandidate(customerId: string, id: string, userId: string, confirmed: boolean, reasonCode: 'AMBIGUOUS_ENTITY_IDENTITY' | 'AMBIGUOUS_LOCATION' | 'NO_SUPPORTED_MATCH', resultingIdentityId?: string) { await this.getCandidate(customerId, id); if (confirmed && !resultingIdentityId) throw new ServiceError('IDENTITY_REQUIRED', 'Confirmation requires a customer graph identity', 400); const item = await db.exposureCandidate.update({ where: { id }, data: { status: confirmed ? 'CONFIRMED' : 'REJECTED', reviewedAt: new Date(), reviewedByUserId: userId, reviewReasonCode: reasonCode, ...(resultingIdentityId ? { resultingIdentityId } : {}) } }); if (confirmed) await this.reconcileEvent(item.eventId); return item; }
  async createGraphIdentity(customerId: string, userId: string, input: GraphIdentityInput) { await this.assertSubject(customerId, input.subjectType, input.subjectId); return db.customerGraphIdentity.create({ data: { customerId, subjectType: input.subjectType, ...subjectData(input.subjectType, input.subjectId), namespace: input.namespace, identifier: input.identifier, normalizedIdentifier: normalizeIdentifier(input.identifier), verificationStatus: input.verificationStatus, provenanceSource: input.provenanceSource, provenanceRef: input.provenanceRef ?? null, evidenceNote: input.evidenceNote ?? null, ...(input.verificationStatus === 'VERIFIED' ? { verifiedAt: new Date(), verifiedByUserId: userId } : {}) } as Prisma.CustomerGraphIdentityUncheckedCreateInput }); }
  listGraphIdentities(customerId: string) { return db.customerGraphIdentity.findMany({ where: { customerId }, include: identityInclude, orderBy: { createdAt: 'desc' } }); }
  async setGraphIdentityStatus(customerId: string, id: string, userId: string, verified: boolean) { const item = await db.customerGraphIdentity.findFirst({ where: { id, customerId } }); if (!item) throw new ServiceError('IDENTITY_NOT_FOUND', 'Customer identity not found', 404); return db.customerGraphIdentity.update({ where: { id }, data: verified ? { verificationStatus: 'VERIFIED', verifiedAt: new Date(), verifiedByUserId: userId } : { verificationStatus: 'REJECTED', verifiedAt: null, verifiedByUserId: null } }); }
  async proposeEventIdentity(customerId: string, candidateId: string, userId: string, input: EventIdentityProposalInput, isAdmin = false) { const candidate = await this.getCandidate(customerId, candidateId); const entity = candidate.event.entities.find((item) => item.id === input.eventEntityId); if (!entity) throw new ServiceError('EVENT_ENTITY_NOT_IN_CANDIDATE', 'Event entity is not part of this candidate Event', 409); if (input.sourceClaimId && !candidate.event.claimLinks.some((link) => link.claimId === input.sourceClaimId)) throw new ServiceError('CLAIM_NOT_IN_EVENT', 'Source Claim does not support this Event', 409); return db.eventEntityIdentifier.create({ data: { eventEntityId: input.eventEntityId, namespace: input.namespace, identifier: input.identifier, normalizedIdentifier: normalizeIdentifier(input.identifier), verificationStatus: isAdmin ? 'VERIFIED' : 'PROPOSED', provenanceSource: input.provenanceSource, provenanceRef: input.provenanceRef ?? null, evidenceNote: input.evidenceNote ?? null, sourceClaimId: input.sourceClaimId ?? null, ...(isAdmin ? { verifiedAt: new Date(), verifiedByUserId: userId } : { proposedAt: new Date(), proposedByUserId: userId }) } }); }
  async verifyEventIdentifier(id: string, userId: string, verified: boolean) { const item = await db.eventEntityIdentifier.findUnique({ where: { id }, include: { eventEntity: true } }); if (!item) throw new ServiceError('IDENTIFIER_NOT_FOUND', 'Event identifier not found', 404); const updated = await db.eventEntityIdentifier.update({ where: { id }, data: verified ? { verificationStatus: 'VERIFIED', verifiedAt: new Date(), verifiedByUserId: userId } : { verificationStatus: 'REJECTED', verifiedAt: null, verifiedByUserId: null } }); if (verified) { await db.event.update({ where: { id: item.eventEntity.eventId }, data: { exposureVersion: { increment: 1 } } }); await this.reconcileEvent(item.eventEntity.eventId); } return updated; }
  listEventIdentifiers() { return db.eventEntityIdentifier.findMany({ include: { eventEntity: { include: { event: true } }, proposedBy: { select: { id: true, email: true } }, verifiedBy: { select: { id: true, email: true } } }, orderBy: { createdAt: 'desc' } }); }
  async createAdminEventIdentity(eventEntityId: string, userId: string, input: Omit<EventIdentityProposalInput, 'eventEntityId'>) { const entity = await db.eventEntity.findUnique({ where: { id: eventEntityId } }); if (!entity) throw new ServiceError('EVENT_ENTITY_NOT_FOUND', 'Event entity not found', 404); if (input.sourceClaimId && !await db.eventClaim.findUnique({ where: { eventId_claimId: { eventId: entity.eventId, claimId: input.sourceClaimId } } })) throw new ServiceError('CLAIM_NOT_IN_EVENT', 'Source Claim does not support this Event', 409); return db.eventEntityIdentifier.create({ data: { eventEntityId, namespace: input.namespace, identifier: input.identifier, normalizedIdentifier: normalizeIdentifier(input.identifier), verificationStatus: 'VERIFIED', provenanceSource: input.provenanceSource, provenanceRef: input.provenanceRef ?? null, evidenceNote: input.evidenceNote ?? null, sourceClaimId: input.sourceClaimId ?? null, verifiedAt: new Date(), verifiedByUserId: userId } }); }
  async assertSubject(customerId: string, type: ExposureNodeType, id: string) { if (type === 'PORT') { if (!await db.port.findUnique({ where: { id } })) throw new ServiceError('SUBJECT_NOT_FOUND', 'Port not found', 404); return; } const model = ({ SUPPLIER: db.supplier, FACTORY: db.factory, PRODUCT: db.product, MATERIAL: db.material, ROUTE: db.route } as const)[type] as { findFirst(args: unknown): Promise<unknown> }; if (!await model.findFirst({ where: { id, customerId } })) throw new ServiceError('SUBJECT_NOT_FOUND', 'Customer graph subject not found', 404); }
}
export const customerExposureService = new CustomerExposureService();

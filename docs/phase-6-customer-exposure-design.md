# Phase 6 — Customer Exposure Engine design

## 1. Executive summary

Phase 6 adds a deterministic, customer-scoped layer between global `Event` records and the existing customer supply-chain graph:

```text
Global Event
  ├── Event provenance: Claims → Articles → Sources
  └── CustomerExposure
        └── ExposurePath → explicit customer graph nodes and edges
```

`Event` remains global. One Event may affect zero, one, or many customers, while each customer has its own exposure, explanation, confidence, lifecycle, and graph paths. The database remains the system of record. Matching uses verified identifiers, explicit graph relationships, global ports, structured locations, and conservative deterministic rules. Names alone never establish identity. Geographic proximity never means confirmed disruption. Ambiguity is stored explicitly and never promoted silently.

The recommended persistence model has one logical `CustomerExposure` per `(customerId, eventId)` and one or more deduplicated `ExposurePath` findings. Each path retains live graph references and an immutable factual snapshot. A database-backed worker handles Event changes and customer-graph changes with bounded leases, transaction locks, unique constraints, retries, and version checks.

Exposure confidence is separate from Event confidence. Phase 6 creates no risk score, priority score, alert, Daily Brief, notification, AI graph match, supplier discovery, or automatic graph mutation.

## 2. Current architecture observations

- `Event`, `EventEntity`, and `EventLocation` are global and contain no customer relationship.
- Event provenance is preserved through `EventClaim → Claim → ArticleExtractionRun → SourceArticle → Source`.
- Events store a construction `policyVersion`, deterministic fingerprint, structured entities and locations, explicit conflict state, and explicit lifecycle.
- Suppliers, factories, products, materials, and routes belong to exactly one customer.
- Ports are global reference entities and become customer-relevant only through `RoutePort`.
- Every customer-owned join row carries `customerId`; composite foreign keys prevent cross-tenant graph edges.
- Operational graph objects use `active=false` archival, retaining their records and relationships.
- Customer access is membership-based. `REVIEWER` has no implicit customer access; only `ADMIN` has platform-wide access.
- Customer graph nodes currently lack a general verified global identity mapping. Therefore `EventEntity.normalizedName` cannot safely be equated to a Supplier or Factory solely by normalized text.

Phase 6 needs an explicit identity boundary. It must not convert extracted global entities into customer graph relationships or treat fuzzy/name-only similarity as proof.

## 3. Proposed architecture

```text
Event created or materially updated
        ↓
ExposureWorkItem(EVENT_CHANGED)
        ↓
ExposureCandidateFinder
        ↓
indexed candidate customer/node pairs
        ↓
ExposureMatcher
        ├── MATCH
        ├── AMBIGUOUS
        └── NO_MATCH
        ↓
ExposurePathBuilder
        ↓
CustomerExposure + ExposurePath + immutable revisions
```

Customer graph mutations use the inverse lookup:

```text
Customer graph node/edge changed
        ↓
ExposureWorkItem(GRAPH_CHANGED)
        ↓
find relevant existing Events from identity/location/port indexes
        ↓
same deterministic matcher and reconciliation transaction
```

Recommended service boundaries:

| Component | Responsibility | Inputs | Outputs | Failure modes |
|---|---|---|---|---|
| `ExposureService` | Orchestrate reconciliation and customer-scoped reads/review | customer/event IDs, revisions, filters | exposures, detail, work requests | not found, stale revision, unauthorized scope |
| `ExposureCandidateFinder` | Indexed lookup without a customer × Event scan | Event entities/locations or graph-change descriptor | bounded candidate tuples | ambiguous identity/location, missing identifier |
| `ExposureMatcher` | Pure deterministic decision | Event facts, candidate node, policy | `MATCH`, `AMBIGUOUS`, or `NO_MATCH` | invalid structured input/policy |
| `ExposurePathBuilder` | Traverse only explicit graph edges and canonicalize paths | matched anchor, customer graph neighborhood | ordered canonical paths | cross-customer edge, missing/archived node |
| `ExposureWorker` | Claim leases, retry, reconcile, metrics | database work items | completed/failed work | crash, timeout, superseded revision |
| `ExposurePolicy` | Central matching thresholds, confidence, radii, versions | validated configuration | immutable policy | invalid configuration |

## 4. Proposed Prisma models and enums

The following is a design proposal, not an applied schema change.

```prisma
enum ExposureType {
  DIRECT_SUPPLIER
  DIRECT_FACTORY
  DIRECT_PORT
  DIRECT_ROUTE
  DIRECT_MATERIAL
  DIRECT_PRODUCT
  INDIRECT_SUPPLIER
  INDIRECT_FACTORY
  INDIRECT_ROUTE
  GEOGRAPHIC_PROXIMITY
}

enum ExposureStatus {
  POTENTIAL
  CONFIRMED
  DISMISSED
  STALE
  RESOLVED
}

enum ExposureMatchDecision {
  MATCH
  AMBIGUOUS
  NO_MATCH
}

enum ExposureMatchMethod {
  VERIFIED_IDENTIFIER
  REVIEWED_IDENTITY_MAPPING
  GLOBAL_PORT_ID
  PORT_CODE
  COMPOSITE_EXACT_IDENTITY
  EXACT_STRUCTURED_LOCATION
  COORDINATE_PROXIMITY
  EXPLICIT_GRAPH_PATH
}

enum ExposureEvidenceLevel {
  VERIFIED_DIRECT
  VERIFIED_INDIRECT
  GEOGRAPHIC
  AMBIGUOUS
}

enum ExposureNodeType {
  SUPPLIER
  FACTORY
  PRODUCT
  MATERIAL
  ROUTE
  PORT
}

enum IdentitySubjectType {
  SUPPLIER
  FACTORY
  PRODUCT
  MATERIAL
  ROUTE
  PORT
}

enum IdentityVerificationStatus {
  PROPOSED
  VERIFIED
  UNVERIFIED
  REJECTED
}

enum ExposureWorkType {
  EVENT_CHANGED
  GRAPH_CHANGED
  MANUAL_RECONCILIATION
}

enum ExposureWorkStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}

enum ExposureCandidateReviewStatus {
  PENDING
  CONFIRMED
  REJECTED
  SUPERSEDED
}

model CustomerExposure {
  id                    String         @id @default(uuid()) @db.Uuid
  customerId            String         @map("customer_id") @db.Uuid
  eventId               String         @map("event_id") @db.Uuid
  status                ExposureStatus @default(POTENTIAL)
  primaryExposureType   ExposureType   @map("primary_exposure_type")
  matchConfidence       Decimal        @map("match_confidence") @db.Decimal(4, 3)
  evidenceLevel         ExposureEvidenceLevel @map("evidence_level")
  eventPolicyVersion    String         @map("event_policy_version")
  exposurePolicyVersion String         @map("exposure_policy_version")
  eventVersion          Int            @map("event_version")
  graphRevision         BigInt         @map("graph_revision")
  firstDetectedAt       DateTime       @default(now()) @map("first_detected_at")
  lastMatchedAt         DateTime       @map("last_matched_at")
  resolvedAt            DateTime?      @map("resolved_at")
  staleAt               DateTime?      @map("stale_at")
  dismissedAt           DateTime?      @map("dismissed_at")
  reviewedByUserId      String?        @map("reviewed_by_user_id") @db.Uuid
  reviewReasonCode      String?        @map("review_reason_code")
  customer              Customer       @relation(fields: [customerId], references: [id], onDelete: Restrict)
  event                 Event          @relation(fields: [eventId], references: [id], onDelete: Restrict)
  reviewedBy            User?          @relation(fields: [reviewedByUserId], references: [id], onDelete: Restrict)
  paths                  ExposurePath[]
  revisions              ExposureRevision[]
  createdAt              DateTime       @default(now()) @map("created_at")
  updatedAt              DateTime       @updatedAt @map("updated_at")

  @@unique([customerId, eventId])
  @@unique([id, customerId])
  @@index([customerId, status, lastMatchedAt])
  @@index([customerId, primaryExposureType, status])
  @@index([eventId, status])
  @@map("customer_exposures")
}

model ExposurePath {
  id                    String        @id @default(uuid()) @db.Uuid
  customerId            String        @map("customer_id") @db.Uuid
  exposureId            String        @map("exposure_id") @db.Uuid
  pathKey               String        @map("path_key")
  exposureType          ExposureType  @map("exposure_type")
  decision              ExposureMatchDecision
  matchMethod           ExposureMatchMethod @map("match_method")
  matchConfidence       Decimal       @map("match_confidence") @db.Decimal(4, 3)
  reasonCodes           String[]      @map("reason_codes")
  activeMatch           Boolean       @default(true) @map("active_match")
  firstMatchedAt        DateTime      @default(now()) @map("first_matched_at")
  lastMatchedAt         DateTime      @map("last_matched_at")
  invalidatedAt         DateTime?     @map("invalidated_at")
  graphRevision         BigInt        @map("graph_revision")
  eventVersion          Int           @map("event_version")
  snapshot              Json
  exposure              CustomerExposure @relation(fields: [exposureId, customerId], references: [id, customerId], onDelete: Restrict)
  steps                 ExposurePathStep[]
  createdAt             DateTime      @default(now()) @map("created_at")
  updatedAt             DateTime      @updatedAt @map("updated_at")

  @@unique([exposureId, pathKey])
  @@unique([id, customerId])
  @@index([customerId, activeMatch, exposureType])
  @@index([exposureId, decision])
  @@map("exposure_paths")
}

model ExposurePathStep {
  id                 String           @id @default(uuid()) @db.Uuid
  customerId         String           @map("customer_id") @db.Uuid
  pathId             String           @map("path_id") @db.Uuid
  sequence           Int
  nodeType           ExposureNodeType @map("node_type")
  edgeFromPrevious   String?          @map("edge_from_previous")
  supplierId         String?          @map("supplier_id") @db.Uuid
  factoryId          String?          @map("factory_id") @db.Uuid
  productId          String?          @map("product_id") @db.Uuid
  materialId         String?          @map("material_id") @db.Uuid
  routeId            String?          @map("route_id") @db.Uuid
  portId             String?          @map("port_id") @db.Uuid
  supplier           Supplier?        @relation(fields: [supplierId, customerId], references: [id, customerId], onDelete: Restrict)
  factory            Factory?         @relation(fields: [factoryId, customerId], references: [id, customerId], onDelete: Restrict)
  product            Product?         @relation(fields: [productId, customerId], references: [id, customerId], onDelete: Restrict)
  material           Material?        @relation(fields: [materialId, customerId], references: [id, customerId], onDelete: Restrict)
  route              Route?           @relation(fields: [routeId, customerId], references: [id, customerId], onDelete: Restrict)
  port               Port?            @relation(fields: [portId], references: [id], onDelete: Restrict)
  labelSnapshot      String           @map("label_snapshot")
  attributesSnapshot Json?            @map("attributes_snapshot")
  activeSnapshot     Boolean?         @map("active_snapshot")
  path               ExposurePath     @relation(fields: [pathId, customerId], references: [id, customerId], onDelete: Restrict)

  @@unique([pathId, sequence])
  @@index([customerId, supplierId])
  @@index([customerId, factoryId])
  @@index([customerId, productId])
  @@index([customerId, materialId])
  @@index([customerId, routeId])
  @@index([portId])
  @@map("exposure_path_steps")
}

model CustomerGraphIdentity {
  id                    String        @id @default(uuid()) @db.Uuid
  customerId            String        @map("customer_id") @db.Uuid
  subjectType           IdentitySubjectType @map("subject_type")
  supplierId            String?       @map("supplier_id") @db.Uuid
  factoryId             String?       @map("factory_id") @db.Uuid
  productId             String?       @map("product_id") @db.Uuid
  materialId            String?       @map("material_id") @db.Uuid
  routeId               String?       @map("route_id") @db.Uuid
  portId                String?       @map("port_id") @db.Uuid
  namespace             String
  identifier            String
  normalizedIdentifier  String        @map("normalized_identifier")
  verificationStatus    IdentityVerificationStatus @map("verification_status")
  source                String
  sourceReference       String?       @map("source_reference")
  evidenceNote          String?       @map("evidence_note")
  verifiedAt            DateTime?     @map("verified_at")
  verifiedByUserId      String?       @map("verified_by_user_id") @db.Uuid
  customer              Customer      @relation(fields: [customerId], references: [id], onDelete: Restrict)
  verifiedBy            User?         @relation(fields: [verifiedByUserId], references: [id], onDelete: Restrict)
  supplier              Supplier?     @relation(fields: [supplierId, customerId], references: [id, customerId], onDelete: Restrict)
  factory               Factory?      @relation(fields: [factoryId, customerId], references: [id, customerId], onDelete: Restrict)
  product               Product?      @relation(fields: [productId, customerId], references: [id, customerId], onDelete: Restrict)
  material              Material?     @relation(fields: [materialId, customerId], references: [id, customerId], onDelete: Restrict)
  route                 Route?        @relation(fields: [routeId, customerId], references: [id, customerId], onDelete: Restrict)
  port                  Port?         @relation(fields: [portId], references: [id], onDelete: Restrict)
  createdAt             DateTime      @default(now()) @map("created_at")
  updatedAt             DateTime      @updatedAt @map("updated_at")

  @@index([namespace, normalizedIdentifier, verificationStatus])
  @@unique([id, customerId])
  @@index([customerId, supplierId])
  @@index([customerId, factoryId])
  @@index([customerId, productId])
  @@index([customerId, materialId])
  @@index([customerId, routeId])
  @@index([portId])
  @@map("customer_graph_identities")
}

model EventEntityIdentifier {
  id                    String   @id @default(uuid()) @db.Uuid
  eventEntityId         String   @map("event_entity_id") @db.Uuid
  eventEntity           EventEntity @relation(fields: [eventEntityId], references: [id], onDelete: Cascade)
  namespace             String
  identifier            String
  normalizedIdentifier  String   @map("normalized_identifier")
  sourceClaimId         String?  @map("source_claim_id") @db.Uuid
  sourceClaim           Claim?   @relation(fields: [sourceClaimId], references: [id], onDelete: Restrict)
  verificationStatus    IdentityVerificationStatus @map("verification_status")
  source                String
  sourceReference       String?  @map("source_reference")
  evidenceNote          String?  @map("evidence_note")
  proposedAt            DateTime? @map("proposed_at")
  proposedByUserId      String?  @map("proposed_by_user_id") @db.Uuid
  proposedBy            User?    @relation("EventIdentityProposer", fields: [proposedByUserId], references: [id], onDelete: Restrict)
  verifiedAt            DateTime? @map("verified_at")
  verifiedByUserId      String?  @map("verified_by_user_id") @db.Uuid
  verifiedBy            User?    @relation("EventIdentityVerifier", fields: [verifiedByUserId], references: [id], onDelete: Restrict)
  createdAt             DateTime @default(now()) @map("created_at")

  @@unique([eventEntityId, namespace, normalizedIdentifier])
  @@index([namespace, normalizedIdentifier, verificationStatus])
  @@map("event_entity_identifiers")
}

model ExposureCandidate {
  id                    String   @id @default(uuid()) @db.Uuid
  customerId            String   @map("customer_id") @db.Uuid
  eventId               String   @map("event_id") @db.Uuid
  candidateKey          String   @map("candidate_key")
  status                ExposureCandidateReviewStatus @default(PENDING)
  matchConfidence       Decimal  @map("match_confidence") @db.Decimal(4, 3)
  matchMethods          ExposureMatchMethod[] @map("match_methods")
  reasonCodes           String[] @map("reason_codes")
  eventEntityIds        String[] @map("event_entity_ids") @db.Uuid
  eventLocationIds      String[] @map("event_location_ids") @db.Uuid
  candidateSnapshot     Json     @map("candidate_snapshot")
  exposurePolicyVersion String   @map("exposure_policy_version")
  graphRevision         BigInt   @map("graph_revision")
  eventVersion          Int      @map("event_version")
  reviewedByUserId      String?  @map("reviewed_by_user_id") @db.Uuid
  reviewedAt            DateTime? @map("reviewed_at")
  reviewReasonCode      String?  @map("review_reason_code")
  resultingIdentityId   String?  @map("resulting_identity_id") @db.Uuid
  customer              Customer @relation(fields: [customerId], references: [id], onDelete: Restrict)
  event                 Event    @relation(fields: [eventId], references: [id], onDelete: Restrict)
  reviewedBy            User?    @relation(fields: [reviewedByUserId], references: [id], onDelete: Restrict)
  resultingIdentity     CustomerGraphIdentity? @relation(fields: [resultingIdentityId, customerId], references: [id, customerId], onDelete: Restrict)
  nodes                 ExposureCandidateNode[]
  createdAt             DateTime @default(now()) @map("created_at")
  updatedAt             DateTime @updatedAt @map("updated_at")

  @@unique([customerId, eventId, candidateKey, exposurePolicyVersion])
  @@unique([id, customerId])
  @@index([customerId, status, updatedAt])
  @@index([eventId, status])
  @@map("exposure_candidates")
}

model ExposureCandidateNode {
  id             String   @id @default(uuid()) @db.Uuid
  customerId     String   @map("customer_id") @db.Uuid
  candidateId    String   @map("candidate_id") @db.Uuid
  supplierId     String?  @map("supplier_id") @db.Uuid
  factoryId      String?  @map("factory_id") @db.Uuid
  productId      String?  @map("product_id") @db.Uuid
  materialId     String?  @map("material_id") @db.Uuid
  routeId        String?  @map("route_id") @db.Uuid
  portId         String?  @map("port_id") @db.Uuid
  candidate      ExposureCandidate @relation(fields: [candidateId, customerId], references: [id, customerId], onDelete: Cascade)
  supplier       Supplier? @relation(fields: [supplierId, customerId], references: [id, customerId], onDelete: Restrict)
  factory        Factory?  @relation(fields: [factoryId, customerId], references: [id, customerId], onDelete: Restrict)
  product        Product?  @relation(fields: [productId, customerId], references: [id, customerId], onDelete: Restrict)
  material       Material? @relation(fields: [materialId, customerId], references: [id, customerId], onDelete: Restrict)
  route          Route?    @relation(fields: [routeId, customerId], references: [id, customerId], onDelete: Restrict)
  port           Port?     @relation(fields: [portId], references: [id], onDelete: Restrict)
  createdAt      DateTime @default(now()) @map("created_at")

  @@index([customerId, candidateId])
  @@map("exposure_candidate_nodes")
}

model ExposureRevision {
  id                  String   @id @default(uuid()) @db.Uuid
  customerId          String   @map("customer_id") @db.Uuid
  exposureId          String   @map("exposure_id") @db.Uuid
  revision            Int
  status              ExposureStatus
  matchConfidence     Decimal  @map("match_confidence") @db.Decimal(4, 3)
  graphRevision       BigInt   @map("graph_revision")
  eventVersion        Int      @map("event_version")
  reasonCodes         String[] @map("reason_codes")
  snapshot            Json
  createdAt           DateTime @default(now()) @map("created_at")

  @@unique([exposureId, revision])
  @@index([customerId, createdAt])
  @@map("exposure_revisions")
}

model ExposureWorkItem {
  id                String             @id @default(uuid()) @db.Uuid
  workType          ExposureWorkType   @map("work_type")
  eventId           String?            @map("event_id") @db.Uuid
  customerId        String?            @map("customer_id") @db.Uuid
  graphRevision     BigInt?            @map("graph_revision")
  eventVersion      Int?               @map("event_version")
  deduplicationKey  String             @unique @map("deduplication_key")
  status            ExposureWorkStatus @default(PENDING)
  ownerToken        String?            @map("owner_token") @db.Uuid
  leaseExpiresAt    DateTime?          @map("lease_expires_at")
  attempts          Int                @default(0)
  nextAttemptAt     DateTime?          @map("next_attempt_at")
  errorCode         String?            @map("error_code")
  errorMessage      String?            @map("error_message")
  createdAt         DateTime           @default(now()) @map("created_at")
  updatedAt         DateTime           @updatedAt @map("updated_at")

  @@index([status, nextAttemptAt, createdAt])
  @@index([eventId, status])
  @@index([customerId, status])
  @@map("exposure_work_items")
}
```

Also proposed:

```prisma
model Customer {
  graphRevision BigInt @default(0) @map("graph_revision")
}

model Event {
  exposureVersion Int @default(1) @map("exposure_version")
}
```

`CustomerExposure` is the customer-level lifecycle record. Multiple affected assets become paths rather than duplicate customer/Event records. `pathKey` is a deterministic hash over policy version, exposure type, ordered node IDs/types, ordered edge types, match method, and matching Event entity/location ID. Confidence is excluded from the identity key.

`ExposurePathStep` uses typed nullable references as the authoritative live references. Every customer-owned reference has a composite foreign key `(entityId, customerId) → Entity(id, customerId)`. `Port` remains global and uses `portId → Port.id`. PostgreSQL must also receive a migration-level `CHECK` constraint requiring exactly one typed subject and requiring that `nodeType` agrees with that non-null column:

```sql
CHECK (num_nonnulls(supplier_id, factory_id, product_id, material_id, route_id, port_id) = 1)
CHECK (
  (node_type = 'SUPPLIER' AND supplier_id IS NOT NULL) OR
  (node_type = 'FACTORY'  AND factory_id  IS NOT NULL) OR
  (node_type = 'PRODUCT'  AND product_id  IS NOT NULL) OR
  (node_type = 'MATERIAL' AND material_id IS NOT NULL) OR
  (node_type = 'ROUTE'    AND route_id    IS NOT NULL) OR
  (node_type = 'PORT'     AND port_id     IS NOT NULL)
)
```

Location-only evidence belongs in the path snapshot/anchor rather than masquerading as a live graph subject. Consequently, the database—not only service code—prevents a Customer A path from referencing Customer B data. Immutable snapshots remain mandatory when the referenced node is later archived.

The parent relation is equally tenant-safe: `ExposurePath` has `@@unique([id, customerId])`, and every step uses `(pathId, customerId) → ExposurePath(id, customerId)`. A step cannot claim Customer B while belonging to Customer A's path, even if all its typed graph references would otherwise be valid for Customer B. Together, the composite parent relation and composite typed-node foreign keys make both the path ownership and graph-node ownership database-enforced.

`CustomerGraphIdentity` follows the same typed-reference design. Exactly one of `supplierId`, `factoryId`, `productId`, `materialId`, `routeId`, or `portId` must be non-null, and `subjectType` must agree with it. Composite foreign keys enforce tenant ownership for customer-owned subjects. PostgreSQL `CHECK (num_nonnulls(...) = 1)` enforces the one-subject invariant. Partial unique indexes enforce that one subject cannot have the same namespace/value twice, for example:

```sql
CREATE UNIQUE INDEX customer_graph_identity_supplier_key
ON customer_graph_identities(customer_id, supplier_id, namespace, normalized_identifier)
WHERE supplier_id IS NOT NULL;
```

Equivalent partial unique indexes are required for Factory, Product, Material, Route, and Port. A verified identifier collision within the same namespace is rejected or moved to explicit review; it never silently maps two authoritative identities.

Identity namespaces may include `LEI`, `DUNS`, `VAT`, `UNLOCODE`, `IMO`, or a named authoritative customer master-data namespace. Identifiers must never be invented. A customer-local UUID is not automatically a global identity.

`ExposureCandidate` is the sole persistence target for `AMBIGUOUS`. It is deliberately not a `CustomerExposure`. Candidate graph nodes use typed `ExposureCandidateNode` rows plus the immutable candidate snapshot. The child table has the same `num_nonnulls(...) = 1` constraint and composite tenant-safe foreign keys as path steps. The candidate and child `customerId` must also be tied through a composite candidate relation in the final Prisma model, preventing a node row from claiming a different tenant. Confirmation does not mutate customer graph relationships.

Any identity resulting from candidate review is also tenant-bound. `CustomerGraphIdentity` has `@@unique([id, customerId])`, and `ExposureCandidate.resultingIdentity` uses `(resultingIdentityId, customerId) → CustomerGraphIdentity(id, customerId)`. PostgreSQL therefore rejects a Customer A candidate pointing at a Customer B identity, independently of service authorization.

## 5. Exposure taxonomy

### Direct verified graph matches

- `DIRECT_SUPPLIER`: a verified Event entity identity equals an explicitly tracked Supplier.
- `DIRECT_FACTORY`: a verified facility identity equals an explicitly tracked Factory.
- `DIRECT_PORT`: the Event affects the exact global Port used by the customer graph.
- `DIRECT_ROUTE`: the Event identifies the same verified route or transport node.
- `DIRECT_MATERIAL`: a verified material/commodity identifier equals a tracked Material.
- `DIRECT_PRODUCT`: a verified product identifier equals a tracked Product.

### Inferred through explicit graph edges

- `INDIRECT_SUPPLIER`: a directly matched factory, product, or route is explicitly linked to a Supplier.
- `INDIRECT_FACTORY`: a directly matched supplier, product, or route is explicitly linked to a Factory.
- `INDIRECT_ROUTE`: a directly matched port, supplier, or factory is explicitly attached to a Route.

Indirect paths may traverse only persisted graph edges. Corporate affiliation is not a substitute for a customer graph relationship.

### Geographic

- `GEOGRAPHIC_PROXIMITY`: an Event location and customer node share sufficiently precise structured geography or approved coordinate proximity.

Geographic proximity always means potential proximity, never verified operational disruption. City, region, and country precision are represented by match method, reason codes, and confidence rather than additional exposure types.

## 6. Exposure lifecycle

- `POTENTIAL`: created automatically from a deterministic match.
- `CONFIRMED`: a human reviewer confirms customer relevance.
- `DISMISSED`: a human reviewer determines it is not relevant.
- `STALE`: current graph/evidence no longer supports any active path.
- `RESOLVED`: the global Event is explicitly `RESOLVED` or `CANCELLED`; history remains.

```text
automatic match → POTENTIAL
POTENTIAL → CONFIRMED       human review
POTENTIAL → DISMISSED       human review
CONFIRMED → DISMISSED       human correction
DISMISSED → POTENTIAL       materially new matching evidence
POTENTIAL/CONFIRMED → STALE no currently valid path
STALE → POTENTIAL           valid path returns
POTENTIAL/CONFIRMED/STALE → RESOLVED
RESOLVED → POTENTIAL        Event explicitly reactivated
```

A verified identity establishes matching certainty, not operational impact; automatic results therefore begin as `POTENTIAL`. Dismissals store reviewer, timestamp, and controlled reason. A no-op reconciliation cannot overwrite a dismissal.

## 7. Matcher contract

```ts
type ExposureMatchResult =
  | {
      decision: "MATCH";
      exposureType: ExposureType;
      evidenceLevel: "VERIFIED_DIRECT" | "VERIFIED_INDIRECT" | "GEOGRAPHIC";
      matchMethod: ExposureMatchMethod;
      matchConfidence: number;
      eventEntityIds: string[];
      eventLocationIds: string[];
      matchedNodes: Array<{ customerId: string; nodeType: ExposureNodeType; nodeId: string }>;
      graphPath: CanonicalExposurePath;
      reasonCodes: ExposureReasonCode[];
      policyVersion: string;
    }
  | {
      decision: "AMBIGUOUS";
      candidateNodes: CandidateNode[];
      matchConfidence: number;
      reasonCodes: ExposureReasonCode[];
      reviewRequired: true;
      policyVersion: string;
    }
  | {
      decision: "NO_MATCH";
      reasonCodes: ExposureReasonCode[];
      policyVersion: string;
    };
```

Persistence semantics are strict:

```text
MATCH      → may create/update CustomerExposure and ExposurePath
AMBIGUOUS  → upsert ExposureCandidate only; never create CustomerExposure
NO_MATCH   → no CustomerExposure and no candidate, apart from safe processing telemetry
```

An assigned Reviewer or Admin may `CONFIRM` a candidate only by selecting/providing an authoritative namespaced identifier and its provenance. Confirmation creates or verifies the relevant typed identity record, marks the candidate `CONFIRMED`, and enqueues normal deterministic reconciliation. Only that later `MATCH` may create an exposure. `REJECT` records reviewer, time, controlled reason and status `REJECTED`; the same unchanged candidate key remains rejected. Materially new Event/graph evidence creates or supersedes a versioned candidate rather than erasing review history.

Controlled reason codes:

```text
EXACT_SUPPLIER_IDENTIFIER
EXACT_FACTORY_IDENTIFIER
EXACT_PRODUCT_IDENTIFIER
EXACT_MATERIAL_IDENTIFIER
EXACT_ROUTE_IDENTIFIER
EXACT_PORT_ID
EXACT_PORT_CODE
COMPOSITE_SUPPLIER_IDENTITY
COMPOSITE_FACTORY_IDENTITY
ROUTE_CONTAINS_ORIGIN_PORT
ROUTE_CONTAINS_DESTINATION_PORT
ROUTE_CONTAINS_INTERMEDIATE_PORT
EXPLICIT_SUPPLIER_PRODUCT_PATH
EXPLICIT_FACTORY_PRODUCT_PATH
EXPLICIT_PRODUCT_MATERIAL_PATH
EXPLICIT_ROUTE_SUPPLIER_PATH
EXPLICIT_ROUTE_FACTORY_PATH
EXACT_COORDINATE_PROXIMITY
EXACT_CITY_REGION_COUNTRY
EXACT_REGION_COUNTRY
COUNTRY_ONLY_PROXIMITY
AMBIGUOUS_ENTITY_IDENTITY
AMBIGUOUS_LOCATION
NAME_ONLY_MATCH_REJECTED
COUNTRY_MISMATCH
PORT_COUNTRY_MISMATCH
FACTORY_NOT_IN_CUSTOMER_GRAPH
NO_EXPLICIT_GRAPH_PATH
NODE_ARCHIVED
NO_SUPPORTED_MATCH
```

Reason codes are authoritative; the UI renders localized explanations from codes plus immutable snapshots. Arbitrary prose is not the only audit record.

## 8. Deterministic matching rules

### Supplier

An automatic direct match requires one of:

1. The same verified identity namespace and normalized identifier.
2. An explicit, previously reviewed identity mapping.
3. A policy-approved composite identity containing exact normalized legal name, exact country, and at least one strong discriminator such as registration number, precise city/address, or verified domain.

Name alone produces `NO_MATCH` or `AMBIGUOUS`, never `MATCH`. `ACME Ltd — UK` and `ACME Inc — USA` do not match through the shared token “acme.”

### Factory

A direct match requires a verified facility identifier, reviewed mapping, or collision-free composite of exact facility name, country, and precise city/address/coordinates. A factory’s corporate Supplier is insufficient. If the customer tracks Supplier A but not affected Factory Y, there is no direct Factory exposure.

### Port and routes

Match order:

1. Same global `Port.id`.
2. Exact unique normalized `portCode`/UN/LOCODE.
3. Exact normalized port name plus country and city, resolving to exactly one global Port.

Same-name ports in different countries never match. After an exact Port match, query `RoutePort(portId)`. Each customer route produces `DIRECT_PORT` and `INDIRECT_ROUTE` paths. The lowest route sequence is origin, highest is destination, and other sequences are intermediate. No route optimization is required.

A direct route match needs a verified route/transport identifier. Free-text `originLabel` and `destinationLabel` can at most produce an ambiguous candidate.

### Material and product

Require verified identifiers, authoritative namespaced master-data codes, or reviewed mappings. SKU matches require an owner/namespace. Generic names such as “steel” do not automatically establish identity unless the system uses an approved controlled commodity taxonomy.

### Geographic

Apply from most to least precise:

1. Coordinates within the configured radius.
2. Exact city + region + country.
3. Exact region + country.
4. Country only.

City never matches without country. Region never matches without country. Country-only proximity is `AMBIGUOUS` by default and cannot become direct/high confidence. Geographic matches never assert operational disruption.

| Evidence | Default decision |
|---|---|
| Exact coordinates within radius | `MATCH`, geographic `POTENTIAL` |
| Exact city/region/country | `MATCH`, geographic `POTENTIAL` |
| Exact region/country | low-confidence `MATCH` or `AMBIGUOUS`, policy controlled |
| Country only | `AMBIGUOUS` |
| City without country | `NO_MATCH` |

### Identity onboarding and verification workflow

Minimal human-managed identity onboarding is in scope for Phase 6. It is deterministic and available only to `ADMIN` and a `REVIEWER` assigned to the affected customer. There is no AI guessing, fuzzy automatic resolution, invented identifier, or automatic graph mutation.

#### Customer graph side

An authorized reviewer chooses an existing Supplier, Factory, Product, Material, Route, or relevant global Port from a customer-scoped selector and submits:

- controlled namespace;
- original identifier and normalized identifier;
- provenance type/source, such as customer ERP, official registry, carrier master data, UN/LOCODE registry, or reviewed contract/master-data record;
- source reference URL/document reference where permitted;
- evidence note;
- requested status.

New records begin `UNVERIFIED` unless an Admin or assigned Reviewer performs the verification action. Verification records `verifiedByUserId` and `verifiedAt`. A person cannot verify a reference for a customer they cannot access. Typed composite foreign keys prove that the selected graph object exists in that customer.

#### Event entity side and global governance

`EventEntityIdentifier` is global truth: once verified, it can affect deterministic exposure matching for many customers. Phase 6 V1 therefore locks these permissions:

- `ADMIN` may create, verify, reject, or supersede global `EventEntityIdentifier` records.
- An assigned `REVIEWER` may inspect only the EventEntity provenance reachable from an ambiguous candidate for their customer and submit identifier evidence as a `PROPOSED` record.
- `REVIEWER` must not directly set a global EventEntity identifier to `VERIFIED`, reject global truth, or supersede an Admin-verified identifier.
- A Reviewer proposal remains `PROPOSED`/non-matching until an Admin verifies it. `verifiedByUserId` and `verifiedAt` remain null before Admin verification; separate proposer attribution must be retained (`proposedByUserId`, `proposedAt`, or an immutable status-history row).
- Customer-side `CustomerGraphIdentity` for a reviewer's assigned customer may still be verified by either that assigned Reviewer or Admin because its effect is tenant-scoped.

An Admin or assigned Reviewer inspects the exact Claim/Article/Source provenance and submits an authoritative namespace/value plus provenance. `EventEntityIdentifier` links the identifier to the EventEntity, optional supporting Claim, source description/reference, evidence note, proposer, and eventual Admin verifier. The supporting Claim must belong to the Event through `EventClaim`, checked transactionally. Identity governance does not alter Event text or customer graph relationships, and it does not introduce a customer-specific EventEntity truth model.

Only `VERIFIED` EventEntity identifiers participate in deterministic direct matching. `PROPOSED`, `UNVERIFIED`, or `REJECTED` records may explain review state but cannot produce `MATCH`.

#### Collision and validation rules

- Namespace must come from a controlled registry with namespace-specific Zod validation and normalization.
- Identifier must be non-empty, length-bounded, and canonical for its namespace.
- Source/provenance and verifier attribution are required for `VERIFIED`.
- A verified Event identifier may not point to conflicting Event entities without explicit collision review.
- A verified customer identifier may not silently identify multiple different subjects in the same customer and namespace.
- Global identifiers intended to be unique, such as LEI or UN/LOCODE, receive database uniqueness appropriate to that namespace.
- Tenant-local master identifiers include their authoritative owner namespace; equal raw values under different owners are not equal identities.
- Conflicts produce `AMBIGUOUS_ENTITY_IDENTITY`/collision review, never an automatic match.
- Verification, rejection, replacement, and supersession remain auditable; records are not overwritten destructively.

Proposed APIs:

```text
GET  /api/customers/:customerId/graph-identities
POST /api/customers/:customerId/graph-identities
GET  /api/customers/:customerId/graph-identities/:identityId
POST /api/customers/:customerId/graph-identities/:identityId/verify
POST /api/customers/:customerId/graph-identities/:identityId/reject

GET  /api/customers/:customerId/exposure-candidates
GET  /api/customers/:customerId/exposure-candidates/:candidateId
POST /api/customers/:customerId/exposure-candidates/:candidateId/confirm
POST /api/customers/:customerId/exposure-candidates/:candidateId/reject

POST /api/customers/:customerId/exposure-candidates/:candidateId/event-identity-proposals

POST /api/admin/event-entities/:eventEntityId/identifiers
POST /api/admin/event-entity-identifiers/:identifierId/verify
POST /api/admin/event-entity-identifiers/:identifierId/reject
```

Candidate confirmation accepts the customer graph identity/provenance and intended typed customer subject. An assigned Reviewer may verify that tenant-scoped `CustomerGraphIdentity` and separately submit a global Event identity proposal. The transaction verifies membership, candidate version, EventEntity linkage, subject tenant ownership, namespace rules, and collisions. Normal deterministic reconciliation is queued only when both sides contain matching `VERIFIED` identifiers; an Admin verification of the global proposal provides that trigger. The workflow never attaches a Factory, Product, Route, or other graph edge.

## 9. Exposure confidence

Exposure confidence measures identity/path certainty and remains separate from Event confidence.

| Match | Proposed confidence |
|---|---:|
| Same verified global identifier | 1.00 |
| Same global `Port.id` | 1.00 |
| Exact unique UN/LOCODE | 0.99 |
| Reviewed explicit identity mapping | 0.99 |
| Exact legal name + country + strong discriminator | 0.94 |
| Exact factory composite identity | 0.94 |
| Explicit graph traversal from verified anchor | anchor × 0.97 per approved hop |
| Strict coordinate proximity | 0.85 |
| Exact city + region + country | 0.75 |
| Exact region + country | 0.55 |
| Country only | 0.30, ambiguous by default |
| Name-only company/facility | no automatic match |

Rules:

- An indirect path cannot exceed its anchor confidence.
- Each indirect hop uses a fixed versioned penalty.
- Multiple equivalent paths do not add confidence.
- Customer-level confidence is the maximum active-path confidence.
- Corroboration count may be reported but does not inflate confidence in Phase 6.
- A central `EXPOSURE_POLICY_VERSION` and its exact parameters are stored with every revision.
- Changing policy does not silently rewrite historic decisions.

## 10. Graph path representation

JSON alone is easy to return but weak for querying. Normalized live references are queryable but may lose their historical explanation. Existing-edge references alone are not durable after graph changes.

Use a hybrid:

- normalized `ExposurePath` and ordered `ExposurePathStep` rows;
- deterministic `pathKey`;
- live node IDs where available;
- an immutable JSON snapshot containing labels, attributes, edges, active state, Event anchor, match method, and reason codes.

Example:

```json
{
  "anchor": {
    "eventEntityId": "event-entity-id",
    "matchMethod": "GLOBAL_PORT_ID",
    "reasonCodes": ["EXACT_PORT_ID"]
  },
  "steps": [
    { "sequence": 0, "nodeType": "PORT", "nodeId": "port-id", "label": "Port of Rotterdam" },
    { "sequence": 1, "edge": "ROUTE_CONTAINS_PORT", "nodeType": "ROUTE", "nodeId": "route-id", "label": "Shanghai → Rotterdam" },
    { "sequence": 2, "edge": "ROUTE_SERVES_FACTORY", "nodeType": "FACTORY", "nodeId": "factory-id", "label": "Eindhoven Assembly" },
    { "sequence": 3, "edge": "FACTORY_PRODUCES_PRODUCT", "nodeType": "PRODUCT", "nodeId": "product-id", "label": "Control Module X" }
  ]
}
```

Auditability takes precedence over storage convenience.

## 11. Event-triggered processing

Material Event changes enqueue `EVENT_CHANGED(eventId, eventVersion)` transactionally. The future implementation must centralize the decision in one pure `classifyExposureMaterialEventChange(before, after, relationChanges)` rule used by every Event mutation path. No handler or worker may increment the version ad hoc.

`Event.exposureVersion` increments exactly once in the same transaction when at least one matching-material change occurs:

- an EventEntity is added, removed, retyped, or its normalized matching identity changes;
- an `EventEntityIdentifier` is verified, rejected, added, removed, superseded, or changes namespace/value;
- an EventLocation is added, removed, or changes matching-relevant country, region, city, coordinates, type, or normalized key;
- assertion or matching semantics change in a way that changes eligibility or interpretation;
- Event type changes;
- lifecycle changes between unresolved and `RESOLVED`/`CANCELLED`, or reactivation changes exposure lifecycle;
- conflict/matching semantics change when exposure policy explicitly treats that state as eligibility material.

It does **not** increment for presentation/aggregation-only changes:

- title or summary wording;
- supporting Claim/article/source counts;
- `firstSeenAt`/`lastSeenAt` alone;
- confidence alone;
- severity alone;
- provenance additions whose identities, locations, assertion semantics, and lifecycle are unchanged.

If one transaction makes several material edits, the version increments once. The work item deduplication key contains the resulting version. Tests for every Event mutation route must prove it delegates to the centralized classifier.

Processing:

1. Atomically claim a bounded lease.
2. Load Event matching facts and versioned policy.
3. Query indexed candidate identities, ports, and structured locations.
4. Group candidates by customer.
5. Reconcile candidate customers plus customers already exposed to the Event.
6. Upsert exposure and paths transactionally.
7. Mark prior paths absent from the complete result inactive.
8. Mark exposure `STALE` only when no current path remains.
9. Reflect explicit Event lifecycle without deleting history.
10. Complete the work item.

No customer × Event Cartesian scan is permitted.

## 12. Customer-graph-change-triggered processing

Every material graph mutation increments `Customer.graphRevision` and creates a `GRAPH_CHANGED` work item in the same transaction. Relevant mutations include node creation/update/archive, relationship attach/detach, route-port changes, location changes, and verified identity changes.

The work descriptor identifies affected node/edge types and identity/location keys. The worker searches only relevant unresolved Events and existing exposures referencing the changed node. Consequently, adding an affected Supplier today can discover an Event created yesterday.

A periodic bounded reconciliation may use graph/Event high-water marks as a safety net. It must not scan all customers against all Events.

## 13. Worker architecture

Synchronous hooks offer immediate results but couple Event/graph writes to expensive global matching, increase latency, and complicate retry. A dedicated `ExposureWorker` supports uniform Event and graph triggers, bounded batches, recoverable work, cross-process safety, and clean operational activation.

Recommendation: use a dedicated worker and transactional outbox-style `ExposureWorkItem` rows. API/admin reconciliation endpoints enqueue work and return `202`; they do not perform full matching synchronously. Phase 6 is eventually consistent within the worker polling interval.

## 14. Concurrency strategy

Database state is authoritative; in-memory locks are insufficient.

Use:

1. An atomic bounded lease on `ExposureWorkItem` with owner token and expiry.
2. A PostgreSQL transaction advisory lock keyed by `(customerId, eventId)` during reconciliation.
3. Unique `(customerId, eventId)` on `CustomerExposure`.
4. Unique `(exposureId, pathKey)` on `ExposurePath`.
5. Version checks preventing stale Event/graph work from overwriting newer state.

A crashed worker’s lease expires. Only the current owner may complete/release it. Two workers may calculate candidates concurrently, but only one customer/Event reconciliation transaction can commit logical state.

## 15. Idempotency strategy

The logical input state is:

```text
customerId + eventId + graphRevision + eventVersion + exposurePolicyVersion
```

Idempotency derives from deterministic normalization, traversal ordering and `pathKey`; unique database constraints; non-additive confidence; complete-set reconciliation; and no revision for unchanged output. Before commit, the transaction verifies that loaded Event and graph versions remain current. If not, it aborts and retries/enqueues the latest version.

Repeated processing creates no duplicate exposure, no duplicate path, no inflated confidence, and no duplicate history revision.

## 16. Audit and history strategy

Two explanation chains remain separate:

```text
WHY DO WE BELIEVE THE EVENT?
CustomerExposure → Event → EventClaim → Claim → ExtractionRun
                 → SourceArticle → original URL → Source
```

```text
WHY DO WE THINK IT AFFECTS THIS CUSTOMER?
CustomerExposure → ExposurePath → ordered path steps
                 → graph snapshots + match method + reason codes
```

Phase 6 reuses existing Event provenance rather than duplicating article evidence. Exposure revisions and immutable path snapshots preserve explanations after archival, relationship removal, route changes, Event resolution, or policy changes. Reconciliation under a newer policy creates a new revision; it never silently recalculates old revisions.

Existing soft-deactivation semantics should remain. Operational graph records referenced by exposure history must not be hard-deleted through normal APIs.

## 17. API design

Customer-scoped routes:

```text
GET   /api/customers/:customerId/exposures
GET   /api/customers/:customerId/exposures/:exposureId
PATCH /api/customers/:customerId/exposures/:exposureId/status
POST  /api/customers/:customerId/exposures/:exposureId/reconcile
```

Admin operations:

```text
POST /api/events/:eventId/reconcile-exposures
GET  /api/admin/exposure-work-items
```

Identity and ambiguous-candidate APIs are defined in the onboarding section. Candidate list/detail/confirm/reject routes require `ADMIN` or an assigned `REVIEWER`; `CUSTOMER` receives `403` and the candidate must not be included inside the normal exposure list/detail envelope.

Identity API authorization is explicit:

- Assigned Reviewer may create/manage/verify `CustomerGraphIdentity` only for the assigned customer, inspect candidate-bounded Event provenance, and submit an Event identity proposal.
- Reviewer cannot call global Event identifier verify/reject/supersede operations and cannot set `verificationStatus=VERIFIED` through proposal payloads.
- Admin may create global Event identifiers directly and is the only role that can verify, reject, or supersede them.
- Both Admin and assigned Reviewer may review ambiguous candidates and confirm/dismiss exposures; `CUSTOMER` may do neither.

Reconciliation returns `202`. List filters include status, exposure type, Event type, severity, supplier, factory, port, route, date range, minimum match confidence, page, and page size. IDs in filters are always checked within the requested customer.

Detail includes exposure lifecycle, separate Event and exposure confidence, active and historical paths, deterministic reasons, bounded Event provenance, and review metadata. It excludes lease tokens, unrestricted candidate sets, and other tenants’ metadata.

## 18. Minimal UI design

Add one `Exposures` navigation item without redesigning the dashboard.

List columns:

- Event
- Event severity
- Exposure type
- Primary affected node
- Exposure confidence
- Status
- First detected
- Last matched

Detail sections:

1. **Event** — what happened, Event lifecycle, severity, and Event confidence.
2. **Why it may matter to you** — exposure lifecycle, separate match confidence, direct/indirect/geographic label, reason codes rendered as text, ordered graph path, and stale/archive warnings.
3. **Evidence** — Claims, evidence text, articles, original source URLs, and Sources.

Ambiguous candidates have a separate review screen visible only to `ADMIN` and assigned `REVIEWER`. It shows candidate nodes, signals, reason codes, Event evidence, identifier provenance fields, graph/Event versions, and Confirm/Reject actions. Confirm requires an authoritative identity and provenance; Reject requires a controlled reason. Candidates never appear in the Customer exposure list. No alert controls, risk score, recommendation, or fake actions are added.

## 19. Tenant authorization and security review

All customer routes use:

```text
requireAuth → validate customerId → requireCustomerAccess
            → query by customerId + exposureId
```

- `CUSTOMER`: only customers represented by membership.
- `REVIEWER`: only customers represented by membership; no global customer access.
- `ADMIN`: platform-wide access.
- Confirmation/dismissal belongs only to `ADMIN` and assigned `REVIEWER`.
- Ambiguous candidates and identity-onboarding UI/API are visible only to `ADMIN` and assigned `REVIEWER`, never `CUSTOMER`.
- Global `EventEntityIdentifier` verification/rejection/supersession is Admin-only because its result can affect many customers. Assigned Reviewers can submit `PROPOSED` evidence only through their customer candidate scope.
- Customer exposure detail may return only bounded provenance for its Event; it must not grant `CUSTOMER` access to the unrestricted global Event corpus.
- Every path, node lookup, filter, export, and worker write includes `customerId`.
- Logs contain IDs, controlled decisions, timings, and safe error codes—not graph snapshots, evidence bodies, customer master data, tokens, or secrets.

Required security tests:

- unauthenticated request is `401`;
- Customer A cannot list or fetch Customer B exposure, including guessed UUIDs;
- unassigned Reviewer is rejected;
- assigned Reviewer is limited to assigned customers;
- Admin has global access;
- a path cannot contain a node from another customer;
- cross-customer identity/path joins fail;
- customer-facing provenance does not expose unrelated global records;
- supplier/factory/route filter IDs cannot escape tenant scope;
- work/lease endpoints are Admin-only;
- worker transactions never mix tenants;
- logs and future exports do not leak other tenants or secrets;
- dev auth remains unavailable in staging/production.

## 20. Index and performance strategy

Candidate lookup is indexed rather than Cartesian.

Verified identity:

```text
EventEntityIdentifier(namespace, normalizedIdentifier)
→ CustomerGraphIdentity(namespace, normalizedIdentifier, VERIFIED)
→ customerId + subject
```

Port:

```text
Event port identity/UNLOCODE → Port(id/portCode)
→ RoutePort(portId) → customerId + routeId
```

Location should use normalized `countryCode`, `regionKey`, `cityKey`, latitude, and longitude projections for graph nodes. Useful indexes:

- `(namespace, normalized_identifier, verification_status)`
- `(portCode)` and existing `RoutePort(portId)`
- `(countryCode, regionKey, cityKey, active)`
- `(customerId, countryCode, regionKey, cityKey)`
- `(eventId, status)` on exposures
- `(customerId, status, lastMatchedAt)` on exposures
- typed path-step indexes `(customerId, supplierId)`, `(customerId, factoryId)`, `(customerId, productId)`, `(customerId, materialId)`, `(customerId, routeId)`, and global `(portId)`
- typed identity partial unique indexes per subject and `(namespace, normalizedIdentifier, verificationStatus)` candidate lookup
- `(customerId, status, updatedAt)` on ambiguous candidates
- `(status, nextAttemptAt, createdAt)` on work items

V1 can use bounded latitude/longitude boxes followed by deterministic Haversine verification. PostGIS is optional later.

Conceptual Event query flow:

1. Resolve verified identifiers.
2. Query the identity index.
3. Resolve exact ports and `RoutePort` joins.
4. Query precise structured locations.
5. Union candidate `(customerId, nodeType, nodeId)` tuples.
6. Load only their graph neighborhoods.
7. Reconcile affected customers and existing exposure holders.

## 21. Forward-safe migration plan

No reset or destructive backfill.

1. Add enums.
2. Add `Customer.graphRevision` defaulting to `0`.
3. Add `Event.exposureVersion` defaulting to `1`.
4. Add typed identity, exposure, typed path-step, ambiguous-candidate, revision, and work tables.
5. Add composite tenant foreign keys, one-subject `CHECK` constraints, typed partial unique indexes, and remaining indexes/unique constraints.
6. Deploy code capable of reading empty Phase 6 tables.
7. Begin transactional graph/Event revision increments and work enqueueing.
8. Start the ExposureWorker only after validation.
9. Optionally enqueue bounded reconciliation of existing Events and verified identities.

No existing Supplier/Factory names are backfilled as verified identities. Existing ports may use their stable `Port.id` and unique `portCode`. Existing Event `policyVersion` values remain intact. Old Phase 1–5 application versions ignore the new tables; rollback stops the worker first and retains all audit tables. Enum values and exposure history are not dropped during operational rollback.

Migration tests cover a clean deploy and an upgrade from the Phase 5 migration state, preserving all existing customers, memberships, graph records, Claims, provenance, Events, fingerprints, and policy versions.

## 22. Failure modes

| Failure | Detection | Behaviour | Recovery |
|---|---|---|---|
| False-positive supplier name | no verified identifier/collision | `AMBIGUOUS` or `NO_MATCH` | reviewed mapping or corrected master data |
| False-negative supplier | identity absent | no exposure | add verified identity; graph trigger rematches |
| Stale graph | path revision behind customer | abort/mark stale | process latest graph work item |
| Archived/deleted node | active state/reference check | retain snapshot; invalidate live path | new path or review |
| Duplicate processing | unique keys and lock | one logical result | idempotent retry |
| Worker crash | expired lease | item remains reclaimable | another worker claims it |
| Concurrent processing | advisory lock/version checks | one transaction commits | loser skips/retries |
| Ambiguous entity | multiple candidates | no confirmed exposure | human review |
| Ambiguous location | missing/colliding geography | no direct match | enrich structured location |
| Event changes mid-match | version mismatch | stale commit aborts | process latest version |
| Graph changes mid-match | revision mismatch | stale commit aborts | process latest revision |
| Partial transaction failure | transaction rollback | no partial path set | retry item |
| Policy changes | stored version differs | history remains | explicit new reconciliation |
| Event confidence only changes | identity unchanged | exposure identity/path stable | display live Event confidence |
| Event resolves | explicit lifecycle | exposure becomes `RESOLVED` | reactivation creates revision |

## 23. Complete adversarial acceptance tests

### Required semantic cases

1. **Exact Supplier match**: verified Event Supplier identifier equals a tracked customer Supplier identifier → `MATCH`, `DIRECT_SUPPLIER`.
2. **Same supplier name, different legal entity**: shared normalized name but different legal identifier/country → no automatic match; `NO_MATCH` or explicit `AMBIGUOUS`.
3. **Affected factory belongs to same supplier but is outside customer graph**: customer tracks Supplier A and Factory X; Event affects Supplier A’s Factory Y, which is not tracked → no direct Factory exposure and reason `FACTORY_NOT_IN_CUSTOMER_GRAPH`.
4. **Exact Factory match**: verified facility identity equals customer Factory → `MATCH`, `DIRECT_FACTORY`.
5. **Route contains affected Port**: Event resolves to the exact Port used by active `RoutePort` → direct Port plus indirect Route path, with correct origin/destination/intermediate reason.
6. **Same port name, another country**: normalized port names equal but country differs → `NO_MATCH`, `PORT_COUNTRY_MISMATCH`.
7. **Exact-city geographic exposure**: Event and Factory share exact city, region, and country → geographic `POTENTIAL`, never confirmed direct disruption.
8. **Country-only exposure**: Event and graph node share only country → `AMBIGUOUS` by default, low confidence, never high/direct.
9. **Ambiguous identity**: multiple customer nodes satisfy incomplete identity → `AMBIGUOUS`; no confirmed CustomerExposure/path.
10. **Repeated processing**: identical Event/customer state processed twice → one exposure, one of each logical path, no confidence inflation or duplicate revision.
11. **Concurrent processing**: two workers process the same Event/customer → one logical exposure and path set.
12. **Customer adds Supplier after Event exists**: graph revision/work item finds the unresolved existing Event and creates the applicable exposure.
13. **Customer removes/archives Supplier after exposure**: current path becomes inactive/stale as appropriate, while immutable path and exposure history remain inspectable.
14. **Event resolves**: exposure becomes `RESOLVED` without deletion; provenance and path history remain.
15. **Event confidence changes**: exposure path identity remains stable unless Event entity/location matching evidence changes; Event and exposure confidence remain separate.
16. **Cross-tenant path reference**: direct SQL attempts to attach Customer A `ExposurePathStep` to Customer B Factory → composite foreign key rejection.
17. **Cross-tenant identity reference**: direct SQL attempts to attach Customer A `CustomerGraphIdentity` to Customer B Supplier → composite foreign key rejection.
18. **Exactly one typed path-step subject**: zero or two typed IDs, or a `nodeType`/column mismatch → database `CHECK` rejection.
19. **Ambiguity persists separately**: `AMBIGUOUS` creates/updates `ExposureCandidate` and creates no `CustomerExposure`.
20. **Candidate authorization**: `CUSTOMER` cannot list or fetch ambiguous candidates; assigned Reviewer and Admin can.
21. **Reviewer confirms candidate**: confirmation records reviewer/provenance, creates or verifies the typed identity mapping, marks the candidate confirmed, and queues reconciliation; only subsequent deterministic `MATCH` creates exposure.
22. **Reviewer rejects candidate**: rejection records reviewer/time/reason, creates no identity/exposure, and remains stable on unchanged reprocessing.
23. **Verified identity on both sides**: verified `EventEntityIdentifier(namespace, value)` equals verified typed `CustomerGraphIdentity(namespace, value)` → deterministic match.
24. **Name-only EventEntity**: matching normalized name without authoritative identifier/discriminator → no automatic match.
25. **Conflicting identifiers**: collision/conflicting mappings produce an ambiguous collision record and never silently match.
26. **Identity provenance audit**: creation, verification, verifier, timestamp, source/reference, rejection/supersession, and supporting Claim remain inspectable.
27. **Exposure version materiality**: entity identity, matching location, assertion semantics, Event type, and exposure-affecting lifecycle changes increment `Event.exposureVersion` once per transaction; title, summary, counts, confidence, severity, or timestamps alone do not.
28. **Cross-tenant path parent**: direct SQL attempts to insert a Customer B `ExposurePathStep` under Customer A `ExposurePath` → composite `(pathId, customerId)` foreign-key rejection, even when the referenced graph node belongs to Customer B.
29. **Cross-tenant resulting identity**: direct SQL attempts to link Customer A `ExposureCandidate` to Customer B `CustomerGraphIdentity` → composite `(resultingIdentityId, customerId)` foreign-key rejection.
30. **Reviewer global verification denied**: assigned Reviewer calling global `EventEntityIdentifier` verify/reject/supersede → `403`, with no status change.
31. **Reviewer proposal accepted**: assigned Reviewer submits candidate-bounded identifier evidence → auditable `PROPOSED` record with proposer attribution, not `VERIFIED`.
32. **Admin verifies proposal**: Admin verifies the proposed global identifier → status `VERIFIED`, Admin verifier/timestamp recorded, and material Event reconciliation queued.
33. **Unverified identifier cannot match**: matching CustomerGraphIdentity plus `PROPOSED`, `UNVERIFIED`, or `REJECTED` EventEntityIdentifier → no deterministic direct exposure `MATCH`.
34. **Verified identifier matches normally**: after Admin verification, the same authoritative identifier may produce the normal deterministic `MATCH` and exposure reconciliation.

### Additional unit tests

- product/material identifiers require namespaces;
- name-only Supplier and Factory matches are rejected;
- city without country is rejected;
- region/country confidence follows policy;
- explicit graph traversal never invents an edge;
- indirect confidence never exceeds its anchor;
- deterministic canonical path ordering and hashing;
- dismissal survives no-op reconciliation;
- materially new evidence can reopen a dismissed/stale exposure according to policy.

### PostgreSQL integration tests

- complete Supplier → Product and Port → Route → Factory/Product paths;
- tenant checks on every path construction;
- archived node retains snapshot;
- graph/Event versions reject stale writes;
- Event resolution and reactivation append history;
- existing Phase 1–5 provenance remains reachable;
- work lease expiry and recovery;
- no duplicate exposure/path/revision under retry.
- database rejects every typed cross-customer path-step and identity reference;
- database enforces exactly one typed subject and matching subject/node type;
- candidate confirmation/rejection transactions remain atomic with identity provenance and work enqueueing.
- database rejects a step whose `customerId` differs from its parent ExposurePath through the composite parent foreign key;
- database rejects a candidate whose resulting identity belongs to another customer through the composite identity foreign key;
- global Event identity proposal and Admin verification preserve proposer/verifier history and trigger matching only after verification.

### PostgreSQL concurrency tests

- two independent service instances reconcile the same customer/Event concurrently;
- exactly one `CustomerExposure` exists;
- exactly one path per `pathKey` exists;
- no duplicate material revision exists;
- an expired lease is reclaimable;
- an old owner cannot complete a reclaimed item.

### Authorization and migration tests

Authorization tests are listed in the security review. Migration verification must exercise clean install and Phase 5 upgrade without resetting or losing data. Tests are deterministic and use no live AI provider.

## 24. Known limitations

- Existing Events and customer master data may lack stable global identifiers.
- Conservative rules prefer false negatives over unsafe false positives.
- Broad country-level Events are intrinsically ambiguous.
- No shipment-level tracing or route optimization.
- Geographic proximity cannot establish operational disruption.
- Identity onboarding requires verified human/master-data input.
- Event lifecycle and exposure lifecycle may lag by the worker polling interval.

Explicitly out of scope:

- risk scoring;
- priority scoring;
- actionability scoring;
- recommended actions;
- alerts;
- Daily Brief;
- notifications;
- email, Slack, Teams, SMS, push;
- AI graph matching;
- automatic supplier discovery;
- automatic customer graph mutation.

An Event severity of `HIGH` and exposure confidence of `0.95` does not mean customer risk is `95`.

## 25. Approved product and architecture decisions

The following choices are locked for Phase 6:

1. Ambiguous candidates are visible only to `ADMIN` and a `REVIEWER` assigned to the customer; never to `CUSTOMER`.
2. Exposure confirmation and dismissal are allowed only for `ADMIN` and assigned `REVIEWER`.
3. Country-only geographic correlation is `AMBIGUOUS` by default and does not create a CustomerExposure.
4. Minimal human-managed identity onboarding is in scope, with no AI guessing, fuzzy automatic resolution, invented identifiers, or graph mutation.
5. Customer graph changes reconcile against all unresolved Events.
6. Granularity is one `CustomerExposure` per Customer × Event with multiple `ExposurePath` records.
7. Global EventEntity identity governance is Admin-controlled: assigned Reviewers may propose evidence, but only Admin may create globally verified truth or verify/reject/supersede proposals.

No material product decisions remain open in this revision. Any future proposal to change these semantics requires explicit approval and a design/version update.

No unresolved Phase 6 design decisions remain.

## 26. Decisions requiring approval

None. The previously open semantic choices are approved and locked in the preceding section.

No Phase 6 implementation, migration, risk scoring, alerts, or future-phase functionality is authorized by this design document.

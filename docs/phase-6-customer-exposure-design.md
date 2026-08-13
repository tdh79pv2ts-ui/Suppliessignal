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
  LOCATION
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
  nodeId             String?          @map("node_id") @db.Uuid
  edgeFromPrevious   String?          @map("edge_from_previous")
  labelSnapshot      String           @map("label_snapshot")
  attributesSnapshot Json?            @map("attributes_snapshot")
  activeSnapshot     Boolean?         @map("active_snapshot")
  path               ExposurePath     @relation(fields: [pathId], references: [id], onDelete: Restrict)

  @@unique([pathId, sequence])
  @@index([customerId, nodeType, nodeId])
  @@map("exposure_path_steps")
}

model CustomerGraphIdentity {
  id                    String        @id @default(uuid()) @db.Uuid
  customerId            String        @map("customer_id") @db.Uuid
  subjectType           IdentitySubjectType @map("subject_type")
  subjectId             String        @map("subject_id") @db.Uuid
  namespace             String
  identifier            String
  normalizedIdentifier  String        @map("normalized_identifier")
  verificationStatus    IdentityVerificationStatus @map("verification_status")
  source                String
  verifiedAt            DateTime?     @map("verified_at")
  verifiedByUserId      String?       @map("verified_by_user_id") @db.Uuid
  customer              Customer      @relation(fields: [customerId], references: [id], onDelete: Restrict)
  verifiedBy            User?         @relation(fields: [verifiedByUserId], references: [id], onDelete: Restrict)
  createdAt             DateTime      @default(now()) @map("created_at")
  updatedAt             DateTime      @updatedAt @map("updated_at")

  @@unique([customerId, subjectType, subjectId, namespace, normalizedIdentifier])
  @@index([namespace, normalizedIdentifier, verificationStatus])
  @@index([customerId, subjectType, subjectId])
  @@map("customer_graph_identities")
}

model EventEntityIdentifier {
  id                    String   @id @default(uuid()) @db.Uuid
  eventEntityId         String   @map("event_entity_id") @db.Uuid
  namespace             String
  identifier            String
  normalizedIdentifier  String   @map("normalized_identifier")
  sourceClaimId         String?  @map("source_claim_id") @db.Uuid
  verificationStatus    IdentityVerificationStatus @map("verification_status")
  createdAt             DateTime @default(now()) @map("created_at")

  @@unique([eventEntityId, namespace, normalizedIdentifier])
  @@index([namespace, normalizedIdentifier, verificationStatus])
  @@map("event_entity_identifiers")
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

`ExposurePathStep.nodeId` is polymorphic and cannot have one foreign key. The service must validate every live reference inside a customer-scoped transaction. The composite `CustomerExposure(id, customerId)` relationship and path-level `customerId` constrain the tenant boundary. Immutable snapshots preserve auditability if a live node is later archived or unavailable. A wider model with nullable typed foreign keys can be chosen during implementation if database-enforced step references are preferred.

Identity namespaces may include `LEI`, `DUNS`, `VAT`, `UNLOCODE`, `IMO`, or a named authoritative customer master-data namespace. Identifiers must never be invented. A customer-local UUID is not automatically a global identity.

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

Material Event changes enqueue `EVENT_CHANGED(eventId, eventVersion)` transactionally.

Material changes include Event creation; entity, identifier, or location changes; lifecycle changes; and matching evidence changes. Confidence-only changes, title/summary wording, Claim counts, or provenance additions without identity/location changes do not alter exposure identity.

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

Ambiguous candidates belong in an explicit review state and must not look confirmed. No alert controls, risk score, recommendation, or fake actions are added.

## 19. Tenant authorization and security review

All customer routes use:

```text
requireAuth → validate customerId → requireCustomerAccess
            → query by customerId + exposureId
```

- `CUSTOMER`: only customers represented by membership.
- `REVIEWER`: only customers represented by membership; no global customer access.
- `ADMIN`: platform-wide access.
- Confirmation/dismissal initially belongs to `ADMIN` and assigned `REVIEWER`, pending product approval.
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
- `(customerId, nodeType, nodeId)` on path steps
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
4. Add identity, exposure, path, revision, and work tables.
5. Add indexes and unique constraints.
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

## 25. Decisions requiring approval

1. **Ambiguity visibility**: show ambiguous candidates only to `ADMIN`/assigned `REVIEWER`, or also to customers under an explicit “Needs review” label? Recommended: reviewer/admin only initially.
2. **Who may confirm/dismiss**: limit review transitions to `ADMIN` and assigned `REVIEWER`, or allow customer members to manage their own exposure state? Recommended: admin/reviewer initially.
3. **Country-only candidates**: keep country-only geography `AMBIGUOUS` by default, or create low-confidence `POTENTIAL` exposure? Recommended: ambiguous.
4. **Identity onboarding scope**: include a minimal human-managed identity mapping interface in Phase 6? Recommended: yes, without automatic discovery.
5. **Historic reconciliation horizon**: graph changes should examine all unresolved Events or also recent resolved Events? Recommended: all unresolved Events only, with resolved history handled by explicit reconciliation.
6. **Path granularity**: one customer/Event exposure with multiple paths versus one exposure per path. Recommended: one customer/Event exposure with multiple paths to keep lifecycle and future alert semantics coherent.

No Phase 6 implementation, migration, risk scoring, alerts, or future-phase functionality is authorized by this design document.

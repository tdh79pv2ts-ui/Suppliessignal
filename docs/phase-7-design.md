# Phase 7 — Decision Support Layer design

Status: design proposal only. This document authorizes no implementation, migration, or application change.

## 1. Executive summary

Phase 7 turns confirmed, evidence-backed customer exposures into an ordered, explainable workspace for human attention. It answers “what should we look at first, and why?” without deciding what the customer should do.

```text
Sources → Articles → Claims → Event
                              ↓
Customer graph → CustomerExposure → ExposurePaths
                                      ↓
                           Decision-support assessment
                                      ↓
                         Human-owned review and action log
```

The recommended V1 uses a deterministic attention policy, not a risk score. It orders eligible exposures lexicographically into transparent attention tiers using stored facts: exposure review state, customer asset criticality, Event lifecycle/severity, match certainty, evidence recency, and explicit customer business context. Every factor has a reason code and direct evidence reference. Missing context remains unknown; it is never inferred.

One working “decision-support case” exists per Customer × CustomerExposure. Versioned assessments preserve the exact exposure, Event, graph, context, and policy versions used. Humans may acknowledge, monitor, assign, annotate, or close a case; the system neither recommends an operational response nor performs one.

## 2. Problem statement and purpose

Phase 6 establishes whether an Event has a deterministic path to a customer asset. It deliberately does not explain relative operational relevance across many valid exposures. A customer may therefore face a queue containing different Events, paths, asset criticalities, evidence ages, and review states without a safe way to decide where to begin.

Phase 7 exists to:

- aggregate the factual context already stored for an exposure;
- make the reasons for its ordering visible and reproducible;
- let customers add explicit business context that the supply-chain graph does not contain;
- support a controlled human review and manual follow-up workflow;
- preserve what users saw, concluded, and did at each point in time.

It does not determine business impact, predict loss, prescribe mitigation, or claim that attention order equals risk.

### Relationship to Phase 6

Phase 6 remains authoritative for Event-to-customer matching. Phase 7 consumes `CustomerExposure`, `ExposurePath`, Event provenance, and explicit customer context. It must not create or repair exposures, identity mappings, graph nodes, or graph relationships. An ambiguous Phase 6 candidate is not eligible for customer decision support until Phase 6 review and reconciliation produce a confirmed exposure.

## 3. Scope

### In scope

- A customer-scoped attention queue over eligible exposures.
- Deterministic, policy-versioned attention tiers and ordered reason codes.
- Factual impact explanations derived from exposure paths and customer-supplied context.
- Explicit business context for existing graph nodes, with provenance and history.
- Case assignment, review state, human notes, manual follow-up records, and immutable audit history.
- Evidence navigation through Event, Claims, Articles, Sources, and exposure paths.
- Customer display preferences and saved filters that do not alter shared decisions.
- Reviewer validation of interpretation and Admin management of versioned policy defaults.

### Non-scope

Phase 7 does not include:

- automatic decisions or autonomous actions;
- risk, probability-of-loss, financial-loss, or priority scores;
- ML scoring or opaque ranking;
- AI-generated recommendations, summaries, or unsupported conclusions;
- alerts, notifications, Daily Briefs, email, Slack, Teams, SMS, or push;
- automatic supplier communication or workflow integrations;
- procurement, inventory, shipment, ERP, ticketing, or incident-response execution;
- changes to Phase 6 matching, identity governance, exposure lifecycle, or customer graph;
- automatic inference of lead times, dependencies, alternatives, owners, or criticality.

## 4. Product concept

“Decision Support Layer” is an architectural label, not an approved product name. Its working concepts are:

1. **Attention queue** — ordered exposures with explicit tier and reason codes.
2. **Impact view** — factual Event, exposure path, affected assets, and supplied business context.
3. **Decision-support case** — the customer-scoped review container for one exposure.
4. **Assessment revision** — an immutable calculation explaining why a case appeared where it did.
5. **Human action log** — user-authored acknowledgements, assignments, notes, and manual outcomes.

The product must distinguish these concepts visually and semantically:

| Concept | Meaning | Must not be presented as |
| --- | --- | --- |
| Event confidence | confidence in the global Event construction | customer impact probability |
| Exposure confidence | certainty of the Event-to-graph match | likelihood or magnitude of loss |
| Asset criticality | customer master-data classification | proof that an Event disrupts the asset |
| Attention tier | deterministic queue ordering | risk score or recommended action |
| Human review | a recorded user judgment | verified external truth unless separately evidenced |

## 5. Proposed architecture

```text
CustomerExposure material change ─┐
Customer business-context change ─┼→ DecisionSupportWorkItem
Decision policy activation ───────┘             ↓
                                      DecisionSupportWorker
                                                ↓
                           load exact eligible exposure + evidence
                                                ↓
                           deterministic AttentionPolicy evaluator
                                                ↓
                         Case + immutable AssessmentRevision + Factors
                                                ↓
                      API → attention queue/detail → human action log
```

Recommended boundaries:

| Component | Responsibility |
| --- | --- |
| `DecisionSupportService` | Customer-scoped reads, human workflow commands, and work enqueueing. |
| `AttentionPolicy` | Pure deterministic eligibility, tier, ordering tuple, and reason-code evaluation. |
| `ImpactExplanationBuilder` | Builds structured statements from approved templates and stored facts. |
| `DecisionSupportWorker` | Claims recoverable database work, evaluates current versions, and commits revisions. |
| `DecisionPolicyService` | Validates, versions, activates, and audits policy configurations. |
| `BusinessContextService` | Maintains explicit, tenant-safe context and its provenance/history. |

The database is authoritative. In-memory caches may improve reads but must not define correctness, concurrency, ordering, or audit history.

### Eligibility

Recommended V1 eligibility is explicit:

- the `CustomerExposure` belongs to the requested customer;
- its status is `CONFIRMED`;
- at least one auditable path exists, active or retained for a lifecycle transition;
- its Event and provenance remain readable;
- an assessment can identify its exact Event exposure version, customer graph revision, and exposure policy version.

`POTENTIAL`, `DISMISSED`, and Phase 6 `ExposureCandidate` records do not enter the customer queue. `RESOLVED` and `STALE` cases remain inspectable and may move out of the active queue according to policy; they are never deleted.

### Triggering and consistency

Material exposure changes enqueue work in the same transaction as the future Phase 7 hook. Business-context revisions and policy activation enqueue bounded customer work. The worker checks all loaded versions before commit. Eventual consistency is acceptable and visible through `assessmentState` and `lastAssessedAt`; stale assessment data must never masquerade as current.

Phase 7 does not need to react to presentation-only Event title changes. Changes to evidence, exposure lifecycle/path, match confidence, Event lifecycle/severity, asset criticality, relevant business context, or decision policy may be assessment-material. This classification must be centralized and tested rather than scattered through handlers.

## 6. Deterministic attention model

### Recommended V1 decision

Do not create a numeric composite score. Use an explainable tier plus a stable lexicographic ordering tuple. Working tier names are:

- `REVIEW_NOW`
- `REVIEW_SOON`
- `MONITOR`

These names are provisional. They express queue placement only. They do not mean an Event will cause harm and do not prescribe an operational response.

### Inputs

Only persisted, attributable inputs may be used:

- exposure status, type, match state, match confidence, and path state;
- Event lifecycle, severity, assertion mode, conflict state, confidence, and evidence recency;
- criticality already stored on affected Supplier, Factory, Product, Material, or Route;
- explicit graph path breadth and directness;
- explicit, verified customer business context, such as a customer-set operational importance band, documented single-source dependency, recovery-time band, or internal owner;
- human case state, acknowledgement, and due date.

Missing values use an `UNKNOWN` reason and never receive a favorable or adverse inferred value. Multiple paths may widen the factual impact explanation but must not mechanically multiply urgency.

### Evaluation sequence

The versioned policy should produce:

```ts
type AttentionDecision = {
  eligible: boolean;
  tier: "REVIEW_NOW" | "REVIEW_SOON" | "MONITOR" | null;
  orderingTuple: readonly number[];
  reasonCodes: AttentionReasonCode[];
  factors: AttentionFactorResult[];
  limitations: DecisionLimitationCode[];
  policyVersion: string;
};
```

Recommended precedence is deterministic:

1. unresolved and unacknowledged before resolved/acknowledged;
2. explicit customer context needing review before context marked lower relevance;
3. higher affected-node criticality before lower criticality;
4. direct verified path before indirect or geographic path;
5. current Event severity and lifecycle as separate factual factors;
6. newer material evidence before older evidence;
7. stable tie-break by `firstDetectedAt`, then case ID.

Exact tier rules, enum names, and precedence weights require product approval before implementation. The ordering tuple and every factor must be returned to the UI; no hidden tie-break may affect order except the documented stable ID tie-break.

### Explainability and limitations

An explanation is structured, not free-form generated text. Example reason codes include:

```text
UNACKNOWLEDGED_CONFIRMED_EXPOSURE
CRITICAL_CUSTOMER_ASSET
HIGH_CUSTOMER_ASSET
VERIFIED_DIRECT_PATH
INDIRECT_EXPLICIT_PATH
GEOGRAPHIC_PATH_ONLY
ACTIVE_EVENT
EVENT_CONFLICT_PRESENT
RECENT_SUPPORTING_EVIDENCE
BUSINESS_CONTEXT_REVIEW_REQUIRED
BUSINESS_CONTEXT_UNKNOWN
EXPOSURE_STALE
EVENT_RESOLVED
```

The UI maps codes to reviewed templates containing exact stored values. It must show limitations such as “match confidence is not impact probability,” “geographic exposure does not prove disruption,” and “business context is incomplete.”

### Human override

Authorized humans may change a case’s queue tier only through an explicit override record containing previous tier, selected tier, reason code, optional note, actor, and timestamp. An override does not alter the deterministic assessment, Event, exposure, graph, or policy. The UI shows calculated and overridden tiers separately. Removing an override restores the current calculated tier and adds audit history.

## 7. Data model proposal

These are conceptual Prisma shapes only. Names and fields may change after open decisions are approved.

### Enums

```prisma
enum DecisionCaseStatus {
  NEW
  IN_REVIEW
  ACKNOWLEDGED
  MONITORING
  CLOSED
}

enum AttentionTier {
  REVIEW_NOW
  REVIEW_SOON
  MONITOR
}

enum AssessmentState {
  CURRENT
  STALE
  FAILED
}

enum DecisionActionType {
  ACKNOWLEDGED
  ASSIGNED
  UNASSIGNED
  STATUS_CHANGED
  TIER_OVERRIDDEN
  TIER_OVERRIDE_REMOVED
  NOTE_ADDED
  MANUAL_OUTCOME_RECORDED
}

enum BusinessContextStatus {
  DRAFT
  VERIFIED
  SUPERSEDED
}
```

### Core records

`DecisionSupportCase`

- `id`, `customerId`, `exposureId`
- current workflow status, assigned user, calculated tier, optional override tier
- current assessment revision ID, acknowledged/closed timestamps
- created/updated timestamps
- unique `(customerId, exposureId)` and unique `(id, customerId)`
- composite `(exposureId, customerId) → CustomerExposure(id, customerId)`

`DecisionAssessment`

- `id`, `customerId`, `caseId`, monotonically increasing revision
- calculated tier and complete ordering tuple
- exposure ID/status/version snapshot, Event ID/exposure version/policy version
- graph revision, Phase 6 exposure policy version, Phase 7 decision policy version
- context revision set/hash, assessment state, reason codes, limitation codes
- structured explanation snapshot and calculation timestamp
- unique `(caseId, revision)` and unique `(id, customerId)`
- composite tenant-safe parent relation to the case

`DecisionAssessmentFactor`

- `id`, `customerId`, `assessmentId`, factor type, reason code
- source kind, typed source reference where practical, raw categorical/decimal/date value
- ordering position/result, applicability, limitation code
- composite `(assessmentId, customerId) → DecisionAssessment(id, customerId)`

`DecisionEvidenceLink`

- exact `assessmentId`, `customerId`, `exposurePathId`, `eventClaim(eventId, claimId)`, and optional path-step reference
- a role such as `EVENT_EVIDENCE`, `EXPOSURE_PATH`, or `BUSINESS_CONTEXT_PROVENANCE`
- immutable title/URL/label snapshots needed for audit display
- foreign keys prove the Claim supports the Event and the path belongs to the same customer exposure
- uniqueness prevents the same evidence role/link being stored twice

`DecisionActionLog`

- append-only customer-scoped action records with actor, action type, reason code, typed before/after payload, optional user-authored note, and timestamp
- composite tenant-safe relations to case and assessment where applicable
- corrections append new rows; no destructive overwrite

### Business context

`CustomerAssetContext` attaches only to an existing Supplier, Factory, Product, Material, Route, or relevant Port. It follows the Phase 6 typed-reference pattern:

- `customerId`, `subjectType`, and exactly one of `supplierId`, `factoryId`, `productId`, `materialId`, `routeId`, or `portId`;
- composite tenant-safe foreign keys for customer-owned subjects;
- database `CHECK` constraints for exactly one subject and matching `subjectType`;
- operational importance band, dependency type, recovery-time band, context owner, effective dates, status, provenance type/reference, verifier, and revision;
- values are optional and explicit; absence means unknown;
- historic revisions remain immutable and inspectable.

Free-form context notes may supplement controlled fields but may not feed ordering automatically. Port context remains customer-scoped even though `Port` is global.

`CustomerDecisionPreference` stores personal display choices such as saved filters, columns, and default workspace view. Preferences never change shared assessment results. A future `CustomerDecisionPolicyAssignment` may point a customer to one immutable policy version; policy contents must not be editable through arbitrary JSON without schema validation.

### Policy and work records

`DecisionPolicyVersion` stores a unique semantic version, validated immutable configuration, status, creator/approver, activation timestamp, and hash. Historic assessments retain their version and are not silently recalculated when defaults change.

`DecisionSupportWorkItem` stores customer/exposure/context/policy versions, deduplication key, status, bounded lease owner/expiry, attempts, safe error fields, and timestamps. Database state is authoritative for concurrency and crash recovery.

### Integrity and indexing

- Every customer-owned parent exposes `@@unique([id, customerId])`.
- Every customer-owned child uses composite tenant foreign keys.
- One case per customer exposure is database-enforced.
- An assessment cannot cite another customer’s path, context, factor, or action.
- User assignment must reference an application user who currently has access; service authorization verifies membership, while history remains after membership removal.
- Useful indexes include `(customerId, status, calculatedTier, updatedAt)`, `(customerId, assignedUserId, status)`, `(customerId, eventId)`, `(caseId, revision)`, `(policyVersion)`, and work `(status, nextAttemptAt, createdAt)`.

## 8. Evidence model

Every system-generated Phase 7 statement must resolve through one or both chains:

```text
DecisionAssessment
  → DecisionEvidenceLink
  → EventClaim → Claim → ArticleExtractionRun
  → SourceArticle.originalUrl → Source
```

```text
DecisionAssessment
  → DecisionEvidenceLink
  → CustomerExposure → ExposurePath → ExposurePathStep
  → explicit customer graph node/edge + immutable snapshots
```

Customer business assertions use a third chain:

```text
DecisionAssessmentFactor
  → CustomerAssetContext revision
  → provenance reference + human verifier
```

Rules:

- Preserve original source URLs and existing source metadata.
- Freeze the exact evidence and path identifiers used by an assessment revision.
- Never convert Event summaries, user notes, or context prose into new factual claims.
- Render explanation text from versioned templates and reason codes.
- Show assertion mode, Event conflict state, evidence date, source, match method, and relevant confidence labels.
- If an evidence record becomes unavailable, retain its snapshot and mark the live reference unavailable; do not substitute different evidence silently.
- If AI is considered in a later approved phase, its structured output must be schema validated, evidence-linked, clearly labeled, and human reviewed. Phase 7 V1 proposes no AI output.

## 9. User workflows

### Customer user

1. Selects an explicitly assigned customer workspace.
2. Opens the attention queue and sees only confirmed exposures for that customer.
3. Opens a case to inspect what happened, why the exposure exists, affected graph paths, business context, reason codes, confidence distinctions, and original evidence.
4. Acknowledges the case, assigns it to an eligible workspace user if permitted, selects `MONITORING`, adds a clearly labeled human note, or records a manual outcome.
5. Optionally filters/sorts the queue through personal preferences.

No button claims to contact a supplier, mitigate an Event, create an alert, or perform work outside SupplySignal.

### Assigned Reviewer

The Reviewer has the Customer workflow only for explicit memberships. In addition, the Reviewer may:

- validate or challenge a decision-support interpretation;
- verify customer-scoped business context with provenance;
- record a tier override with reason;
- flag an assessment for correction or re-evaluation;
- inspect the bounded Event provenance exposed through the case.

This does not grant unrestricted access to other customers or permission to redefine global Event truth.

### Admin

The Admin may access all customers, create and activate immutable decision policy versions, manage controlled reason/context taxonomies, correct failed work items, and inspect audit history. Admin cannot erase historic assessments or make unsupported system conclusions. Policy activation is explicit and never retroactively rewrites historic assessments; any re-evaluation is a separately recorded operation.

### Review state

Recommended case transitions:

```text
NEW → IN_REVIEW → ACKNOWLEDGED → MONITORING → CLOSED
  └──────────────→ ACKNOWLEDGED
CLOSED → IN_REVIEW   only through explicit human reopen
```

Event/exposure lifecycle changes may create a new assessment and suggest a queue state, but must not silently record a human acknowledgement, outcome, or decision.

## 10. API proposal

All responses use the existing `{ "data": ... }` envelope and structured `{ "error": { "code", "message", "requestId?" } }` failures. All input is Zod validated. Names are conceptual.

### Customer-scoped reads

```text
GET /api/customers/:customerId/decision-support/cases
GET /api/customers/:customerId/decision-support/cases/:caseId
GET /api/customers/:customerId/decision-support/cases/:caseId/history
GET /api/customers/:customerId/decision-support/cases/:caseId/evidence
GET /api/customers/:customerId/decision-support/context
GET /api/customers/:customerId/decision-support/preferences/me
```

List query fields: `status`, `attentionTier`, `assignedUserId`, `eventType`, `exposureType`, affected typed node ID, `acknowledged`, `page`, `pageSize`, and a documented sort. All typed IDs are resolved inside `customerId`.

Example list item:

```json
{
  "id": "case-uuid",
  "customerId": "customer-uuid",
  "status": "NEW",
  "attention": {
    "calculatedTier": "REVIEW_NOW",
    "overrideTier": null,
    "effectiveTier": "REVIEW_NOW",
    "reasonCodes": ["CRITICAL_CUSTOMER_ASSET", "VERIFIED_DIRECT_PATH"],
    "policyVersion": "phase7-policy-version"
  },
  "exposure": {
    "id": "exposure-uuid",
    "status": "CONFIRMED",
    "matchConfidence": "1.000"
  },
  "event": {
    "id": "event-uuid",
    "title": "display title",
    "status": "ACTIVE",
    "severity": "HIGH",
    "confidence": "0.810"
  },
  "assessmentState": "CURRENT",
  "lastAssessedAt": "ISO-8601"
}
```

Detail adds factors, limitations, paths, exact evidence, context revisions, assignment, and action history. It labels Event and exposure confidence separately and never returns an invented impact probability.

### Human commands

```text
POST /api/customers/:customerId/decision-support/cases/:caseId/acknowledge
POST /api/customers/:customerId/decision-support/cases/:caseId/assign
POST /api/customers/:customerId/decision-support/cases/:caseId/status
POST /api/customers/:customerId/decision-support/cases/:caseId/notes
POST /api/customers/:customerId/decision-support/cases/:caseId/tier-override
POST /api/customers/:customerId/decision-support/cases/:caseId/remove-tier-override
POST /api/customers/:customerId/decision-support/cases/:caseId/reassess
PUT  /api/customers/:customerId/decision-support/preferences/me
```

Commands accept an idempotency key or expected case revision. Conflicts return `409 CASE_VERSION_CONFLICT`. Notes and outcomes are user-authored and visibly labeled. Reassessment returns `202` and enqueues work.

### Context and policy

```text
POST /api/customers/:customerId/decision-support/context
POST /api/customers/:customerId/decision-support/context/:contextId/revise
POST /api/customers/:customerId/decision-support/context/:contextId/verify

GET  /api/admin/decision-support/policies
POST /api/admin/decision-support/policies
POST /api/admin/decision-support/policies/:policyId/activate
GET  /api/admin/decision-support/work-items
POST /api/admin/decision-support/work-items/:workItemId/retry
```

Policy creation/activation is Admin-only. Customer-context edit/verification permissions remain an open product decision; every allowed operation still requires membership and customer-scoped subject validation.

### Error codes

Expected codes include `UNAUTHORIZED`, `CUSTOMER_ACCESS_DENIED`, `DECISION_CASE_NOT_FOUND`, `EXPOSURE_NOT_ELIGIBLE`, `ASSESSMENT_STALE`, `CASE_VERSION_CONFLICT`, `INVALID_CONTEXT_SUBJECT`, `EVIDENCE_LINK_INVALID`, `POLICY_VERSION_INVALID`, and `WORK_ALREADY_RUNNING`.

## 11. UI proposal

Do not assume final navigation or feature names. The minimal information architecture is:

### Attention queue

- workspace-scoped list grouped or ordered by effective attention tier;
- columns for Event, tier, reason summary, affected asset/path, case state, assignee, evidence recency, and assessment freshness;
- filters from the API contract;
- clear badges for calculated tier versus human override;
- empty, loading, failed, stale-assessment, and insufficient-context states.

### Case detail

1. **Attention explanation** — calculated tier, ordered factors, limitations, policy version, and override history.
2. **What happened** — Event lifecycle/severity/confidence and conflicting evidence state.
3. **Why this customer is exposed** — Phase 6 match confidence, method, ordered paths, affected assets, and archived/stale warnings.
4. **Business context** — explicit controlled values, unknown fields, provenance, and verifier.
5. **Evidence** — Claim statements/evidence text, assertion modes, Articles, original URLs, and Sources.
6. **Human workflow** — status, assignment, acknowledgement, notes, manual outcome, and audit timeline.

### Context management

A customer-scoped typed asset selector prevents raw cross-tenant IDs. Controlled fields show provenance and verification state. Unsupported fields remain unavailable rather than simulated.

### Admin policy screen

Shows immutable versions, schema-valid configuration, reason templates, activation history, affected customer count, and explicit re-evaluation controls. It must not expose a generic unvalidated JSON editor in V1.

### Interaction rules

- Every visible action must invoke a real authorized API or be visibly disabled with a reason.
- “Recommended action” language is prohibited.
- Confidence values always include their subject: Event confidence or exposure-match confidence.
- Keyboard access, focus management, semantic headings, error announcements, and readable evidence links are acceptance requirements.
- Mobile may collapse detail sections but may not hide evidence or limitations.

## 12. Security and tenant model

Authorization remains:

- `CUSTOMER`: only explicit customer memberships; access to customer-facing cases and allowed human workflow actions.
- `REVIEWER`: only explicit customer memberships; no global customer access; additional interpretation/context review rights for assigned customers.
- `ADMIN`: platform-wide access and policy/work administration.

Every customer route executes `requireAuth → validate customerId → requireCustomerAccess → query by customerId + resourceId`. Role alone never supplies reviewer tenant access.

Security requirements:

- Composite tenant-safe foreign keys for cases, assessments, factors, evidence, context, and action logs.
- Assignment targets must be members of the same customer at command time; later membership removal does not erase attribution.
- Customer users receive only bounded Event provenance needed to explain their exposure, not unrestricted global intelligence data.
- Stored notes are untrusted text: length limited, safely rendered, never interpreted as instructions, and excluded from deterministic factors.
- Policy/configuration payloads use strict versioned schemas and reject unknown fields.
- Concurrency uses leases, unique constraints, expected revisions, and transaction/version checks.
- Audit events contain controlled metadata; logs must not contain article bodies, customer context prose, auth tokens, or secrets.
- Exports, if later approved, require their own tenant and evidence-leakage review; no export is included by this design.
- Dev authentication remains impossible in staging and production.

## 13. Acceptance criteria

### Evidence traceability

1. Every calculated reason opens the exact factor and evidence/path/context revision that produced it.
2. Event evidence reaches the exact Claim, extraction run, Article, original source URL, and Source.
3. Customer impact explanation reaches the exact CustomerExposure, ExposurePath, ordered steps, and graph snapshots.
4. An archived graph node or unavailable live article does not erase the frozen assessment explanation.
5. No explanation exists with only generated prose and no controlled reason/evidence link.
6. Event confidence and exposure-match confidence remain separately labeled and are never combined into impact probability.

### Determinism and explainability

7. Identical versioned inputs and policy produce byte-equivalent tier, ordering tuple, factors, and reason codes.
8. Missing business context produces `UNKNOWN`, not an inferred negative or positive value.
9. Multiple paths do not inflate a numeric score or duplicate a case.
10. Every queue ordering difference is explained by a visible factor or documented stable tie-break.
11. Geographic-only exposure displays its Phase 6 limitation and never claims disruption.
12. Event conflict displays uncertainty and does not generate a recommendation.
13. Historic assessment A retains policy A after policy B becomes active.
14. Explicit reassessment creates revision B and preserves revision A.
15. Presentation-only Event title change does not create a materially different assessment.

### Tenant isolation and authorization

16. Customer A cannot list, fetch, mutate, guess, filter by, or assign Customer B cases/resources.
17. PostgreSQL rejects a Customer A assessment linked to Customer B case, exposure, path, context, or factor.
18. Unauthenticated requests return `401`.
19. Unassigned Reviewer receives `403`; assigned Reviewer can access only assigned customers.
20. Admin has platform-wide access and policy administration.
21. Assignment to a user outside the customer membership is rejected.
22. Customer-facing evidence cannot traverse to unrelated Events, Claims, Articles, or customer data.

### Human control

23. System processing never writes an acknowledgement, assignment, manual outcome, or human note.
24. Tier override requires an authorized actor and reason and preserves calculated tier.
25. Removing an override appends history and restores the latest calculated tier.
26. Concurrent case commands with the same expected revision allow one commit and return a conflict for the stale command.
27. Closing or reopening a case is attributable and reversible through append-only history.
28. No action sends email, Slack, Teams, SMS, push, supplier communication, or external side effect.

### Unsupported-conclusion safeguards

29. A HIGH-severity Event plus CRITICAL asset does not produce a risk percentage or loss claim.
30. Name-only or ambiguous Phase 6 candidates do not create a decision-support case.
31. User-authored prose never becomes a system fact or attention factor automatically.
32. Invalid or unknown policy fields fail schema validation and cannot activate.
33. A policy cannot reference unsupported data or hidden mutable environment values.
34. No AI provider is called by assessment, explanation, queue, or review workflows.

### Lifecycle, idempotency, and failure

35. Repeated processing of the same versions creates one case and no duplicate assessment revision.
36. Two workers evaluating the same case concurrently commit one logical current revision.
37. A crashed worker’s bounded lease is recoverable; an old owner cannot complete reclaimed work.
38. Exposure resolution/staleness creates an auditable new assessment and preserves prior evidence.
39. A customer context revision triggers only affected customer cases and preserves prior context evidence.
40. A failed evaluation leaves the last successful assessment inspectable and marks freshness honestly.

### UI and API

41. Empty/loading/error/stale/unknown states are explicit and accessible.
42. Every enabled control performs the documented operation; unavailable features are absent or explicitly disabled.
43. List/detail envelopes and errors are consistent with the current API architecture.
44. Page-size limits, tenant-scoped filters, stable ordering, and input validation are enforced server-side.

## 14. Failure modes and safeguards

| Failure | Safe behavior |
| --- | --- |
| Exposure later becomes stale/resolved | Retain history, mark assessment stale, enqueue re-evaluation. |
| Business context missing | Show unknown limitation; do not infer it. |
| Context is disputed | Preserve revisions and verification history; exclude unverified values where policy requires verification. |
| Policy changes | New evaluations use the new version only through explicit activation/work; historic results remain. |
| Evidence becomes unavailable | Use retained snapshot and show live-link status; never substitute silently. |
| Worker crash/concurrency | Recover bounded DB lease; unique/version constraints prevent duplicate current state. |
| Unauthorized guessed UUID | Tenant-scoped lookup returns forbidden/not found without leaking existence. |
| Human override becomes outdated | Keep it visibly separate; require explicit removal or update rather than silently erasing it. |
| Large queue | Cursor/page bounded reads and indexed deterministic ordering; no customer × Event scan. |

## 15. Major design decisions

This proposal recommends:

1. One decision-support case per Customer × CustomerExposure, not cross-Event automatic aggregation.
2. Only Phase 6 confirmed exposures enter the customer attention queue.
3. V1 uses deterministic attention tiers and lexicographic ordering, not a numeric risk/priority score.
4. System explanations are reason-code/template based and evidence-linked; no AI-generated recommendation or summary.
5. Calculated assessments and human overrides remain separate and both are auditable.
6. Assessment revisions freeze Event, exposure, graph, context, evidence, and policy versions.
7. Business context is typed, customer-provided, provenance-backed, and never inferred from prose.
8. Database-backed work, leases, tenant foreign keys, idempotency, and append-only action history are authoritative.
9. Phase 7 performs no external communication or automatic operational action.

## 16. Open decisions requiring approval

Before implementation, approve:

1. Product terminology: “attention queue,” “case,” “assessment,” and the three tier labels.
2. Exact tier eligibility, factor precedence, and whether resolved/stale cases remain in the default queue.
3. Which customer roles may acknowledge, assign, close, add context, verify context, and override a tier. The repository currently has platform roles, not customer-specific permission roles.
4. Whether assignment may target any customer member or only selected roles.
5. The controlled business-context fields and bands; in particular whether single-source dependency and recovery-time data are available and sufficiently governed.
6. Whether only `VERIFIED` context may affect ordering or whether clearly labeled customer-entered draft context may do so.
7. Whether a case may be manually reopened after exposure resolution, and how that appears in the active queue.
8. Retention and export policy for user notes, context provenance, and action history.
9. Whether future cross-Event aggregation is valuable. V1 recommendation is no automatic aggregation because it can hide evidence boundaries and introduce unsupported causal grouping.
10. Whether numeric scoring should remain permanently excluded. Any later proposal requires a separate approved design defining calibration, semantics, evidence, limitations, versioning, and human override; it must not be called risk without validated risk meaning.

Until these decisions are approved, this document remains design guidance only. Phase 7 implementation, migrations, alerts, notifications, AI recommendations, and automatic actions are not authorized.

# Event intelligence (Phase 5)

Phase 5 converts eligible, validated Claims into global factual Events. Production activation requires an auditable Phase 4.5 `GO`, but the POC is not rerun at request time, a GO does not start the worker automatically, and historic POC datasets are never changed.

```text
Source → SourceArticle → ArticleExtractionRun → Claim → EventClaim → Event
```

A Claim is one article-derived observation. An Event is a normalized real-world development supported by one or more Claims. Events remain global: this phase does not match them to customer assets, calculate exposure, score customer risk, or create alerts.

## Deterministic construction

The controlled taxonomy and versioned `EVENT_POLICY_VERSION` live with all validation, normalization, eligibility, matching, confidence, severity, conflict, and lifecycle rules in `packages/shared/src/event-intelligence.ts`. Historic unversioned Phase 5 Events migrate as policy `1.0`; hardened construction uses policy `1.1` and fingerprint version `2`. The default minimum Claim confidence is `0.60`; `EVENT_MIN_CLAIM_CONFIDENCE` accepts only values from zero through one. Calibrate it from Phase 4.5 POC results before production activation. Tests inject policies directly and do not mutate global environment state.

The canonical fingerprint is:

```text
eventType | assertionMode | primary normalized entity | primary normalized location | UTC day or unknown
```

Normalization is deliberately conservative: Unicode normalization, trimming, case folding, and whitespace collapsing only. It does not infer corporate aliases or customer relationships. Exact fingerprints match first. Otherwise a Claim can attach only when exactly one candidate has the same type, assertion mode, normalized entity/location keys, and a date within three days. Multiple candidates produce `AMBIGUOUS`; the Claim creates a separate traceable Event and the candidate IDs are retained for review. No semantic or LLM matching occurs.

Processing is idempotent. A PostgreSQL claim lease prevents simultaneous ownership, while a transaction-scoped advisory lock serializes matching for the same normalized event core. Leases expire after five minutes so crashed workers do not leave permanent locks. Retry timing is bounded. An existing EventClaim remains authoritative on repeat processing.

## Aggregation and provenance

Confidence starts with the strongest supporting Claim, adds at most `0.05` per additional independent source (maximum `0.15`) and `0.02` per additional article (maximum `0.06`), applies a `0.20` conflict penalty, and is capped at `0.99`. These values and the three-day temporal window are centralized in the policy. Every new Event stores its policy version. Matching is restricted to that policy version, so changing current defaults neither recalculates nor silently attaches to historic Events. Rebuilding is not automatic.

Severity is a documented deterministic rule based on event type and available location context. It does not use an LLM and is not customer impact. Each EventClaim stores one conservative signal: `AFFIRMS_EVENT`, `DENIES_EVENT`, `RESOLUTION_SIGNAL`, `CANCELLATION_SIGNAL`, or `NEUTRAL`. Negated cancellation and denied reports are handled before positive keywords. Conflict exists only when supporting Claims both affirm and explicitly deny the same Event. Resolution/cancellation evidence remains separately inspectable, never changes lifecycle automatically, and does not by itself create conflict.

Every Event links through EventClaim to the exact Claim, ArticleExtractionRun, SourceArticle, original URL, and Source. Reprocessing adds provenance without mutating old runs or Claims.

## Lifecycle and access

Lifecycle transitions are explicit: `DETECTED → ACTIVE|CANCELLED`, `ACTIVE → RESOLVED|CANCELLED`, and `RESOLVED → ACTIVE`. Silence never resolves an Event. `ADMIN` may list, inspect, process Claims, and change status. `REVIEWER` may list and inspect. `CUSTOMER` cannot access the global event corpus in Phase 5.

The event worker processes bounded eligible batches and supports graceful shutdown. Set `EVENT_WORKER_PROCESSING_ENABLED=true` only after operational approval and the Phase 4.5 GO has been confirmed. Development fixtures remain independently testable.

## Known limitations

Entity normalization is exact and alias-free; date proximity is intentionally narrow; ambiguity requires later human resolution; conflict detection is lexical and conservative; severity is event-level only. Phase 6 customer graph matching, exposure, risk, alerts, Daily Briefs, notifications, billing, and deployment automation are intentionally absent.

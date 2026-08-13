# Customer exposure

Phase 6 answers which explicit customer assets may be affected by a global Event. It does not calculate risk or priority and does not send alerts.

## Matching contract

The deterministic matcher accepts only `VERIFIED` customer graph identities and `VERIFIED` global Event-entity identifiers with equal namespace and normalized identifier. Names alone never match. Exact city and country may create a geographic path; country-only geography creates a review candidate and never a CustomerExposure. Port identifiers may produce both the Port node and explicit customer Routes that contain it.

One `CustomerExposure` exists per Customer × Event and may contain multiple immutable-keyed `ExposurePath` records. Typed path steps retain live database-enforced references and snapshots. A PostgreSQL advisory transaction lock serializes Event reconciliation; unique keys and upserts make retries and concurrent workers idempotent. Graph mutation triggers increment `Customer.graphRevision`. Matching-material Event changes increment `Event.exposureVersion`; presentation-only title changes do not.

## Identity governance and ambiguity

ADMIN and assigned REVIEWER may manage verified customer graph identities. REVIEWER may propose a global Event identity with provenance, but only ADMIN may verify or reject it because that identity can affect all customers. Unverified identifiers do not match. Within one customer, a verified identifier can resolve to only one graph subject. The same authoritative identifier may occur on EventEntities from multiple historic Events; each occurrence retains its own provenance and verification.

`AMBIGUOUS` outcomes persist as `ExposureCandidate` records. CUSTOMER cannot read candidates. Confirmation requires a tenant-safe resulting customer identity and then re-runs normal reconciliation; it never mutates the customer graph or bypasses the verified global identity requirement.

## Processing and authorization

The exposure worker processes bounded Event batches and reconciliation is safe to retry. Customer graph reconciliation considers all unresolved Events. Customer and REVIEWER access remains membership-based; only ADMIN has platform-wide access. CUSTOMER reads only confirmed exposures, while assigned REVIEWER and ADMIN may inspect provenance, review exposures, and resolve candidates.

`EXPOSURE_POLICY_VERSION` is stored on exposures, paths, and candidates for auditability. Historic snapshots remain inspectable when live graph relations are archived or a path becomes stale.

## Explicit exclusions

Phase 6 contains no risk scoring, priority scoring, alerts, Daily Brief, notification, AI/fuzzy graph matching, invented identifier, or automatic customer graph mutation.

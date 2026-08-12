# AI extraction and claims

```text
SOURCE → SOURCE ARTICLE → ARTICLE EXTRACTION RUN → CLAIMS
                                              ├── ENTITIES
                                              ├── LOCATIONS
                                              ├── DATES
                                              └── EVIDENCE
CLAIMS → [PHASE 5: EVENT INTELLIGENCE ENGINE]
```

`packages/ai` owns provider-neutral extraction types, strict Zod output schema `1.0`, prompt `1.0`, deterministic input bounding/hashing, and exact evidence matching. Article content is untrusted data, never instructions. The prompt preserves negation and distinguishes OBSERVED, REPORTED, ANNOUNCED, FORECAST, PLANNED, and ESTIMATED assertions.

The server-only OpenAI provider uses the Responses structured-output JSON-schema boundary. Enable it with `AI_EXTRACTION_ENABLED=true`, `OPENAI_API_KEY`, and a centralized `OPENAI_EXTRACTION_MODEL`; tests use `FakeExtractionProvider` and require no key. Input is capped deterministically at 50,000 characters and records whether it was truncated. Transient timeout/rate/provider failures receive at most three attempts with bounded backoff; schema or evidence failures are not retried.

Completed persistence is transactional across claims, entities, locations, and the run status. Evidence offsets are computed server-side against the exact bounded input. A normal extraction returns the latest successful run for the same provider/model/prompt/schema; explicit reprocess creates a new auditable run. The separate extraction worker selects normalized/excerpt-bearing, non-ignored articles without a completed run. Start it with `pnpm --filter @suppliesignal/api start:extraction-worker` after building.

ADMIN triggers extraction/reprocessing. ADMIN and REVIEWER inspect runs, claims, evidence, provenance, usage, and operational metrics. CUSTOMER has no global access. Extracted entities never modify or become customer graph entities. Current limitations: no chunking beyond deterministic truncation, geocoding, cost estimation, claim review workflow, event creation, contradiction resolution, customer exposure, scoring, or alerts.

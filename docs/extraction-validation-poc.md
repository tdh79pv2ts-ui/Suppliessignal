# Extraction validation POC (Phase 4.5)

Phase 4.5 evaluates the Phase 4 claim extractor on an explicit, human-reviewed dataset before downstream intelligence work. It never processes the full article database automatically.

An `ADMIN` creates a draft, selects roughly 100–200 real `SourceArticle` records, reviews the preflight, and starts it. Membership is immutable after `DRAFT`. Starting freezes provider, model, prompt version, schema version, thresholds, and the exact `ArticleExtractionRun` for every article. A compatible completed run is reused; otherwise extraction uses the Phase 4 database lease. `REVIEWER` and `ADMIN` can inspect and score frozen evidence. `CUSTOMER` is denied this global technical POC.

Article review records expected relevance and missed material claims. Claim review scores correctness, evidence, entities, locations, dates, and assertion mode as `CORRECT`, `PARTIALLY_CORRECT`, `INCORRECT`, or `NOT_APPLICABLE`; it also records unsupported claims and a fixed failure taxonomy. Strict evidence text and offsets are not weakened.

Metrics are deterministic. Applicable dimension accuracy gives half credit to partial scores; the claim-correct gate counts only fully correct claims. Central gates are evidence ≥99%, unsupported ≤2%, fully correct claims ≥90%, entity/location/date ≥90%, assertion ≥95%, extraction failure ≤2%, relevance precision ≥90%, and recall ≥85%.

The decision is `INCOMPLETE` until at least 100 articles and 90% of extracted claims are reviewed (or explicitly stored dataset minimums are met). Sufficient coverage yields `GO` only when every gate passes; otherwise `FIX_PHASE_4`. JSON and CSV exports preserve the result for audit.

Relevance precision is TP/(TP+FP), relevance recall is TP/(TP+FN), extraction failure rate is failed/submitted articles, unsupported rate is unsupported/reviewed claims, and missed-claim rate is missed/(extracted material claims+missed). Results also show reviewed/correct/unsupported performance by confidence bucket, claim type, and source, plus failure-reason counts.

The protected API is under `/api/poc/extraction/datasets`; the UI is at `/poc/extraction`. Dataset management and execution require `ADMIN`; reads, reviews, results, and exports allow `ADMIN` and `REVIEWER`. Tests never invoke a live AI provider.

POC success does not prove real-world event truth. It validates only `SourceArticle → structured Claim extraction`; it does not validate `Claim → Event → Customer Exposure → Alert`.

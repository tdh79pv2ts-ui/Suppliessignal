# Extraction validation POC (Phase 4.5)

Phase 4.5 evaluates the Phase 4 claim extractor on an explicit, human-reviewed dataset before downstream intelligence work. It never processes the full article database automatically.

An `ADMIN` creates a draft, selects roughly 100–200 real `SourceArticle` records, reviews the preflight, and starts it. Membership is immutable after `DRAFT`. Creation stores a threshold snapshot; starting freezes provider, model, prompt version, schema version, and the exact `ArticleExtractionRun` for every article. Compatible extraction counts are based on unique articles, never run count. Reuse deterministically selects the compatible successful run with the latest `completedAt`, breaking ties by run ID. Later reprocessing never changes the frozen link. Otherwise extraction uses the Phase 4 database lease. `REVIEWER` and `ADMIN` can inspect and score frozen evidence. `CUSTOMER` is denied this global technical POC.

Article review records expected relevance and missed material claims. Claim review scores correctness, evidence, entities, locations, dates, and assertion mode as `CORRECT`, `PARTIALLY_CORRECT`, `INCORRECT`, or `NOT_APPLICABLE`; it also records unsupported claims and a fixed failure taxonomy. Strict evidence text and offsets are not weakened.

Metrics are deterministic. Every formal accuracy gate is strict `CORRECT / applicable reviews`; `PARTIALLY_CORRECT` never contributes to a GO gate. Correct, partial, incorrect, and explicitly named blended rates remain available for analysis. The dataset's stored threshold JSON—not current application defaults—is authoritative. Default gates are evidence ≥99%, unsupported ≤2%, fully correct claims ≥90%, entity/location/date ≥90%, assertion ≥95%, extraction failure ≤2%, relevance precision ≥90%, and recall ≥85%.

The decision is `INCOMPLETE` until at least 100 articles and 90% of extracted claims are reviewed (or explicitly stored dataset minimums are met). Sufficient coverage yields `GO` only when every gate passes; otherwise `FIX_PHASE_4`. JSON and CSV exports preserve the result for audit.

Relevance precision is TP/(TP+FP), relevance recall is TP/(TP+FN), extraction failure rate is failed/submitted articles, unsupported rate is unsupported/reviewed claims, and missed-claim rate is missed/(extracted material claims+missed). Confidence calibration uses 0.00–0.49, 0.50–0.59, 0.60–0.69, 0.70–0.79, 0.80–0.89, and 0.90–1.00 buckets, each reporting total, reviewed, correct, partial, incorrect, unsupported, correct rate, and unsupported rate. Small buckets are descriptive only and must not be treated as stable calibration evidence. Results also break performance down by claim type and source and count failure reasons.

The protected API is under `/api/poc/extraction/datasets`; the UI is at `/poc/extraction`. Dataset management and execution require `ADMIN`; reads, reviews, results, and exports allow `ADMIN` and `REVIEWER`. Tests never invoke a live AI provider.

POC success does not prove real-world event truth. It validates only `SourceArticle → structured Claim extraction`; it does not validate `Claim → Event → Customer Exposure → Alert`.

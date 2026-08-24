# Supply Chain Intelligence POC v1

## Goal

The POC demonstrates one understandable customer loop: explicit customer supply-chain data is monitored against RSS/Atom coverage, relevant articles are matched deterministically, potential exposure is explained, and the result is collected into an in-app Daily Supply Chain Brief.

```text
Customer graph → RSS/Atom articles → deterministic matching
               → potential exposure → daily brief
```

PostgreSQL remains the system of record. Original article URLs and source metadata remain the evidence boundary. The matcher never creates or changes customer graph data.

## Architecture

- Existing customer-scoped suppliers, factories, products, materials and routes plus global ports form the factual graph.
- Manual CRUD and explicit relationship management remain available under Supply chain.
- The global source registry contains a curated public coverage universe; tenant-specific preferences determine what each workspace monitors. The SSRF-safe RSS/Atom collector stores normalized, cross-publisher-deduplicated `SourceArticle` records. A database lease prevents simultaneous POC cycles. The first run reads every enabled feed, five-minute deltas respect each source interval, and the first cycle of each UTC day forcibly reconciles every enabled feed. Each full read is bounded by the history the publisher actually exposes.
- `CustomerMonitoringTag` stores graph-derived `AUTO`, explainable `SUGGESTED`, and user-managed `CUSTOM` tags. Automatic tags are synchronized from active graph data and can be disabled but not deleted; suggestions require acceptance; custom tags can be edited, disabled, or removed.
- `NewsRadarArticleProcessing` provides a recoverable database lease. `NewsRadarExposure` stores one deterministic customer/article/entity match with typed tenant-safe references, matched terms, confidence-as-match-specificity, a path snapshot and the original article.
- `DailyBriefPreference` belongs to an exact user/customer membership and is disabled by default. `DailyBriefDelivery` records idempotent tenant-safe email delivery when the optional server provider is configured.
- `DailyBrief` freezes the graph revision and supply-chain counts. `DailyBriefItem` has composite tenant-safe references to its brief and exposure. Re-generation for the same customer/date is idempotent.
- The POC worker uses database-backed customer source preferences as the authoritative collection allow-list, creates optional schema-validated translations, and processes pending articles in that order. Translation and relevance work drain in safe batches instead of inheriting UI pagination limits. `PocIngestionRun` and `PocIngestionState` retain run mode, source totals, discovered/processed/failed articles, duplicates, backlog, last full load, last successful delta and last daily reconciliation. Failed sources do not stop the remaining batch. The radar worker generates due briefs; optional Resend delivery is disabled unless both server configuration and user preference explicitly enable it.

## Customer experience

The customer-facing navigation exposes only Dashboard, Supply chain, Intelligence and Sources. Watch topics are managed inside Intelligence. Language and Daily Brief preferences sit behind Settings rather than occupying primary navigation. Claims, extraction, Events, exposure candidates, identities and review workflows remain available through their existing authorized APIs for backward compatibility, but are not exposed in the simplified POC frontend.

Intelligence is a lightweight deterministic view, not a restored Event workflow. `HIGH` graph matches are Direct impact, `MEDIUM` contextual dependencies are Potential impact, and globally material processed signals from explicitly enabled sources can be shown as Broader developments only with the statement that no direct BSK exposure is confirmed. Broader policy `3.1` requires a deterministic supply-chain pathway and rejects generic politics, crime, sport, entertainment and lifestyle coverage. Similar headlines with the same level and topic inside a bounded time window are grouped; all underlying publisher URLs remain inspectable evidence.

The Daily Brief preview and optional delivery contain:

1. top developments;
2. supplier/factory developments;
3. product/material developments;
4. logistics/trade developments;
5. a separate watchlist section, which is empty unless separately qualifying watchlist intelligence is introduced.

Every intelligence item links to the original source, publication date, deterministic relevance explanation and explicit customer graph path. It never recommends or automates an action.

## Demo environment

The fictional `European Electronics Manufacturer` workspace contains exactly 20 suppliers, 50 factories, 30 products, 20 materials, 15 routes and 10 route-linked ports on a clean seed. It covers electronics relationships across China, Taiwan, Vietnam, Malaysia, Indonesia, Chile, the USA, Germany and the Netherlands.

The seed never creates articles or intelligence. It registers the curated BSK public-source universe and enables verified machine-readable feeds where a supported public RSS/Atom endpoint is available. Other entries remain transparent coverage references until a supported feed or API is verified. Collection stores only feed items with an original URL, source/publisher and valid publication date. Live article counts therefore depend on publisher availability and collection time.

The separate BSK Fashion workspace remains based only on public BSK master data. Unknown BSK suppliers, routes and ports remain empty.

## Real-news strategy

- USGS Significant Earthquakes: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.atom`
- World Trade Organization News: `https://www.wto.org/library/rss/latest_news_e.xml`

Machine-readable sources run through the initial/delta/daily-reconciliation lifecycle. Canonical URL, publisher identity, normalized content, exact normalized headline within a bounded publication window, and content hashes prevent repeated or cross-publisher ingestion. Collection runs record health and failures, and the SSRF-safe client pins the validated public IP through the actual request and every redirect. Feed entries without a valid publisher-owned URL, title or publication date are rejected instead of being converted into intelligence.

Monitoring vocabulary is derived at processing time from the customer's active supplier, factory, product, material, route, port, location and country data. Language requirements and source recommendations follow those graph geographies. Signal classification covers operational, logistics, geopolitical, economic, technology, trade and environmental developments. Matching remains deterministic: exact identity, exact location/country plus a qualifying disruption or monitoring theme, exact material/product, exact route endpoints or exact route-port membership. A generic custom tag by itself never enters the main feed.

## Verification commands

- `pnpm poc:validate-data` validates source coverage, URLs, customer preferences, duplicate evidence, explanations and typed tenant-safe graph references against the configured database.
- `pnpm poc:benchmark <dataset.json>` evaluates a human-labelled dataset of at least 100 real collected articles and reports precision, recall, false positives and false negatives. A release claim requires measured primary-feed precision of at least 95%; no score is inferred when that evidence set is unavailable.

## Scope and limitations

- Matching is exact and deterministic. There is no AI/fuzzy graph matching or opaque score.
- Match confidence describes identity/location specificity, not risk, impact or priority.
- CSV import is omitted because functional manual input already exists and a reliable CSV mapping workflow was not necessary for this POC.
- Public WEB entries provide coverage transparency but are not scraped. Only sources with a verified supported RSS/Atom endpoint are collected; collection never bypasses publisher restrictions.
- No public search/news-discovery provider or legally verified WEB collector is configured in the repository. Their expected/completed query counts therefore remain zero rather than suggesting coverage that did not run.
- Exact country matching is intentionally conservative in interpretation: it indicates a geographic dependency, not proven physical impact at a specific facility.
- Outbound email delivery is optional and off by default. When configured, it sends only membership-scoped `HIGH` and `MEDIUM` items and records an idempotent delivery audit row.
- The supply-chain snapshot is factual current state, not a fabricated change log.
- Existing enterprise tables and authorized APIs remain intact for data safety, while their UI is inactive in this POC.

## Future roadmap

After customer validation, separately approve licensed source coverage, a verified CSV mapping workflow, outbound email infrastructure, graph change history, multilingual vocabularies and explicit historic reprocessing. Claims, Events, reviewer governance, scoring, alerts and automated decisions remain outside this POC.

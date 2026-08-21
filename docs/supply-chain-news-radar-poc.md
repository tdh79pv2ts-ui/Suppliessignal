# Supply-chain news intelligence radar POC

## Architecture

The POC answers which newly collected articles may be relevant to explicit customer supply-chain data. It deliberately uses a direct, deterministic path:

```text
CustomerMembership → Customer graph
                            ↑
RSS/Atom Source → SourceArticle → deterministic matcher
                            ↓
                 NewsRadarExposure → customer dashboard
```

`SourceArticle.originalUrl` and source metadata remain the evidence boundary. The matcher does not call an LLM and does not read or create Claims, Events, identity records, candidates, reviews, risk scores, alerts, or notifications. Existing Phase 3–6 functionality remains intact but is not a dependency of this POC.

## Data model

Existing `Customer`, `Supplier`, `Factory`, `Product`, `Material`, `Route`, `RoutePort`, `Port`, `Source`, `SourceArticle`, and `SourceCollectionRun` records are reused.

`NewsRadarArticleProcessing` is the database-backed processing record. It stores an expiring owner lease, attempts, status, topics, detected terms/locations, completion time, and bounded errors. A failed or expired record can be retried; a completed record is not processed twice implicitly.

`NewsRadarExposure` stores one potential match per customer × article × deterministic match key × policy version. It contains the affected entity type, topic, match method, relevance (`HIGH`, `MEDIUM`, or `LOW`), confidence, matched terms, explanation, and an evidence-preserving graph path snapshot. Typed nullable references and composite foreign keys ensure every customer-owned subject belongs to the same customer. A port result references an explicit tenant-owned `RoutePort`, proving that the global port is actually used by that customer's route. A database check constraint enforces the entity-type/subject combination.

`SourceArticleTranslation` stores a validated translation separately from its immutable source evidence. `DailyBriefPreference` is tied to one user/customer membership and defaults to disabled. `DailyBriefDelivery` proves the same customer for the preference, user, and brief through composite foreign keys and prevents duplicate delivery of one brief to one preference.

The graph remains the source of customer truth. Radar processing never creates or mutates suppliers, factories, products, materials, routes, ports, or relationships.

## Monitoring approach

The existing scheduled source worker checks due sources every minute. A source defaults to a 15-minute collection interval; validated values from 5 minutes through one week are supported. RSS/Atom collection stores last collection, last successful collection, last failure, consecutive failures, article timestamps, and run counters/errors.

The POC worker defaults to a five-minute poll and performs enabled-source collection, optional translation, and relevance processing in that order. Database leases make recovery and multiple-process contention deterministic. Unique article hashes and source-scoped constraints prevent duplicate articles; policy-versioned radar match keys prevent duplicate exposures.

## Source strategy

ADMIN configures verified RSS or Atom feeds for news, government, regulator, trade, industry, port, logistics, labour, and weather sources. The fetch boundary pins the validated public IP, repeats SSRF validation for redirects, limits response size/time, and preserves the original URL. Uncontrolled scraping, JavaScript rendering, paywall bypass, and browser automation are out of scope.

The seed includes supported first-party RSS/Atom feeds plus visible, disabled public references for relevant government, customs, regional, logistics, Reuters, Financial Times, and Associated Press coverage. A reference without a verified supported feed cannot be enabled from the POC Sources page. Commercial terms, redistribution rights, feed URLs, retention, and full-text storage rights must be verified before activation.

## Monitoring profile

`GET /api/customers/:customerId/news-radar/monitoring-profile` generates explainable monitoring terms from active explicit graph data:

- supplier names, legal names, country and city;
- factory names and locations;
- product and material/commodity names;
- route names and origin/destination pairs;
- route-linked port names/codes;
- countries represented by customer assets.

RSS ingestion itself does not issue publisher search queries. The profile is the deterministic vocabulary used when newly collected coverage is matched.

## Matching logic

An article must contain both a recognized disruption/economic/trade/geopolitical topic and an eligible exact graph signal. Match confidence describes deterministic identity/location specificity—not business impact or risk.

- Supplier: exact verified customer-entered legal name; unique exact name; or exact name plus its location. Duplicate same-name suppliers require a location/legal disambiguator.
- Factory: unique exact factory name, exact city+country, or conservative explicit country-only factory coverage. Source country metadata alone never creates a match.
- Product/material: exact product, material, or commodity phrase plus disruptive context.
- Route: exact route name or both explicit route endpoints.
- Port: exact port name/code and an explicit `RoutePort` relationship for the customer.

Direct supplier/factory/product/material/route/port matches are `HIGH`; explicit city/country dependencies are `MEDIUM`; industry-only context is `LOW`. Only `HIGH` and `MEDIUM` appear in the overview and Daily Brief. No fuzzy matching, inferred ownership, AI entity resolution, or name-only ambiguous supplier match is allowed. Every result retains matched terms and the factual graph path used.

Topic and disruption vocabularies cover English, Dutch, German, French, Spanish, Chinese, Japanese, Korean, and Vietnamese. Optional translation uses a schema-validated provider boundary, preserves names and negation, treats article text as untrusted, and never adds analysis or recommendations. Original title, summary, language, and URL remain authoritative and inspectable.

## API and UI

Membership-scoped customer endpoints:

- `GET /api/customers/:customerId/news-radar`
- `GET /api/customers/:customerId/news-radar/monitoring-profile`
- `GET /api/customers/:customerId/news-radar/exposures`
- `GET /api/customers/:customerId/news-radar/exposures/:exposureId`
- `GET|PUT /api/customers/:customerId/daily-brief-preference`
- `GET /api/customers/:customerId/daily-brief`

ADMIN-only operational endpoints process one article or a pending batch. The dashboard and `/news-radar` show graph coverage, collection health, latest relevant articles, and potential exposures. Detail shows what happened, original source/date, why it is relevant, matched terms, confidence, and the explicit graph path. No UI action implies a decision or sends a message.

The Sources page shows country/region, language, category, status, last check, and article count. ADMIN can disable supported sources and re-enable validated RSS/Atom sources. Disabled sources remain visible and are skipped by collection. Customer users see only their membership-scoped dashboard, articles, settings, and briefs.

## Limitations

- RSS/Atom and manual evidence are supported; publisher search APIs and broad web crawling are not.
- Country-only factory matching is deliberately broad, requires an explicit textual country mention, and is `MEDIUM`.
- No fuzzy entity resolution, semantic similarity, or AI relevance classification.
- No currency/commodity market API is integrated; economic coverage must arrive through configured feeds.
- Customer graph changes do not automatically reprocess completed historic articles in this POC.
- CSV import is not included; functional manual CRUD remains available.
- Translation and outbound email require separately configured server-side providers and are disabled by default.
- Low-volume source language coverage and source licensing must be evaluated before production use.

## Future roadmap

After POC evaluation, separately approve source licensing, multilingual deterministic vocabularies, explicit historic reprocessing, additional verified publisher APIs, and operational scaling. Claims, Events, enterprise review, risk scoring, alerts, and notifications remain separate product decisions and are not part of this implementation.

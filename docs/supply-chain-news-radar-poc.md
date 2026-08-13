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

`NewsRadarExposure` stores one potential match per customer × article × deterministic match key. It contains the affected entity type, topic, match method, confidence, matched terms, explanation, and an evidence-preserving graph path snapshot. Typed nullable references and composite foreign keys ensure every customer-owned subject belongs to the same customer. A port result references an explicit tenant-owned `RoutePort`, proving that the global port is actually used by that customer's route. A database check constraint enforces the entity-type/subject combination.

The graph remains the source of customer truth. Radar processing never creates or mutates suppliers, factories, products, materials, routes, ports, or relationships.

## Monitoring approach

The existing scheduled source worker checks due sources every minute. A source defaults to a 15-minute collection interval; validated values from 5 minutes through one week are supported. RSS/Atom collection stores last collection, last successful collection, last failure, consecutive failures, article timestamps, and run counters/errors.

The news-radar worker defaults to a five-minute poll and processes bounded batches of unprocessed, failed, or lease-expired articles. Database leases make recovery and multiple-process contention deterministic. Unique article hashes and source-scoped constraints prevent duplicate articles; unique radar match keys prevent duplicate exposures.

## Source strategy

ADMIN configures verified RSS or Atom feeds for news, government, regulator, trade, industry, port, logistics, labour, and weather sources. The fetch boundary pins the validated public IP, repeats SSRF validation for redirects, limits response size/time, and preserves the original URL. Uncontrolled scraping, JavaScript rendering, paywall bypass, and browser automation are out of scope.

Reuters, Bloomberg, Financial Times, Associated Press, government bodies, and industry publishers are source categories to evaluate, not hardcoded feeds. Commercial terms, redistribution rights, feed URLs, retention, and full-text storage rights must be verified before activation. The seed uses clearly labelled fictional manual coverage only.

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
- Factory: unique exact factory name, exact city+country, or conservative country-only factory coverage.
- Product/material: exact product, material, or commodity phrase plus disruptive context.
- Route: exact route name or both explicit route endpoints.
- Port: exact port name/code and an explicit `RoutePort` relationship for the customer.

No fuzzy matching, inferred ownership, AI entity resolution, or name-only ambiguous supplier match is allowed. Every result retains matched terms and the factual graph path used.

## API and UI

Membership-scoped customer endpoints:

- `GET /api/customers/:customerId/news-radar`
- `GET /api/customers/:customerId/news-radar/monitoring-profile`
- `GET /api/customers/:customerId/news-radar/exposures`
- `GET /api/customers/:customerId/news-radar/exposures/:exposureId`

ADMIN-only operational endpoints process one article or a pending batch. The dashboard and `/news-radar` show graph coverage, collection health, latest relevant articles, and potential exposures. Detail shows what happened, original source/date, why it is relevant, matched terms, confidence, and the explicit graph path. No UI action implies a decision or sends a message.

## Demo data

The seed includes four clearly fictional evidence records: factory fire, port disruption, trade restriction, and material shortage. Each uses an `.invalid` URL, an explicit graph relationship, and a deterministic exposure. No real publisher attribution or customer relationship is invented.

## Limitations

- RSS/Atom and manual evidence are supported; publisher search APIs and broad web crawling are not.
- Country-only factory matching is deliberately broad and lower confidence.
- No fuzzy entity resolution, synonym/translation expansion, semantic similarity, or AI classification.
- No currency/commodity market API is integrated; economic coverage must arrive through configured feeds.
- Customer graph changes do not automatically reprocess completed historic articles in this POC.
- CSV import is not included; functional manual CRUD remains available.
- A production deployment must run both collection and radar workers and configure licensed feeds.

## Future roadmap

After POC evaluation, separately approve source licensing, multilingual deterministic vocabularies, explicit historic reprocessing, additional verified publisher APIs, and operational scaling. Claims, Events, enterprise review, risk scoring, alerts, and notifications remain separate product decisions and are not part of this implementation.

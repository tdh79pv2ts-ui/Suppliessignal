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
- The global source registry and SSRF-safe RSS/Atom collector store normalized, deduplicated `SourceArticle` records. Collection intervals support 5 minutes, 15 minutes, hourly and longer schedules; 15 minutes is the default.
- `NewsRadarArticleProcessing` provides a recoverable database lease. `NewsRadarExposure` stores one deterministic customer/article/entity match with typed tenant-safe references, matched terms, confidence-as-match-specificity, a path snapshot and the original article.
- `DailyBriefPreference` belongs to an exact user/customer membership and is disabled by default. `DailyBriefDelivery` records idempotent tenant-safe email delivery when the optional server provider is configured.
- `DailyBrief` freezes the graph revision and supply-chain counts. `DailyBriefItem` has composite tenant-safe references to its brief and exposure. Re-generation for the same customer/date is idempotent.
- The POC worker collects enabled sources, creates optional schema-validated translations, and processes pending articles in that order. The radar worker generates due briefs; optional Resend delivery is disabled unless both server configuration and user preference explicitly enable it.

## Customer experience

The customer-facing navigation exposes Dashboard, Supply chain, News radar, Daily brief and Settings. ADMIN/REVIEWER may additionally inspect Sources and Articles. Claims, extraction, Events, exposure candidates, identities and review workflows remain available through their existing authorized APIs for backward compatibility, but are not exposed in the simplified POC frontend.

The Daily Brief contains:

1. top developments;
2. potential exposures;
3. a factual supply-chain snapshot (no change history is inferred);
4. a watchlist.

Every intelligence item links to the original source, publication date, deterministic relevance explanation and explicit customer graph path. It never recommends or automates an action.

## Demo environment

The fictional `European Electronics Manufacturer` workspace contains exactly 20 suppliers, 50 factories, 30 products, 20 materials, 15 routes and 10 route-linked ports on a clean seed. It covers electronics relationships across China, Taiwan, Vietnam, Malaysia, Indonesia, Chile, the USA, Germany and the Netherlands.

The seed never creates articles or intelligence. It enables two publisher-owned feeds: the USGS Significant Earthquakes Atom feed and the World Trade Organization news RSS feed. Collection stores only feed items with an original URL, source/publisher and valid publication date. Live article counts therefore depend on publisher availability and collection time.

The separate BSK Fashion workspace remains based only on public BSK master data. Unknown BSK suppliers, routes and ports remain empty.

## Real-news strategy

- USGS Significant Earthquakes: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.atom`
- World Trade Organization News: `https://www.wto.org/library/rss/latest_news_e.xml`

Both are first-party publisher feeds and run on the default 15-minute collection schedule. URL/content hashes prevent repeat ingestion, collection runs record health and failures, and the SSRF-safe client pins the validated public IP through the actual request and every redirect. Feed entries without a valid publisher-owned URL, title or publication date are rejected instead of being converted into intelligence.

Monitoring vocabulary is derived at processing time from the customer's active supplier, factory, product, material, route, port and country data. Signal classification covers operational, logistics, geopolitical, economic, technology, trade and environmental developments. Matching remains deterministic: exact identity, exact location/country, exact material/product, exact route endpoints or exact route-port membership.

## Scope and limitations

- Matching is exact and deterministic. There is no AI/fuzzy graph matching or opaque score.
- Match confidence describes identity/location specificity, not risk, impact or priority.
- CSV import is omitted because functional manual input already exists and a reliable CSV mapping workflow was not necessary for this POC.
- Only the two documented official RSS/Atom feeds are enabled by the seed. Additional feeds require ADMIN verification and activation; collection never bypasses publisher restrictions.
- Exact country matching is intentionally conservative in interpretation: it indicates a geographic dependency, not proven physical impact at a specific facility.
- Outbound email delivery is optional and off by default. When configured, it sends only membership-scoped `HIGH` and `MEDIUM` items and records an idempotent delivery audit row.
- The supply-chain snapshot is factual current state, not a fabricated change log.
- Existing enterprise tables and authorized APIs remain intact for data safety, while their UI is inactive in this POC.

## Future roadmap

After customer validation, separately approve licensed source coverage, a verified CSV mapping workflow, outbound email infrastructure, graph change history, multilingual vocabularies and explicit historic reprocessing. Claims, Events, reviewer governance, scoring, alerts and automated decisions remain outside this POC.

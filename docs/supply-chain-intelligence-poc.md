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
- `NewsletterPreference` belongs to an exact user/customer membership and is disabled by default.
- `DailyBrief` freezes the graph revision and supply-chain counts. `DailyBriefItem` has composite tenant-safe references to its brief and exposure. Re-generation for the same customer/date is idempotent.
- The radar worker processes pending articles and generates due briefs. Email transport is deliberately not simulated; the POC delivers the brief in the application and stores an optional future delivery address/schedule.

## Customer experience

The customer-facing navigation exposes Dashboard, Supply chain, News radar, Daily brief and Settings. ADMIN/REVIEWER may additionally inspect Sources and Articles. Claims, extraction, Events, exposure candidates, identities and review workflows are not registered in the POC application or exposed in its frontend.

The Daily Brief contains:

1. top developments;
2. potential exposures;
3. a factual supply-chain snapshot (no change history is inferred);
4. a watchlist.

Every intelligence item links to the original source, publication date, deterministic relevance explanation and explicit customer graph path. It never recommends or automates an action.

## Demo environment

The fictional `European Electronics Manufacturer` workspace contains exactly 20 suppliers, 50 factories, 30 products, 20 materials, 15 routes and 10 route-linked ports on a clean seed. It covers electronics relationships across China, Taiwan, Vietnam, Malaysia, Indonesia, Chile, the USA, Germany and the Netherlands.

The seed includes exactly 100 clearly labelled synthetic demo articles under `.invalid` URLs. They exercise supplier, factory, product, material, route and port matches across operational, logistics, trade and economic scenarios. These fixtures are not presented as real reporting and never use a real publisher identity.

The separate BSK Fashion workspace remains based only on public BSK master data. Unknown BSK suppliers, routes and ports remain empty.

## Scope and limitations

- Matching is exact and deterministic. There is no AI/fuzzy graph matching or opaque score.
- Match confidence describes identity/location specificity, not risk, impact or priority.
- CSV import is omitted because functional manual input already exists and a reliable CSV mapping workflow was not necessary for this POC.
- RSS/Atom feeds require ADMIN verification and activation. The seed does not activate unverified feeds or bypass publisher restrictions.
- Outbound email delivery is not connected. Preferences and scheduled brief generation are functional; the brief is delivered in-app.
- The supply-chain snapshot is factual current state, not a fabricated change log.
- Existing enterprise tables remain in migration history for data safety, but their routes and UI are inactive in this POC.

## Future roadmap

After customer validation, separately approve licensed source coverage, a verified CSV mapping workflow, outbound email infrastructure, graph change history, multilingual vocabularies and explicit historic reprocessing. Claims, Events, reviewer governance, scoring, alerts and automated decisions remain outside this POC.

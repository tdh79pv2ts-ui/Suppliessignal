# BSK Fashion supply-chain intelligence POC v1

## Purpose

This workspace is the first customer-specific SupplySignal POC for BSK Fashion. It uses public, attributable information and does not infer suppliers, logistics routes, ports, customers, or product-material relationships.

## Public graph data

The seed creates the `BSK Fashion` customer workspace with four publicly listed facilities:

- Guangzhou Bisakai Leather Co., Ltd — Shiling Town, Huadu District, Guangzhou, China; head office, development and production; established 2012; BSCI and GRS listed.
- Welcombine Co., Ltd — Yangon, Myanmar; production; established 2017; BSCI listed.
- YLX Company Limited — Yangon, Myanmar; production; established 2018.
- BSK Bangladesh — Cumilla EPZ, Bangladesh; production; established 2024.

The public product catalog supplies six representative product categories: Handbag, Backpack, Travel Bag, Crossbody Bag, Cosmetic Bag, and Wallet. It also explicitly lists Faux leather, Nylon, Polyester, PU, and Semi PU as material filters.

Only one factory-product edge is added: Welcombine to Handbag and Backpack. BSK explicitly documents those product types for that facility. No facility-specific product or material assignments are inferred elsewhere.

The schema requires criticality and material-substitutability values. The seed therefore uses `MEDIUM` as a neutral POC criticality default and `false` as an unverified substitutability placeholder. Neither is presented as a BSK-published fact; both require customer validation before operational use.

## Evidence sources

- BSK Fashion facilities: <https://bskfashion.com/facilities/>
- BSK Fashion products and materials: <https://bskfashion.com/products/>
- BSK Fashion company history and product ranges: <https://bskfashion.com/about/>
- Welcombine facility detail: <https://bskfashion.com/myanmar-welcombine-bag-factory/>

These URLs describe the customer master data. They are not treated as external disruption news.

## Regional monitoring profile

The monitoring profile is generated from the customer graph, never from invented dependencies. Its initial country coverage is China, Myanmar, and Bangladesh, with Greater China/East Asia, Southeast Asia, and South Asia as derived regional groupings. Industries and monitoring keywords come from the stored BSK company, facility, product, material, and location records.

Five enabled feeds provide real external articles:

- South China Morning Post — China RSS: <https://www.scmp.com/rss/4/feed>
- The Daily Star — Business RSS: <https://www.thedailystar.net/business/rss.xml>
- Myanmar Ministry of Commerce, Trade Training Institute RSS: <https://tti.commerce.gov.mm/rss.xml>
- USGS Significant Earthquakes Atom: <https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.atom>
- World Trade Organization News RSS: <https://www.wto.org/library/rss/latest_news_e.xml>

The first three are country/regional sources. USGS and WTO remain lower-priority global fallbacks. Original article URLs and source metadata are retained. Additional government, customs, regional, logistics, Reuters, Financial Times, and Associated Press pages are registered as visible recommendations but remain collection-disabled where no supported, verified RSS/Atom configuration is available.

The deterministic relevance vocabulary includes the four facility names and their countries/cities, the six product categories, and the five published materials. Source country metadata helps recommend sources but never proves an article affects that country: the article text or a validated translation must contain the exact graph/location evidence. `HIGH` direct and `MEDIUM` explicit geography matches appear in the customer view; `LOW` industry context does not. The matcher does not create Claims, Events, exposure conclusions, or scores.

The dedicated POC worker runs every five minutes. Each cycle collects due enabled feeds, lets the existing URL/content hashes reject duplicates, persists source status/errors, optionally creates schema-validated translations, and only then refreshes article relevance. English, Dutch, German, French, Spanish, Chinese, Japanese, Korean, and Vietnamese are supported preference/translation languages. Original text and URLs remain unchanged and can be opened from the translated view.

Daily Brief email is disabled by default. With an explicitly configured server-side provider, an opted-in membership receives one idempotent customer-scoped brief containing only `HIGH` and `MEDIUM` items and their original sources. No synthetic articles are seeded; the first successful worker cycle supplies real articles.

## Deliberately absent

- No public supplier identities were added.
- No routes or ports were added because no authoritative public BSK route data was found.
- No product-material edges were added because the catalog filters do not prove which material belongs to which product.
- No fake articles or BSK-specific disruption events were created.

BSK can complete these fields through the existing manual supply-chain UI when authoritative internal data is available.

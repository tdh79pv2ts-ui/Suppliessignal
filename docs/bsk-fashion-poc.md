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

## Sources and relevance

Two enabled primary/public feeds provide real external articles: USGS Significant Earthquakes (Atom) and World Trade Organization News (RSS). Their original article URLs and source metadata are retained. Six additional public organizations are registered as reference sources but remain collection-disabled because no supported, verified RSS/Atom configuration is available.

The deterministic relevance vocabulary includes the four facility names and their countries/cities, the six product categories, and the five published materials. The customer article view shows only articles matching explicit BSK graph terms. It does not create Claims, Events, exposure conclusions, or scores.

The dedicated POC worker runs every five minutes. Each cycle collects due enabled feeds, lets the existing URL/content hashes reject duplicates, persists source status/errors, and only then refreshes article relevance. No synthetic articles are seeded; the first successful worker cycle supplies real articles.

## Deliberately absent

- No public supplier identities were added.
- No routes or ports were added because no authoritative public BSK route data was found.
- No product-material edges were added because the catalog filters do not prove which material belongs to which product.
- No fake articles or BSK-specific disruption events were created.

BSK can complete these fields through the existing manual supply-chain UI when authoritative internal data is available.

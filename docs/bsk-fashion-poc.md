# BSK Fashion news-radar POC

## Purpose

This workspace is the first customer-specific version of the SupplySignal news radar for BSK Fashion. It uses only public information published by BSK Fashion and does not infer suppliers, logistics routes, ports, customers, or product-material relationships.

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

## Radar profile

The deterministic monitoring vocabulary now includes the four facility names and their countries/cities, the six product categories, and the five published materials. Country and location coverage can therefore surface potential relevance for China/Guangzhou, Myanmar/Yangon, and Bangladesh/Cumilla. Matches remain potential exposure signals rather than risk scores or recommendations.

## Deliberately absent

- No public supplier identities were added.
- No routes or ports were added because no authoritative public BSK route data was found.
- No product-material edges were added because the catalog filters do not prove which material belongs to which product.
- No live publisher RSS feeds were activated without verifying feed URLs and usage terms.
- No fake articles or BSK-specific disruption events were created.

BSK can complete these fields through the existing manual supply-chain UI when authoritative internal data is available.

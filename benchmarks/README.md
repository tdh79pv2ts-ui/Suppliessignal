# BSK POC quality benchmarks

Frozen on 2026-08-25 for the final POC quality pass.

## Golden classification corpus

`bsk-collected-articles.json` contains public metadata only for 200 real
articles collected from the five BSK-enabled machine-readable sources. It
contains no article bodies, customer identifiers, credentials or production
classification output. `bsk-news-intelligence-golden.json` records the
independently human-reviewed label and reason for every item.

The observed corpus distribution is 0 Direct, 0 Potential, 14 Broader and 186
Exclude. The absence of Direct/Potential cases is a measured source-coverage
gap, not a reason to synthesize cases or claim vacuous precision. This corpus
predates the source-coverage hardening migration: it contains articles from
five collectible sources, while a clean post-hardening seed configures eleven
collectible sources. The frozen labels and inputs remain unchanged. Run:

```sh
pnpm poc:benchmark:rules
pnpm poc:benchmark
```

The first command checks the deterministic Broader/Exclude rule without a
database. The second checks all four classes against processed PostgreSQL
state and intentionally cannot pass when the corpus contains no displayed
Direct/Potential candidates.

## Known-development discovery corpus

`bsk-known-developments.json` contains 30 real public developments that the
POC reasonably should discover: 1 Direct, 8 Potential and 21 Broader. Run:

```sh
pnpm poc:benchmark:discovery
```

URL matching removes common tracking/AMP variants but does not use fuzzy title
matching. A miss is therefore auditable. The frozen 200-article corpus found
0/30. Most selected developments predate the retained feed window, so this
result measures the historic corpus as well as source coverage. Historic feed
retention and missing local/regional discovery sources are the primary
measured causes; classification tuning cannot repair discovery. The added
machine-readable regional/global feeds can only be judged on a new
post-deployment monitoring window and do not retroactively change this frozen
result.

Golden version 1.2 records a documented human-review correction for four
environmental headlines found during staging validation. Magnitude alone, and
a customer-country name alone, do not establish the required manufacturing,
logistics or infrastructure pathway. The correction is explicit in the
dataset history; it was not derived from classifier output.

## Coverage matrix

| BSK dependency | Current coverage | Evidence/gap |
| --- | --- | --- |
| Guangzhou / China factory | Moderate | One high-volume English China source; no verified factory/local-government monitoring |
| Yangon / Myanmar factories | Improving, not yet measured | DVB English RSS is configured after the frozen corpus; no verified supplier or Burmese-language feed |
| Cumilla EPZ / Bangladesh factory | Improving, not yet measured | TBS Industry RSS is configured after the frozen corpus; known Cumilla flood stories were not retained |
| BSK legal entities | Weak | No enabled supplier/company newsroom or registry change feed |
| Bags and accessories | Weak | No dedicated fashion/accessories industry discovery source |
| Faux leather, nylon, polyester, PU | Weak | No material/commodity-specific source in the enabled set |
| Ports and routes | Not measurable | BSK has no verified route or port relationships; none may be invented |
| Trade and regulation | Moderate | WTO plus regional news, but feed retention misses known historic measures |
| Natural disasters | Improving, not yet measured | GDACS, NASA and NOAA machine feeds are configured after the frozen corpus; no customer route/location relationship may be inferred |
| Local languages | Weak | Frozen corpus is English/unknown only; no Chinese, Burmese or Bengali item was discovered |

## Interpretation

The 200-item offline rule result is a classifier result, not an end-to-end
release score. Release approval still requires a representative Direct and
Potential sample, at least 90% discovery recall, completed staging processing,
no material backlog, successful repeated cycles/reconciliation, and staging
E2E. Do not label the POC ready while any of those gates is unverified.

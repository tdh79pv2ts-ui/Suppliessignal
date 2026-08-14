# Real supply-chain knowledge graph

## Purpose and scope

This POC foundation stores a factual, customer-scoped supply-chain graph whose nodes and edges carry provenance. The database remains the system of record. A missing edge means **unknown**, not false, and the application never fills gaps by inference.

This step does not add news intelligence, exposure matching, newsletters, risk scoring, or alerts. Existing capabilities remain unchanged.

## Node model

| Node | Scope | Purpose |
| --- | --- | --- |
| `Company` | Customer | Organization from whose perspective disclosed supply-chain relationships are recorded |
| `Supplier` | Customer | Explicit supplier organization |
| `Factory` | Customer | Disclosed production facility |
| `Product` | Customer | Disclosed product or product family |
| `Material` | Customer | Material explicitly associated with a product |
| `Location` | Customer | Verified geographic place used by a graph node |
| `Country` | Global reference | ISO-backed country reference |
| `Route` | Customer | A documented logistics route; no route is created without evidence |
| `Port` | Global reference | Official port reference |

All nodes support source name, original source URL, and verification date. Existing operational entities use nullable provenance fields for forward-only migration compatibility; newly seeded POC entities are fully sourced. `Company`, `Country`, and `Location` require provenance at the database layer.

## Edge model

The graph supports:

- `CompanySupplier`: Company → Supplier
- `Factory.supplierId`: Supplier → Factory, with dedicated relationship provenance fields
- `FactoryProduct`: Factory → Product
- `ProductMaterial`: Product → Material
- `RoutePort`: Route → Port
- `FactoryLocation`: Factory → Location

Every newly established relationship records `sourceName`, `sourceUrl`, `collectedAt`, and confidence from 0 through 1. Composite foreign keys bind both endpoints of customer-owned joins to the same `customerId`; PostgreSQL therefore rejects cross-tenant edges. Composite primary or unique constraints reject duplicate relationships.

## Initial public-data dataset

The Apple workspace contains six real company nodes and five supplier nodes disclosed in Apple's supplier reporting: TSMC, Hon Hai Precision Industry, Corning, Infineon Technologies, and Micron Technology. The supplier evidence is Apple's *Supplier Clean Energy Program Update 2022*.

Three TSMC fab nodes and their locations come from TSMC's official fab-location directory. The iPhone 16e and six materials come from Apple's product environmental report. Port of Los Angeles and Port of Rotterdam are global reference nodes sourced from their official websites.

No Apple factory-to-product edge is included because the selected sources do not prove that a specific listed fab makes the selected product. No route-to-port edge is included because no authoritative route disclosure was found. Those gaps are intentionally visible.

The BSK Fashion public-data workspace is retained. Its factories and products point to BSK's own facilities and product pages; only Welcombine → Handbag and Welcombine → Backpack are represented because those are the facility-product relationships explicitly published by BSK.

## Data collection contract

The first collection mechanism is a deterministic, reviewable seed/import boundary:

1. An operator obtains an official supplier disclosure, company report, company site, or official reference database.
2. The original URL and publication identity are retained.
3. Nodes and edges are created only for statements the source explicitly supports.
4. The collection date and confidence are stored on each edge.
5. Database uniqueness and tenant-safe foreign keys reject duplicates and cross-customer relationships.
6. A human can inspect the source directly from the graph explorer.

Future ingestion may automate retrieval, but must preserve this contract and must not infer customer relationships.

## API and explorer

`GET /api/customers/:customerId/supply-chain` returns normalized companies, suppliers, factories, products, materials, routes, ports, countries, locations, and their relationship records. Existing membership-based authorization protects the complete graph. Company CRUD uses `/api/customers/:customerId/companies`; company-supplier writes require full relationship provenance.

The Supply Chain dashboard shows company, supplier, factory, country, material, and relevant-port counts. Its evidence explorer shows Company → Supplier, Supplier → Factory, Factory → Location, and Product → Material data with source links, confidence, and collection/verification dates.

## Known limitations

- Public disclosures are incomplete and may become stale; `verifiedAt` records when evidence was checked, not continuous truth.
- The initial dataset is intentionally small and is not a complete Apple or BSK supply chain.
- Supplier tiers and criticality are operational classifications, not independently verified risk scores.
- Ports remain global references and appear in a customer graph only through an explicit route relationship.
- No fuzzy matching, AI identity resolution, inferred routing, or automatic discovery is used.

## Next step

After approval, expand the reviewed import workflow and source coverage while preserving explicit provenance. News or exposure work is a separate, later step and is not part of this foundation.

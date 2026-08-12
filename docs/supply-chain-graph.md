# Supply-chain knowledge graph

```text
CUSTOMER
   │
   ├── SUPPLIERS
   │       ├── FACTORIES
   │       └── PRODUCTS
   ├── PRODUCTS
   │       └── MATERIALS
   └── ROUTES
           ├── SUPPLIERS
           ├── FACTORIES
           └── PORTS
```

Suppliers, factories, products, materials, and routes belong to exactly one customer. Users access them through `CustomerMembership`; reviewers receive no implicit access and only administrators have a platform-wide bypass. Ports are global reference records. A port becomes relevant to a customer only through `RoutePort`.

All graph edges are explicit join rows. The application never infers that a factory produces a product, a product uses a material, or a route serves an asset. Service checks and composite foreign keys reject cross-customer edges. Operational entities use `active=false` for archival; records and relationships are retained.

Entity list APIs use page/page-size pagination with a maximum page size of 100 and simple database filters. The full graph endpoint returns the complete graph because the V1 pilot assumes a small customer master-data set. This must be revisited for materially larger graphs.

The graph is factual input to the future Customer Exposure Engine. Phase 2 performs no exposure, risk, intelligence, evidence, or AI calculation.

## Test database

Use a dedicated PostgreSQL database URL that cannot point to production. Apply migrations with `pnpm prisma migrate deploy`, seed with `pnpm db:seed`, and then run `pnpm test`. Integration route tests inject deterministic services and do not depend on manually prepared developer state. Database migration verification requires an available PostgreSQL service.

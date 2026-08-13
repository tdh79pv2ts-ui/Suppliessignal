# Source intelligence

```text
GLOBAL INTELLIGENCE LAYER
SOURCE REGISTRY → COLLECTORS → RAW SOURCE ITEM → NORMALIZATION → DEDUPLICATION → SOURCE ARTICLE → CLAIM EXTRACTION

CUSTOMER LAYER
CUSTOMER → SUPPLY CHAIN GRAPH
```

These layers are not connected in Phase 3. `Source`, `SourceArticle`, and `SourceCollectionRun` are global. ADMIN manages and triggers sources; REVIEWER can inspect sources, runs, and articles; CUSTOMER cannot access the unrestricted corpus.

RSS and Atom use a collector abstraction in `packages/ingestion`. Malformed individual items are counted and skipped while usable items continue. Feed metadata is stored even without a body. Manual articles use the same normalization, hash, and deduplication path. WEB/API are registry types only and automated collection returns `UNSUPPORTED_SOURCE_TYPE`.

The original URL is never replaced. Canonicalization lowercases hosts, removes fragments/default ports/trailing non-root slashes and only the known `utm_*` tracking parameters. `urlHash` is SHA-256 of the canonical URL. `contentHash` is SHA-256 of deterministic whitespace-normalized text. Deduplication is scoped to one source using external ID, canonical URL hash, and normalized content hash. Similar coverage from different sources remains distinct.

Network fetches allow only HTTP(S), resolve DNS before every request and redirect, reject loopback/private/carrier-grade-NAT/link-local/metadata destinations, and pin the validated public IP to the actual HTTP/TLS socket. The original hostname remains authoritative for the Host header, TLS SNI, and certificate verification. Redirects repeat the complete validation-and-pinning process. Requests also limit redirects, timeout, response bytes, and set an explicit user agent. No general crawler, JavaScript rendering, paywall bypass, authentication bypass, AI cleanup, or summary exists.

Collection runs persist safe counters and errors. Health is deterministic: disabled when inactive/collection-disabled; failing after three consecutive failures; degraded after fewer failures or before a first success; healthy after success. A process-local lock blocks overlapping source runs. The worker runs due sources sequentially every minute, providing conservative global concurrency and a replaceable process boundary. Start it with `pnpm --filter @suppliesignal/api start:worker` after build.

The seed contains eleven verified public organization base URLs, all `WEB` and collection-disabled because no feed URL was verified. It also contains clearly labelled fictional manual news-radar evidence on `.invalid` URLs; it contains no real publisher-attributed sample articles. Full-body storage rights and retention policies remain deployment responsibilities; metadata, excerpts, and original links remain useful when bodies are not stored.

Sources now default to a 15-minute interval, with validated 5-minute through weekly intervals. The independent news-radar worker can match newly collected articles directly to explicit customer graph data; see [the POC documentation](supply-chain-news-radar-poc.md).

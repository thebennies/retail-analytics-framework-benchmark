# Caveats — Known Limitations & Disclaimers

Append-only log. Each entry: short title, what it limits, mitigation if any. Add entries as issues surface during implementation.

---

## C-001: Results not portable across hardware

Benchmark results are only valid on the hardware on which they were captured. CPU model, cache size, memory bandwidth, NIC behavior, disk type, and hypervisor overhead all materially affect outcomes. **Mitigation:** re-run on target hardware. The dashboard records hardware context per run.

## C-002: k6 shares VM with service under test

On any VM, k6 itself consumes CPU. At concurrency 10K, k6 alone needs ~1-2 cores. CPU pinning to a dedicated core mitigates contention on 8+ core VMs. On 4-core VMs, k6 must share with PgBouncer — accept the noise or use a larger VM.

## C-003: PgBouncer pool size = 100 is a hard ceiling

At concurrency 1000+, client requests queue at PgBouncer (`default_pool_size=100`, transaction mode). The benchmark measures **how each framework handles wait under saturation**, not parallel DB execution beyond 100 simultaneous transactions.

## C-004: Multi-process services have inherent memory overhead

FastAPI (4 uvicorn workers) and Fastify (4 cluster workers) maintain N independent process memory footprints. Axum (single tokio multi-thread process) does not. This is an **architectural truth of each ecosystem**, not unfair design. Memory comparisons reflect this.

## C-005: Warm cache only

PostgreSQL buffer cache is warmed before each benchmark batch via `pg_prewarm('transactions')` + `pg_prewarm('transaction_items')`. Cold-cache results would be slower for every framework and are not measured here.

## C-006: JSON serialization size differs per endpoint

`top-products` returns 100 rows. `daily-sales` returns ~30. The total response time partly reflects serializer performance and is **by design** — full-stack measurement, not framework-in-isolation.

## C-007: Docker bridge network adds ~0.1-0.3ms

All services connect to PgBouncer via the Docker `bench` bridge. Latency overhead is equal across all three services, so fairness is preserved, but absolute numbers differ from host-network configurations.

## C-008: Results not reproducible 3+ months later

PostgreSQL minor versions, framework releases, driver updates, kernel patches, and Docker version changes all shift numbers. Snapshot is valid only at the `hardware_runs.detected_at` timestamp with the captured software versions.

## C-009: sqlx NUMERIC -> f64 precision loss (Phase 2a)

PostgreSQL `NUMERIC(14,2)` columns (e.g., `total_amount`, `revenue`) arrive
in sqlx as `bigdecimal::BigDecimal`. To produce JSON numbers parity-compatible
with FastAPI's `float(Decimal)`, we convert via `BigDecimal::to_f64()`. This
introduces IEEE 754 rounding for very large sums (Rp values > ~9 trillion
lose sub-cent precision). The parity gate tolerates ±0.01 to absorb this.
For downstream financial reporting use, prefer NUMERIC-as-string and
parse client-side.

## C-010: sqlx + PgBouncer transaction-pool requires statement-cache discipline (Phase 2a)

sqlx 0.8 caches prepared statements per connection. PgBouncer in
`pool_mode=transaction` reassigns server connections per transaction, so
cached statement IDs become stale and `fetch_all` can fail with
`prepared statement "sqlx_s_<N>" does not exist`. In sqlx 0.8 the
`statement_cache_capacity` method was removed; the default cache size
is 100. We use `sqlx::query()` (text protocol, no prepare) which avoids
this issue entirely. FastAPI's asyncpg sets `statement_cache_size=0` for
the same reason.

## C-011: tokio worker_threads pinned to cpuset (Phase 2a)

Axum runs single-process with a tokio multi-thread runtime. We pin
`worker_threads=4` (env-overridable) to match the 4 vCPU cpuset.
Without this, tokio defaults to `num_cpus::get()` which on a 16-core host
can add extra runtime threads competing for the pinned cores. Verified
at startup via tracing log.

## C-012: work_mem=64MB required for location-product-matrix (Phase 2a)

The location-product-matrix query joins transactions + transaction_items +
products + stores, producing 1000 rows (100 locations × 10 categories).
With the default `work_mem=16MB`, PostgreSQL fails with "could not resize
shared memory segment: No space left on device". Bumped to `work_mem=64MB`
in `generate-postgres-config.sh`.

## C-013: Node.js cluster shared-socket round-robin (Phase 2b)

Fastify runs 4 workers via Node.js `cluster` module, all binding to port 8002.
The primary process holds the socket and round-robins connections to workers.
Under low concurrency (c < workers), some workers may receive zero requests
while others handle multiples. This differs from FastAPI (uvicorn pre-fork with
SO_REUSEPORT) and Axum (single-process tokio runtime with 4 threads). At c ≥ 10
the distribution normalizes. Benchmark results at c=2 should be interpreted
with this in mind — per-request variance may be higher for Fastify.

## C-014: node-postgres INT8 returned as string by default (Phase 2b)

By default, node-postgres returns BIGINT (OID 20) values as strings to avoid
JavaScript's Number precision loss above 2^53. We override the type parser
to `parseInt(val, 10)` for parity with FastAPI (Python int) and Axum (i64).
This is safe because our largest count values (~10M) are well within JS
safe integer range. Databases with BIGINT values > Number.MAX_SAFE_INTEGER
would need a different approach (e.g., BigInt or string passthrough).

## C-015: node-postgres NUMERIC returned as string by default (Phase 2b)

PostgreSQL NUMERIC(14,2) columns arrive in node-postgres as strings (e.g.,
"1234567.89"). We override OID 1700 to `parseFloat(val)`, matching FastAPI's
`float(Decimal)` and Axum's `BigDecimal::to_f64()`. Same IEEE 754 precision
caveat as C-009: values > ~9 trillion Rp lose sub-cent precision. The parity
gate tolerates ±0.01.

## C-016: Fastify RSS includes V8 heap + compiled code cache (Phase 2b)

Fastify's peak RSS of ~52MB at c=2 is notably higher than FastAPI (~29MB) and
Axum (~6MB). This is expected: Node.js V8 reserves a substantial heap even at
idle (default ~1.5GB address space, ~40MB RSS baseline for a loaded script).
The RSS metric includes V8's compiled code cache, internal parsers, and the
cluster module's IPC buffers. It does NOT indicate a memory leak. For
memory-constrained deployments, `--max-old-space-size` can cap the V8 heap.

## C-017: query_time_ms asymmetry across frameworks (Phase 2+)

The `query_time_ms` field in response envelopes is not apples-to-apples across
frameworks due to driver-side row decoding placement:
- **FastAPI/asyncpg**: timing wraps `conn.fetch()` only; row decoding happens
  after the timer, so `query_time_ms` excludes Python-side overhead.
- **Axum/sqlx**: timing wraps `query.fetch_all()` only; row decoding happens
  after the timer, so `query_time_ms` excludes Rust-side overhead.
- **Fastify/node-postgres**: timing starts *before* `pool.query()` (sets `q0`
  immediately before call), and row decoding happens inside the driver, so
  `query_time_ms` includes both PostgreSQL round-trip **and** Node.js decoding.

This biases `query_time_ms` against Fastify relative to the other two. The
headline `execution_time_ms` metric (which includes full request handling) and
k6's `http_req_duration` are unaffected. Treat `query_time_ms` as informational
for cross-framework comparison; it's useful for per-framework tuning but not
for ranking.

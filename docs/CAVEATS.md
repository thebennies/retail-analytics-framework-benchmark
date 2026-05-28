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

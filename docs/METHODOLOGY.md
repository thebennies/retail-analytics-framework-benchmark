# Methodology

This document covers HOW we measure: what each metric captures, how the
load test is structured, and what the known noise sources are. Pair with
`docs/CAVEATS.md` for known limitations. Key caveats: C-002 (k6 CPU sharing),
C-003 (PgBouncer pool ceiling), C-005 (warm cache only), C-007 (Docker bridge).

## What `execution_time_ms` vs `query_time_ms` measures

- `execution_time_ms` — wall clock from "handler entered" to "response object
  built". Includes pool acquire wait, query, result fetch, asyncpg → Python
  decoding, Decimal/Date coercion, and dict construction. **Excludes** TCP write
  back to the client.
- `query_time_ms` — wall clock from just before `conn.fetch(sql)` to just
  after it returns. Closest analog to "pure DB roundtrip cost".

## Warmup / measure / cooldown semantics

Each (framework, endpoint, concurrency) level runs:

1. **Warmup** — 10 seconds at the target concurrency. Tagged `phase:warmup`.
   Lets workers initialize pools and Postgres warm hot pages.
2. **Measure** — 60 seconds at the target concurrency. Tagged `phase:measure`.
   This is the window we report.
3. **Cooldown** — 15 seconds idle between levels.

k6 emits a JSON stream (`--out json=...`). Our parser keeps only points
whose `data.tags.phase == "measure"`.

## Closed-loop VU model

k6 uses `executor: 'constant-vus'`. Each VU sends the next request as soon
as the previous response arrives. This is **closed-loop**: the client side
cannot generate more requests than the server can absorb.

## pg_prewarm rationale

Before each framework's run we call
`SELECT pg_prewarm('transactions'); SELECT pg_prewarm('transaction_items');`
to pull both heap relations into the Postgres buffer cache. Makes the starting
condition uniform across frameworks.

## Per-worker pool sizing

FastAPI uses `uvicorn --workers 4`. Each worker owns its own `asyncpg` pool.
`min_size=5, max_size=25` → 4 × 25 = 100 total client connections, matching
PgBouncer `default_pool_size`.

## Why `/benchmark/full-summary` is sequential

Spec section 5: 8 sub-queries run one after another, NOT via `asyncio.gather`.
A unit test in `test_full_summary_sequential.py` enforces this.

## RSS sampling cadence

`scripts/sample-rss.sh` samples once per second from cgroup v2 `memory.current`.
First 10 seconds (warmup) excluded from AVG; peak is taken across full window.

## PgBouncer transaction-mode caveats

- **No session state**: prepared statements don't persist across transactions.
- **`asyncpg.create_pool(statement_cache_size=0)` is required** to avoid
  `"prepared statement does not exist"` errors.

## Reproducibility gate

`scripts/check-reproducibility.sh`: same workload run twice, RPS variance
must be < 10%. Failure appends `C-REPRO` to `CAVEATS.md` and blocks Phase 2.

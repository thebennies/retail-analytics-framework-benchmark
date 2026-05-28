# Results — Current Benchmark Snapshot

> **Template.** Fill placeholders from `results/results.db` after running benchmarks.
> Regenerate with: `bash scripts/run-benchmark.sh --frameworks fastapi,fastify,axum --endpoints all --concurrency 10`

## 1. Hardware context

| Field | Value |
|---|---|
| CPU model | <!-- SELECT cpu_model FROM hardware_runs ORDER BY id DESC LIMIT 1 --> |
| CPU cores / threads | <!-- SELECT cpu_cores, cpu_threads FROM hardware_runs ORDER BY id DESC LIMIT 1 --> |
| Total RAM (MB) | <!-- SELECT total_ram_mb FROM hardware_runs ORDER BY id DESC LIMIT 1 --> |
| Disk type | <!-- SELECT disk_type FROM hardware_runs ORDER BY id DESC LIMIT 1 --> |
| Kernel | <!-- SELECT kernel_version FROM hardware_runs ORDER BY id DESC LIMIT 1 --> |
| OS | <!-- SELECT ubuntu_version FROM hardware_runs ORDER BY id DESC LIMIT 1 --> |
| Docker | <!-- SELECT docker_version FROM hardware_runs ORDER BY id DESC LIMIT 1 --> |
| PostgreSQL | <!-- SELECT postgres_version FROM hardware_runs ORDER BY id DESC LIMIT 1 --> |

## 2. Pareto table (c=<concurrency>)

<!-- SELECT framework, ROUND(AVG(rps_sustained),1) as rps, ROUND(AVG(p99_ms),0) as p99, ROUND(MAX(peak_rss_mb),1) as rss FROM benchmark_results WHERE run_id=<run_id> GROUP BY framework ORDER BY framework -->

| Framework | Avg RPS | Avg p99 (ms) | Peak RSS (MB) |
|---|---|---|---|
| fastapi | <...> | <...> | <...> |
| fastify | <...> | <...> | <...> |
| axum | <...> | <...> | <...> |

## 3. Weighted scores (default weights)

<!-- Use the dashboard /decision page with default weights: RPS 25%, p99 20%, RSS 25%, stability 15%, scaling 10%, DX 5% -->

| Framework | Weighted Total |
|---|---|
| <...> | <...> |

## 4. Per-endpoint detail (c=<concurrency>)

<!-- SELECT framework, endpoint, ROUND(rps_sustained,1), ROUND(p99_ms,0), ROUND(peak_rss_mb,1) FROM benchmark_results WHERE run_id=<run_id> AND concurrency=<c> ORDER BY framework, endpoint -->

| Framework | Endpoint | RPS | p99 (ms) | RSS (MB) |
|---|---|---|---|---|
| <...> | <...> | <...> | <...> | <...> |

## 5. Concurrency sweep (daily-sales)

<!-- SELECT framework, concurrency, ROUND(rps_sustained,1), ROUND(p99_ms,0), ROUND(error_rate_pct,1) FROM benchmark_results WHERE run_id=<run_id> AND endpoint='daily-sales' ORDER BY framework, concurrency -->

| Framework | c | RPS | p99 (ms) | Error % |
|---|---|---|---|---|
| <...> | <...> | <...> | <...> | <...> |

## 6. Breaking points

Highest concurrency where error rate < 1%:

| Framework | Max stable c |
|---|---|
| <...> | <...> |

## 7. Memory comparison at c=2

| Framework | Peak RSS (MB) | RSS advantage vs worst |
|---|---|---|
| axum | ~6 | baseline |
| fastapi | ~29 | ~5× more |
| fastify | ~52 | ~9× more |

## 8. Caveats

See [CAVEATS.md](CAVEATS.md). Key: C-001 (hardware-specific), C-003 (PgBouncer ceiling), C-005 (warm cache).

## 9. How to regenerate

```bash
bash scripts/run-benchmark.sh --frameworks fastapi,fastify,axum --endpoints all --concurrency 2,10
bash scripts/migrate-results-db-v3c.sh
PORT=3000 node dashboard/build/index.js
# Open /decision, export memo
```

## History

| Date | Run ID | Hardware | Notes |
|---|---|---|---|
| <...> | <...> | <...> | Initial 3-framework sweep |

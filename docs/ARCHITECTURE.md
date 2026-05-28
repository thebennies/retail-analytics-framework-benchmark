# Architecture

> System architecture for the retail analytics framework benchmark.

## Overview

Three HTTP services (FastAPI, Fastify, Axum) expose identical read-only analytical endpoints backed by a shared PostgreSQL 16 database through PgBouncer. A k6 load generator drives concurrent requests against each service while RSS and latency metrics are captured into a SQLite results database.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Host (Ubuntu 24.04)                       │
│                                                                   │
│  CPU pinning (detect-hardware.sh + cpu-pin.sh):                  │
│  ┌──────────┬──────────┬──────┬────────────────────────────┐     │
│  │postgres  │pgbouncer │  k6  │ service (fastapi/fastify/  │     │
│  │cores 0-1 │ core 2   │core 3│ axum, one at a time)       │     │
│  │          │          │      │ cores HALF..MAX (pinned)   │     │
│  └──────────┴──────────┴──────┴────────────────────────────┘     │
│                                                                   │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐                     │
│  │ FastAPI  │   │ Fastify  │   │   Axum   │                     │
│  │ :8001    │   │ :8002    │   │ :8003    │                     │
│  │ 4 workers│   │ 4 cluster│   │ 4 threads│                     │
│  │ ×25 pool │   │ ×25 pool │   │ 100 pool │                     │
│  └────┬─────┘   └────┬─────┘   └────┬─────┘                     │
│       │              │              │                             │
│       └──────────────┼──────────────┘                             │
│                      │  (only one active per benchmark run)      │
│                      ▼                                            │
│              ┌──────────────┐                                     │
│              │  PgBouncer   │                                     │
│              │  :6432       │                                     │
│              │  transaction │                                     │
│              │  pool=100    │                                     │
│              └──────┬───────┘                                     │
│                     │                                              │
│              ┌──────▼───────┐                                     │
│              │  PostgreSQL  │                                     │
│              │  16-alpine   │                                     │
│              │  10M rows    │                                     │
│              │  16.2M items │                                     │
│              └──────────────┘                                     │
│                                                                   │
│  ┌──────────┐                                                     │
│  │    k6    │──→ active service :8xxx                             │
│  │ (load    │                                                     │
│  │  gen)    │                                                     │
│  └──────────┘                                                     │
└─────────────────────────────────────────────────────────────────┘
```

## Services

### FastAPI (Python) — `services/fastapi-app/`

| Aspect | Detail |
|---|---|
| Runtime | Python 3.12, uvicorn with 4 workers |
| Framework | FastAPI 0.115 |
| DB driver | asyncpg (async, statement_cache_size=0) |
| Pool | 4 workers × (min=5, max=25) = 100 connections |
| Port | 8001 |
| Profile | `--profile fastapi` |

### Fastify (Node.js) — `services/fastify-app/`

| Aspect | Detail |
|---|---|
| Runtime | Node.js 22 LTS, cluster module (4 workers) |
| Framework | Fastify 5.x |
| DB driver | node-postgres (pg ^8), text protocol |
| Pool | 4 workers × (min=5, max=25) = 100 connections |
| Type overrides | INT2/INT4/INT8→int, NUMERIC→float, DATE→string |
| Port | 8002 |
| Profile | `--profile fastify` |

### Axum (Rust) — `services/axum-app/`

| Aspect | Detail |
|---|---|
| Runtime | Rust (latest stable), tokio multi-thread (4 worker threads) |
| Framework | Axum 0.7 |
| DB driver | sqlx 0.8 (text protocol via `sqlx::query()`) |
| Pool | single process, max=100, min=5 |
| Port | 8003 |
| Profile | `--profile axum` |

## Database

### Schema (4 tables)

```
locations (100 rows)
├── id, name, city, region

products (1,000 rows)
├── id, sku, name, category, base_price

payment_methods (4 rows)
├── id, name

transactions (10,000,000 rows)
├── id, transaction_time, location_id→locations,
│   payment_method_id→payment_methods,
│   total_amount, total_discount, item_count
│
└── transaction_items (16,200,000 rows)
    ├── id, transaction_id→transactions, product_id→products,
    └── quantity, unit_price, line_discount, subtotal
```

### Indexes (7)

- `idx_tx_time` on `transactions(transaction_time)`
- `idx_tx_location` on `transactions(location_id)`
- `idx_tx_payment` on `transactions(payment_method_id)`
- `idx_tx_loc_time` on `transactions(location_id, transaction_time)`
- `idx_txi_transaction` on `transaction_items(transaction_id)`
- `idx_txi_product` on `transaction_items(product_id)`
- `idx_txi_prod_tx` on `transaction_items(product_id, transaction_id)`

### PgBouncer

- `pool_mode=transaction` — connections returned to pool after each transaction
- `default_pool_size=100` — matches each service's total pool (4 workers × 25)
- `max_client_conn=15000` — supports high concurrency k6 loads
- `auth_type=scram-sha-256`

## Benchmark flow

```
run-benchmark.sh
  │
  ├── 1. detect-hardware.sh → write .k6-cpuset
  ├── 2. cpu-pin.sh → docker-compose.override.yml (cpusets + mem_limits)
  ├── 3. For each (framework, endpoint):
  │     ├── docker compose --profile <fw> up -d --build <fw>
  │     ├── sample-rss.sh & (background RSS sampler)
  │     ├── k6 run <endpoint>.js (warmup 10s + measure 60s)
  │     ├── parse summary-export JSON → insert into results.db
  │     └── docker compose --profile <fw> stop <fw>
  ├── 4. Error rate gate: stop sweep if err > threshold at current concurrency
  └── 5. Print summary table
```

See [METHODOLOGY.md](METHODOLOGY.md) for warmup/measure semantics and metric capture details.

## Parity gate

`scripts/parity-check.sh` captures all 8 named endpoints plus the composite `full-summary` from each framework and diffs the JSON output:

- **Count fields**: exact match required
- **Monetary fields** (NUMERIC→float): ±0.01 tolerance
- **String fields**: exact match
- **Full-summary**: dict-of-sub-tasks compared recursively

See [CAVEATS.md](CAVEATS.md) for precision tradeoffs. Key cross-refs: C-002 (k6 CPU sharing), C-003 (PgBouncer ceiling), C-007 (Docker bridge latency).
See [METHODOLOGY.md](METHODOLOGY.md) for warmup/measure semantics and metric capture details.

## Results storage

SQLite database at `results/results.db`:

- `hardware_runs` — host specs (CPU, RAM, kernel)
- `benchmark_runs` — per-sweep metadata (git SHA, timestamp)
- `benchmark_results` — per (framework, endpoint, concurrency) row with RPS, p99, error rate, peak RSS

## Docker Compose profiles

Each service uses a dedicated profile so only one is active during benchmarking:

```bash
docker compose --profile fastapi up -d    # FastAPI only
docker compose --profile fastify up -d    # Fastify only
docker compose --profile axum up -d       # Axum only
docker compose --profile generator up -d  # Data generator (bypasses PgBouncer)
```

## Configuration files

| File | Purpose |
|---|---|
| `database/postgresql.conf` | Auto-generated by `scripts/generate-postgres-config.sh` (gitignored) |
| `docker/docker-compose.override.yml` | Auto-generated by `scripts/cpu-pin.sh` (gitignored) |
| `.k6-cpuset` | Auto-generated by `scripts/detect-hardware.sh` (gitignored) |
| `.env` | Local environment overrides (gitignored, see `.env.example`) |

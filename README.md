# retail-analytics-framework-benchmark

Benchmark comparing **FastAPI vs Fastify vs Axum** throughput + memory efficiency on a 10M-row PostgreSQL retail-analytics workload. Output is a **decision memo for stack selection**, not an academic benchmark.

## Status

In active development. Phase 2b complete (all three services scaffolded + parity-verified). Dashboard and decision memo in progress.

## Disclaimer

1. **Results valid only for the hardware on which the benchmark was run.** Do not extrapolate to other specs.
2. **Results are a snapshot in time.** Do not reproduce 3+ months later without re-running on the same hardware and software versions.
3. **What is measured: full-stack performance.** DB driver, JSON serializer, async runtime, and worker model are all part of the result — not framework-in-isolation.
4. **At high concurrency (5K–10K), throughput is bounded by PgBouncer pool, not framework.** What is being tested: how each framework handles connection wait + event loop saturation.
5. **On VMs with fewer than 4 cores**, k6 shares CPU with the service under test. Results on small VMs are **noisier and not for final decisions**.

## Hardware requirements

- **Minimum**: 4 vCPU / 8GB RAM / 20GB SSD (caveat: noisy results)
- **Recommended**: 8 vCPU / 16GB RAM / 50GB SSD (clean CPU pinning)
- **Optimal**: 16 vCPU / 32GB RAM (to hit Axum ceiling)

## Hard environment preconditions

- Linux only (cgroup v2 required for CPU pinning + memory limits to be honored).
- Docker Engine (Docker Desktop on Mac/Windows silently no-ops `cpuset`).
- Ubuntu 24.04 LTS validated; other Linux distros: warn-but-proceed.

`scripts/detect-hardware.sh` fails fast if preconditions not met.

## Tech stack (pinned)

| Component | Choice | Version |
|---|---|---|
| Database | PostgreSQL | 16-alpine |
| Connection pool | PgBouncer (edoburu image) | 1.22+ |
| Service 1 | FastAPI + uvicorn + asyncpg | Python 3.12 |
| Service 2 | Fastify + pg | Node.js 22 LTS, Fastify 5.x |
| Service 3 | Axum + sqlx | Rust stable, axum 0.7+, sqlx 0.7+ |
| Load generator | k6 (native install) | latest stable |
| Dashboard | SvelteKit + Tailwind + Chart.js (native install) | SvelteKit 2.x |
| Results storage | SQLite | bundled |
| Host OS | Ubuntu 24.04 LTS | required |

## Layout

```
generator/        Python data generator (psycopg3 + COPY, 10M rows)
services/
  shared/         Shared SQL queries + OpenAPI spec
  fastapi-app/
  fastify-app/
  axum-app/
dashboard/        SvelteKit dashboard (native, not in docker-compose)
load-tests/       k6 scripts per endpoint
database/
  init/           Schema + tuning init scripts
  pgbouncer/      PgBouncer config
results/          SQLite results DB + raw k6/RSS output (gitignored)
scripts/          Bench orchestration, hardware detection, CPU pinning
docker/           docker-compose.yml + overrides
docs/             METHODOLOGY, CAVEATS, ARCHITECTURE, DECISION_TEMPLATE
```

## Setup

### Prerequisites

```bash
# Docker Engine (not Docker Desktop)
docker --version

# k6
k6 version

# Python 3.12+ (for parity diff scripts)
python3 --version

# sqlite3
sqlite3 --version
```

### 1. Verify hardware + environment

```bash
bash scripts/detect-hardware.sh
```

Fails fast on non-Linux or cgroup v1. Warns on non-Ubuntu 24.

### 2. Initialize results DB

```bash
bash scripts/init-results-db.sh
```

Creates `results/results.db` with full schema. Safe to re-run (idempotent).

### 3. Generate PostgreSQL config + CPU pin map

```bash
bash scripts/generate-postgres-config.sh
bash scripts/cpu-pin.sh
```

`cpu-pin.sh` writes `.k6-cpuset` and `.service-cpuset` files used by the benchmark driver to pin processes to separate core groups.

### 4. Start infrastructure

```bash
docker compose -f docker/docker-compose.yml -f docker/docker-compose.override.yml \
  up -d postgres pgbouncer
```

Wait for healthchecks to pass (~10s).

### 5. Seed 10M rows

```bash
docker compose -f docker/docker-compose.yml --profile generator \
  run --rm generator
```

Takes ~5–15 minutes depending on hardware.

### 6. Build services

```bash
# Build all three images
docker compose -f docker/docker-compose.yml \
  --profile fastapi --profile fastify --profile axum \
  build
```

## Running benchmarks

### Single-framework quick run

```bash
bash scripts/run-benchmark.sh --frameworks fastapi
bash scripts/run-benchmark.sh --frameworks fastify
bash scripts/run-benchmark.sh --frameworks axum
```

### All frameworks, specific endpoints

```bash
bash scripts/run-benchmark.sh \
  --frameworks fastapi,fastify,axum \
  --endpoints daily-sales,full-summary \
  --concurrency 10,100,1000
```

### Full benchmark (all endpoints, all concurrency levels)

```bash
bash scripts/run-benchmark.sh \
  --frameworks fastapi,fastify,axum \
  --endpoints all \
  --concurrency 10,50,100,500,1000,5000,10000 \
  --duration 60 \
  --warmup 10 \
  --cooldown 15
```

Flags:

| Flag | Default | Description |
|---|---|---|
| `--frameworks` | `fastapi` | Comma-list: `fastapi`, `fastify`, `axum` |
| `--endpoints` | `all` | `all` or comma-list of endpoint names |
| `--concurrency` | `10,50,100,500,1000,5000,10000` | VU levels to sweep |
| `--duration` | `60` | Measure phase seconds |
| `--warmup` | `10` | Warmup phase seconds |
| `--cooldown` | `15` | Cooldown between levels |

Results land in `results/results.db` and `results/raw/`.

### Parity check (verify 3-service numerical equality)

```bash
# Start all three services first
docker compose -f docker/docker-compose.yml \
  --profile fastapi --profile fastify --profile axum \
  up -d

bash scripts/parity-check.sh
```

Compares JSON responses across all 9 endpoints. Monetary tolerance ±0.01, counts exact. Failures block benchmark runs.

### High-concurrency connection test (before 5K/10K runs)

```bash
bash scripts/test-connection-limits.sh
```

Verifies `MAX_CLIENT_CONN=15000`, postgres `max_connections`, and container `ulimit` are correctly set.

## Environment variables

All have working defaults. Override via shell or `.env` file:

| Variable | Default | Description |
|---|---|---|
| `POSTGRES_DB` | `benchmark` | Database name |
| `POSTGRES_USER` | `bench` | DB user |
| `POSTGRES_PASSWORD` | `bench` | DB password |
| `PGBOUNCER_POOL_MODE` | `transaction` | PgBouncer pool mode |
| `PGBOUNCER_DEFAULT_POOL_SIZE` | `100` | Connections per pool |
| `PGBOUNCER_MAX_CLIENT_CONN` | `15000` | Max client connections |
| `FASTAPI_PORT` | `8001` | FastAPI host port |
| `FASTIFY_PORT` | `8002` | Fastify host port |
| `AXUM_PORT` | `8003` | Axum host port |
| `BENCH_ERROR_RATE_THRESHOLD` | `0.05` | Max tolerated error rate (fraction) |

## Available endpoints

All services expose `/benchmark/<endpoint>`:

| Endpoint | Description |
|---|---|
| `daily-sales` | Aggregate sales by day |
| `sales-by-location` | Sales grouped by store location |
| `sales-by-product` | Sales grouped by product |
| `sales-by-payment` | Sales by payment method |
| `hourly-sales` | Hourly distribution |
| `top-products` | Top N products by revenue |
| `location-product-matrix` | Cross-tab location × product |
| `discount-impact` | Discount vs non-discount comparison |
| `full-summary` | All aggregates in one response |

Health check: `GET /health` on each service.

## License

MIT License. See [LICENSE](LICENSE) for full text.

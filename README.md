# retail-analytics-framework-benchmark

Benchmark comparing **FastAPI vs Fastify vs Axum** throughput + memory efficiency on a 10M-row PostgreSQL retail-analytics workload. Output is a **decision memo for stack selection**, not an academic benchmark.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Security](#security)
- [Scripts](#scripts)
- [Author](#author)
- [Acknowledgements](#acknowledgements)
- [License](#license)

---

## Overview

This project measures three web frameworks against an identical analytical workload: 10 million retail transactions with 16.2 million line items in PostgreSQL 16. Each framework runs in Docker with identical pool sizing (100 connections via PgBouncer), CPU pinning, and warm-cache conditions. The dashboard scores frameworks across 6 dimensions (throughput, latency, memory, stability, scaling, developer experience) and exports a decision memo for stack selection.

**Status:** Phase 3d complete. All three services scaffolded + parity-verified. Dashboard with decision memo export operational.

### Disclaimer

1. **Results valid only for the hardware on which the benchmark was run.** Do not extrapolate to other specs.
2. **Results are a snapshot in time.** Do not reproduce 3+ months later without re-running on the same hardware and software versions.
3. **What is measured: full-stack performance.** DB driver, JSON serializer, async runtime, and worker model are all part of the result — not framework-in-isolation.
4. **At high concurrency (5K–10K), throughput is bounded by PgBouncer pool, not framework.** What is being tested: how each framework handles connection wait + event loop saturation.
5. **On VMs with fewer than 4 cores**, k6 shares CPU with the service under test. Results on small VMs are **noisier and not for final decisions**.

### Hardware requirements

| Tier | vCPU | RAM | SSD | Notes |
|---|---|---|---|---|
| **Minimum** | 4 | 8 GB | 20 GB | Noisy results — k6 shares cores |
| **Recommended** | 8 | 16 GB | 50 GB | Clean CPU pinning |
| **Optimal** | 16 | 32 GB | 50 GB | Hit Axum ceiling |

### Environment preconditions

- **Linux only** (cgroup v2 required for CPU pinning + memory limits).
- **Docker Engine** (Docker Desktop on Mac/Windows silently no-ops `cpuset`).
- **Ubuntu 24.04 LTS** validated; other Linux distros: warn-but-proceed.

`scripts/detect-hardware.sh` fails fast if preconditions not met.

---

## Features

- **3 framework services** (FastAPI, Fastify, Axum) with identical 9-endpoint surface
- **10M-row generator** with deterministic allocation (zero drift across distributions)
- **9 benchmark queries** covering aggregations, cross-tabs, and sequential full-summary
- **k6 load testing** with warmup/measure phases, RSS sampling, and error-rate stop gate
- **Parity gate** — numerical equality across all 3 services (monetary ±0.01, counts exact)
- **CPU pinning** — postgres, pgbouncer, k6, and the service each get dedicated cores
- **SvelteKit dashboard** with Chart.js charts, SSE live progress, and neo-brutalist UI
- **Decision framework** — 6-dimension weighted scoring with Pareto analysis
- **Memo export** — downloadable `.md` decision memo with hardware context, scores, rationale
- **Reproducibility checks** — run twice, verify < 10% variance

---

## Tech Stack

| Component | Choice | Version |
|---|---|---|
| Database | PostgreSQL | 16-alpine |
| Connection pool | PgBouncer (edoburu image) | 1.22+ |
| Service 1 | FastAPI + uvicorn + asyncpg | Python 3.12 |
| Service 2 | Fastify + pg | Node.js 22 LTS, Fastify 5.x |
| Service 3 | Axum + sqlx | Rust stable, axum 0.7+, sqlx 0.8+ |
| Load generator | k6 (native install) | latest stable |
| Dashboard | SvelteKit + Tailwind + Chart.js (native install) | SvelteKit 2.x |
| Results storage | SQLite | bundled |
| Host OS | Ubuntu 24.04 LTS | required |

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Host (Ubuntu 24.04)                    │
│                                                          │
│  CPU pinning:                                            │
│  ┌──────────┬──────────┬──────┬────────────────────┐     │
│  │postgres  │pgbouncer │  k6  │ service (one at a   │     │
│  │cores 0-1 │ core 2   │core 3│ time) cores 4-7+    │     │
│  └──────────┴──────────┴──────┴────────────────────┘     │
│                                                          │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐            │
│  │ FastAPI  │   │ Fastify  │   │   Axum   │            │
│  │ :8001    │   │ :8002    │   │ :8003    │            │
│  │ 4×25 pool│   │ 4×25 pool│   │ 100 pool │            │
│  └────┬─────┘   └────┬─────┘   └────┬─────┘            │
│       └──────────────┼──────────────┘                   │
│                      ▼                                   │
│              ┌──────────────┐                            │
│              │  PgBouncer   │                            │
│              │  :6432       │                            │
│              │  pool=100    │                            │
│              └──────┬───────┘                            │
│              ┌──────▼───────┐                            │
│              │  PostgreSQL  │                            │
│              │  10M rows    │                            │
│              └──────────────┘                            │
│                                                          │
│  Dashboard (native, NOT in Docker)                       │
│  SvelteKit → results.db → charts + decision memo        │
└──────────────────────────────────────────────────────────┘
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full topology, data flow, and configuration details.

---

## Project Structure

```
generator/            Python data generator (psycopg3 + COPY, 10M rows)
services/
  shared/             Shared SQL queries
  fastapi-app/        FastAPI service (Python)
  fastify-app/        Fastify service (Node.js)
  axum-app/           Axum service (Rust)
dashboard/            SvelteKit dashboard (native, not in docker-compose)
  src/lib/components/ BrutHeader, BrutStat, BrutButton
  src/lib/charts/     Chart.js palette + defaults
  src/lib/styles/     Neo-brutalism CSS
load-tests/           k6 scripts (one per endpoint + shared options)
database/
  init/               Schema + indexes
  pgbouncer/          PgBouncer config
results/              SQLite results DB + raw k6/RSS output (gitignored)
scripts/              Bench orchestration, hardware detection, CPU pinning
docker/               docker-compose.yml + overrides
docs/                 METHODOLOGY, CAVEATS, ARCHITECTURE, RUNBOOK, more
```

---

## Getting Started

### Prerequisites

```bash
docker --version       # Docker Engine 24+ (not Docker Desktop)
k6 version             # k6 native install
python3 --version      # 3.12+
sqlite3 --version      # any recent
```

### 1. Clone + configure

```bash
git clone <repo-url>
cd retail-analytics-framework-benchmark
cp .env.example .env
```

### 2. Detect hardware

```bash
bash scripts/detect-hardware.sh
```

Fails fast on non-Linux or cgroup v1. Prints `hardware_id=N`.

### 3. Generate configs

```bash
bash scripts/generate-postgres-config.sh
bash scripts/cpu-pin.sh
```

### 4. Start infrastructure

```bash
docker compose -f docker/docker-compose.yml -f docker/docker-compose.override.yml \
  up -d postgres pgbouncer
```

Wait for healthchecks (~10s).

### 5. Seed 10M rows

```bash
docker compose -f docker/docker-compose.yml --profile generator run --rm generator
```

Takes 5–15 minutes depending on hardware.

### 6. Build services

```bash
bash services/fastapi-app/prebuild.sh
bash services/fastify-app/prebuild.sh
bash services/axum-app/prebuild.sh

docker compose -f docker/docker-compose.yml \
  --profile fastapi --profile fastify --profile axum build
```

### 7. Run a benchmark

```bash
# Quick smoke
bash scripts/run-benchmark.sh --frameworks fastapi --endpoints daily-sales --concurrency 10

# Full sweep
bash scripts/run-benchmark.sh \
  --frameworks fastapi,fastify,axum \
  --endpoints all \
  --concurrency 10,50,100,500,1000
```

### 8. Dashboard

```bash
cd dashboard && npm install && npm run build && cd ..
PORT=3000 node dashboard/build/index.js
```

Open **http://localhost:3000**.

### 9. Export decision memo

Dashboard → `/decision` → select run + concurrency → click **Export Memo**.

### Flags

| Flag | Default | Description |
|---|---|---|
| `--frameworks` | `fastapi` | Comma-list: `fastapi`, `fastify`, `axum` |
| `--endpoints` | `all` | `all` or comma-list of endpoint names |
| `--concurrency` | `10,50,100,500,1000,5000,10000` | VU levels to sweep |
| `--duration` | `60` | Measure phase seconds |
| `--warmup` | `10` | Warmup phase seconds |
| `--cooldown` | `15` | Cooldown between levels |

### Environment variables

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

---

## Security

- **Dashboard binds to localhost only** — no remote access by default.
- **No authentication** — this is an internal benchmarking tool, not production software.
- **Dashboard runs natively** (not in Docker) and spawns `scripts/run-benchmark.sh` via `child_process`. It inherits the host user's permissions including Docker group membership.
- **No secrets in repo** — `.env` is gitignored; `.env.example` contains only non-sensitive defaults.
- **PgBouncer auth** uses `scram-sha-256` — no plaintext passwords on the wire.

---

## Scripts

| Script | Purpose |
|---|---|
| `detect-hardware.sh` | Detect CPU/RAM/kernel, insert into `hardware_runs`, fail-fast on bad env |
| `init-results-db.sh` | Create `results/results.db` with full schema (idempotent) |
| `generate-postgres-config.sh` | Write `database/postgresql.conf` scaled to host RAM |
| `cpu-pin.sh` | Write `docker-compose.override.yml` with cpuset assignments |
| `run-benchmark.sh` | Full benchmark driver — frameworks × endpoints × concurrency sweep |
| `parity-check.sh` | Diff all 9 endpoints across services (monetary ±0.01, counts exact) |
| `test-connection-limits.sh` | Verify PgBouncer/postgres/ulimit limits before high-concurrency runs |
| `sample-rss.sh` | 1 Hz cgroup v2 RSS + CPU sampler (runs during benchmarks) |
| `check-reproducibility.sh` | Run twice, check RPS variance < 10% |
| `migrate-results-db-v3c.sh` | Add `manual_scores` table (idempotent) |

---

## Author

**thebennies** — [GitHub](https://github.com/thebennies)

---

## Acknowledgements

- [k6](https://k6.io/) — load testing
- [PgBouncer](https://www.pgbouncer.org/) — connection pooling
- [Chart.js](https://www.chart.js.org/) — dashboard charts
- [SvelteKit](https://kit.svelte.dev/) — dashboard framework
- [JetBrains Mono](https://www.jetbrains.com/lp/mono/) — monospace font
- [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk) — display font

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## Documentation

- [docs/RUNBOOK.md](docs/RUNBOOK.md) — operational checklist for reproducing on new hardware
- [docs/RESULTS.md](docs/RESULTS.md) — benchmark snapshot template
- [docs/CHANGELOG.md](docs/CHANGELOG.md) — phase-by-phase timeline
- [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) — how to add a new framework
- [docs/METHODOLOGY.md](docs/METHODOLOGY.md) — measurement methodology
- [docs/CAVEATS.md](docs/CAVEATS.md) — known limitations (C-001..C-016)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system topology
- [docs/DECISION_TEMPLATE.md](docs/DECISION_TEMPLATE.md) — decision memo template

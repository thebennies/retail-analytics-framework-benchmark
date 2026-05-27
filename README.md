# retail-analytics-framework-benchmark

Internal Revota benchmark comparing **FastAPI vs Fastify vs Axum** throughput + memory efficiency on a 10M-row PostgreSQL retail-analytics workload. Output is a **decision memo for stack selection**, not an academic benchmark.

## Status

🚧 In active development. See `.local/plans/00-roadmap.md` (gitignored) for phase progress.

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

`scripts/detect-hardware.sh` (added in Phase 1a) fails fast if preconditions not met.

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

## Usage

Full setup + run instructions land in Phase 1b. For current phase progress see `.local/plans/00-roadmap.md`.

## License

Internal Revota. Not for redistribution.

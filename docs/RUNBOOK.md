# Runbook — Operational Checklist

Step-by-step guide to reproduce benchmarks on new hardware. Read this alongside [METHODOLOGY.md](METHODOLOGY.md) for the "why" and [CAVEATS.md](CAVEATS.md) for known limitations.

## 1. Prerequisites

```bash
# Verify Docker Engine (not Docker Desktop)
docker --version        # need 24+
docker compose version  # need v2+

# Install k6
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491329CB4A9
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Verify
k6 version
python3 --version  # 3.12+
sqlite3 --version
```

## 2. Clone + configure

```bash
git clone <repo-url>
cd retail-analytics-framework-benchmark
cp .env.example .env
```

## 3. Detect hardware

```bash
bash scripts/detect-hardware.sh
```

**Output:** inserts row into `results/results.db` → `hardware_runs` table. Prints `hardware_id=N`.

**Fails fast if:** non-Linux, no cgroup v2, Docker Desktop detected.

## 4. Generate PostgreSQL config

```bash
bash scripts/generate-postgres-config.sh
```

**Output:** writes `database/postgresql.conf` (gitignored). `shared_buffers` ≈ 25% of host RAM. `work_mem` scaled to 64MB for large analytical queries.

## 5. CPU pin map

```bash
bash scripts/cpu-pin.sh
```

**Output:** writes `docker/docker-compose.override.yml` (gitignored) with cpuset assignments: postgres → cores 0-1, pgbouncer → core 2, k6 → core 3, service → cores 4-7+.

## 6. Initialize results DB

```bash
bash scripts/init-results-db.sh
```

**Output:** creates `results/results.db` with tables: `hardware_runs`, `benchmark_runs`, `benchmark_results`. Idempotent.

## 7. Start infrastructure

```bash
docker compose -f docker/docker-compose.yml -f docker/docker-compose.override.yml \
  up -d postgres pgbouncer
```

Wait ~10s for healthchecks. Verify:

```bash
docker compose -f docker/docker-compose.yml exec postgres pg_isready -U bench
```

## 8. Seed data (10M rows)

```bash
docker compose -f docker/docker-compose.yml --profile generator run --rm generator
```

**Takes:** 5–15 minutes depending on hardware. Generator connects directly to postgres:5432 (bypasses PgBouncer for COPY performance).

**Verify:**

```bash
docker compose -f docker/docker-compose.yml exec -T postgres psql -U bench -d benchmark \
  -c "SELECT COUNT(*) FROM transactions;"
# Expected: 10000000
```

## 9. Connection limits check (before c≥5000)

```bash
bash scripts/test-connection-limits.sh
```

Verifies PgBouncer `MAX_CLIENT_CONN=15000`, postgres `max_connections`, and container `ulimit -n`.

## 10. Build service images

```bash
# Prebuild shared queries
bash services/fastapi-app/prebuild.sh
bash services/fastify-app/prebuild.sh
bash services/axum-app/prebuild.sh

# Build all
docker compose -f docker/docker-compose.yml \
  --profile fastapi --profile fastify --profile axum build
```

## 11. Parity check

```bash
bash scripts/parity-check.sh
```

**What it does:** starts each service one at a time, captures all 9 endpoints, diffs JSON. Tolerance: monetary ±0.01, counts exact.

**Expected:** `OK 9/9 endpoints parity (fastapi vs fastify vs axum)`

If fails → fix the reported endpoint before benchmarking.

## 12. Run benchmark

### Quick smoke (1 framework, 1 endpoint, c=10)

```bash
bash scripts/run-benchmark.sh --frameworks fastapi --endpoints daily-sales --concurrency 10
```

### Full sweep

```bash
bash scripts/run-benchmark.sh \
  --frameworks fastapi,fastify,axum \
  --endpoints all \
  --concurrency 10,50,100,500,1000
```

**Output per combo:** row in `benchmark_results` + raw files in `results/raw/`.

**Error rate gate:** stops sweep if error_rate > 5% at current concurrency. Override: `BENCH_ERROR_RATE_THRESHOLD=0.50 bash scripts/run-benchmark.sh ...`

## 13. Dashboard

```bash
cd dashboard && npm install && npm run build && cd ..
PORT=3000 node dashboard/build/index.js
```

Browse `http://localhost:3000`. Pages: Runs, Compare (charts), Decision (scoring + export), Run (trigger), Hardware.

## 14. Decision memo export

1. Open `http://localhost:3000/decision`
2. Select run + concurrency
3. Optionally set dev experience scores (1-5)
4. Click "Export Memo" → downloads `.md` file

## 15. Reproducibility check

```bash
bash scripts/check-reproducibility.sh
```

Runs the same benchmark twice and checks RPS variance < 10%.

## 16. Tear down

```bash
docker compose -f docker/docker-compose.yml down
```

Stops all containers. Data persists in `database/pgdata/` and `results/`.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `cpuset` no-op | Docker Desktop on Mac/WSL | Use Docker Engine on Linux |
| PgBouncer auth fails | `AUTH_TYPE` mismatch | Keep `scram-sha-256` (default) |
| `work_mem` OOM on location-product-matrix | 16MB too small | Re-run `generate-postgres-config.sh` (now defaults 64MB) |
| k6 `--out json` error | k6 v1.6+ removed JSON output | Use `--summary-export` only |
| Fastify 100% error | Missing INT type parsers | Check `server.js` has `types.setTypeParser(20, ...)` |
| Axum 500 on large queries | sqlx prepared stmt cache vs PgBouncer | Uses `sqlx::query()` (text protocol) — should not happen |

## Script output locations

| Script | Output |
|---|---|
| `detect-hardware.sh` | Row in `hardware_runs` |
| `cpu-pin.sh` | `docker/docker-compose.override.yml` + `.k6-cpuset` |
| `generate-postgres-config.sh` | `database/postgresql.conf` |
| `init-results-db.sh` | `results/results.db` |
| `run-benchmark.sh` | Rows in `benchmark_results` + `results/raw/k6-*` + `results/raw/rss-*` |
| `parity-check.sh` | `results/raw/parity-*.json` |

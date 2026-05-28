# Changelog

All notable changes to the retail-analytics-framework-benchmark project.

Format: phase-grouped, [Keep a Changelog](https://keepachangelog.com/) flavor.

## Phase 0 — Repo Scaffold

- `🎉 init` initial commit
- `🔧 chore` project directory structure, .env.example
- `📝 docs` README with disclaimer + stack + layout, CAVEATS.md seeded (C-001..C-008)

## Phase 1a — Walking Skeleton

- `🗃️ database` minimal schema + 100 dummy transactions
- `✨ feat(fastapi)` Dockerfile + deps + /health + /benchmark/daily-sales
- `✨ feat(infra)` docker-compose with postgres + pgbouncer + fastapi
- `✨ feat(load-tests)` k6 daily-sales script with warmup + measure scenarios
- `✨ feat(scripts)` run-benchmark.sh (fastapi + daily-sales + c=10), init-results-db.sh
- `🐛 fix` pgbouncer healthcheck (busybox `kill -0 1`), AUTH_TYPE `scram-sha-256`
- `🐛 fix` k6 v1.6 summary parser (values top-level, not `.values`)

## Phase 1b — Full FastAPI Stack

- `🗃️ database` 5-table schema + 7 indexes, 10M-row generator (deterministic, COPY-binary)
- `✨ feat(fastapi)` 4 uvicorn workers, per-worker asyncpg pool, 8 endpoints + sequential full-summary
- `✨ feat(load-tests)` k6 scripts for 8 remaining endpoints + shared options module
- `✨ feat(scripts)` detect-hardware.sh, cpu-pin.sh, generate-postgres-config.sh, sample-rss.sh, test-connection-limits.sh, check-reproducibility.sh
- `✨ feat(scripts)` run-benchmark.sh rewritten: parameterized sweep, RSS bracketing, error-rate stop gate
- `📝 docs` METHODOLOGY.md
- `🐛 fix` psycopg two-pass COPY (simultaneous not supported), cpu-pin only emits existing services

## Phase 2a — Axum Service

- `✨ feat(axum)` full Rust service: axum 0.7 + sqlx 0.8 + tokio multi-thread, 9 endpoints, Docker multi-stage build
- `✨ feat(scripts)` parity-check.sh (fastapi vs axum) + parity_diff.py (type-aware JSON diff)
- `📝 docs` CAVEATS C-009..C-012 (BigDecimal precision, PgBouncer stmt cache, tokio pin, work_mem)
- `🐛 fix` Rust char literal (`'--'` → `"--"`), sqlx 0.8 API (`statement_cache_capacity` removed), full-summary dict shape

## Phase 2b — Fastify Service + 3-Service Suite

- `✨ feat(fastify)` Node.js 22 + Fastify 5 + node-postgres, 4-worker cluster, 9 endpoints
- `✨ feat(scripts)` parity-check.sh extended to 3-way diff (fastapi vs fastify vs axum)
- `📝 docs` ARCHITECTURE.md, CAVEATS C-013..C-016 (cluster round-robin, INT8/NUMERIC parsers, V8 RSS)
- `🐛 fix` INT2/INT4/INT8 type parsers for integer parity

## Phase 3a — Dashboard Read-Only

- `✨ feat(dashboard)` SvelteKit 2 + adapter-node + TailwindCSS + Chart.js
- Pages: home (run list), run detail, compare (RPS/p99/RSS charts), hardware
- API: /api/runs, /api/runs/[id]/results, /api/compare
- better-sqlite3 read-only connection

## Phase 3b — Dashboard Orchestration

- `✨ feat(dashboard)` run trigger: POST /api/runs spawns run-benchmark.sh
- `✨ feat(scripts)` run-benchmark.sh emits ::progress/::run_started/::run_finished markers, accepts --run-id
- Live status page with 2s polling, PID-based lock file with stale detection

## Phase 3c — Decision Framework

- `✨ feat(dashboard)` 6-dimension weighted scoring (RPS/p99/RSS/stability/scaling/DX)
- Decision page with scored table + framework recommendation
- Export decision memo as .md, DECISION_TEMPLATE.md, manual_scores migration
- `✅ test` 7 unit tests via vitest

## Phase 3d — Neo-Brutalism Polish

- `🎨 feat(dashboard)` brutalist palette (ink/bone/acid/zap), JetBrains Mono + Space Grotesk
- Sidebar nav, .brut-card/btn/table utility classes, BrutHeader/BrutStat/BrutButton components
- Compare: p50/p95/p99 triple chart. Decision: Pareto-front bubble scatter
- Memory detail page: RSS bar chart by concurrency
- SSE endpoint with EventSource + polling fallback

## Phase 4 — Docs Review

- `📝 docs` RUNBOOK.md, RESULTS.md, CHANGELOG.md, CONTRIBUTING.md
- `📝 docs` README audit, CAVEATS consolidation, cross-reference fixes

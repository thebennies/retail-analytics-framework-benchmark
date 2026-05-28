# Contributing

## Project structure

```
services/<framework>-app/   one dir per framework
services/shared/             shared SQL queries
load-tests/                  k6 scripts (one per endpoint)
scripts/                     orchestration + hardware scripts
dashboard/                   SvelteKit dashboard
database/                    schema + init scripts
docs/                        methodology, caveats, architecture, runbook
```

## Adding a new framework

1. Create `services/<framework>-app/` with:
   - `Dockerfile` (multi-stage build, EXPOSE unique port)
   - `prebuild.sh` (copies `services/shared/queries.sql` into place)
   - Query loader matching FastAPI/Axum/Fastify parse semantics
   - 9 endpoints: 8 single-query + sequential full-summary
   - `/health` returning `{ framework, db_pool_size, db_pool_min }`
2. Add service to `docker/docker-compose.yml` with its own profile
3. Update `scripts/cpu-pin.sh` to include the new service
4. Update `scripts/parity-check.sh` framework list
5. Add type parser overrides as needed (see CAVEATS C-009..C-016 for examples)
6. Run `bash scripts/parity-check.sh` — must pass 9/9
7. Run benchmark sweep: `bash scripts/run-benchmark.sh --frameworks <new>,fastapi --endpoints all --concurrency 10`

## Response schema contract

Every endpoint returns:

```json
{
  "framework": "<string>",
  "task": "<endpoint-name>",
  "execution_time_ms": "<float, 3 decimals>",
  "query_time_ms": "<float, 3 decimals>",
  "rows_returned": "<int>",
  "result": "<array of row objects | dict of sub-tasks for full-summary>",
  "timestamp": "<ISO 8601 UTC>",
  "request_id": "<UUID>"
}
```

`full-summary` returns `result` as a **dict** keyed by sub-task name, `rows_returned: 1`.

## Pool sizing

Per-worker pool × worker count must equal PgBouncer `default_pool_size` (100).

| Framework | Workers | Pool/worker | Total |
|---|---|---|---|
| FastAPI | 4 uvicorn | 25 | 100 |
| Fastify | 4 cluster | 25 | 100 |
| Axum | 1 (4 tokio threads) | 100 | 100 |

## Commit conventions

- Gitmoji prefix: `✨ feat`, `🐛 fix`, `📝 docs`, `🔧 chore`, `✅ test`, `🎨 style`, `🗃️ database`
- Atomic scope: one service's change = one commit
- Push after each batch of related commits

## Running tests

```bash
# Unit tests (scoring library)
cd dashboard && npm run test:unit

# Parity gate
bash scripts/parity-check.sh

# Reproducibility (same run twice, variance < 10%)
bash scripts/check-reproducibility.sh
```

## Key docs

- [METHODOLOGY.md](METHODOLOGY.md) — how we measure
- [CAVEATS.md](CAVEATS.md) — known limitations (C-001..C-016)
- [ARCHITECTURE.md](ARCHITECTURE.md) — system topology
- [RUNBOOK.md](RUNBOOK.md) — operational checklist

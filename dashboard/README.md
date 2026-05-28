# Bench Dashboard

Read-only SvelteKit dashboard for benchmark results stored in `results/results.db`.

## Quick start

```bash
# Install (one-time)
cd dashboard
npm install

# Build
npm run build

# Start from the REPO ROOT so DB path resolves correctly
cd ..
PORT=3000 node dashboard/build/index.js
```

Open http://localhost:3000

## Pages

| Path | Description |
|---|---|
| `/` | List all benchmark runs |
| `/runs/[id]` | Results table for a single run |
| `/compare` | Chart.js line charts (RPS, p99, RSS) — use `?endpoint=daily-sales&frameworks=fastapi,fastify,axum` |
| `/hardware` | Hardware profiles used for benchmarking |

## API endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/runs` | JSON list of all runs |
| GET | `/api/runs/[id]/results` | JSON results for a run |
| GET | `/api/compare?endpoint=X&frameworks=A,B` | JSON compare data |

## Configuration

| Env var | Default | Description |
|---|---|---|
| `DB_PATH` | `../results/results.db` (from CWD) | Path to SQLite results database |
| `PORT` | `3000` | HTTP listen port |

## Development

```bash
cd dashboard
npm install
npm run dev    # hot-reloading dev server on :5173
```

#!/usr/bin/env bash
# Phase 1b — verify connection limits before scaling to c=5000/10000.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE="docker compose -f ${REPO_ROOT}/docker/docker-compose.yml -f ${REPO_ROOT}/docker/docker-compose.override.yml"

fail() { echo "FAIL: $*" >&2; exit 1; }

# 1) ulimit -n inside pgbouncer container.
PGB_NOFILE=$(${COMPOSE} exec -T pgbouncer sh -c 'ulimit -n' 2>/dev/null | tr -d '[:space:]')
echo "[limits] pgbouncer container ulimit -n = ${PGB_NOFILE:-unknown}"
if [ "${PGB_NOFILE:-0}" -lt 65535 ]; then
  echo "WARN: pgbouncer ulimit -n (${PGB_NOFILE:-unknown}) < 65535"
fi

# 2) Postgres max_connections.
PG_MAX=$(${COMPOSE} exec -T postgres psql -U bench -d benchmark -tA -c "SHOW max_connections;" 2>/dev/null | tr -d '[:space:]')
echo "[limits] postgres max_connections = ${PG_MAX:-unknown}"
if [ "${PG_MAX:-0}" -lt 500 ]; then
  echo "WARN: postgres max_connections (${PG_MAX:-unknown}) < 500"
fi

echo "[limits] checks complete"

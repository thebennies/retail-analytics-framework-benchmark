#!/usr/bin/env bash
# Phase 2b parity gate: diff fastapi vs fastify vs axum for every /benchmark/* endpoint.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${REPO_ROOT}/docker/docker-compose.yml"
RAW_DIR="${REPO_ROOT}/results/raw"
mkdir -p "${RAW_DIR}"

ENDPOINTS=(
  "daily-sales"
  "sales-by-location"
  "sales-by-product"
  "sales-by-payment"
  "hourly-sales"
  "top-products"
  "location-product-matrix"
  "discount-impact"
  "full-summary"
)

# framework -> port
declare -A FW_PORTS=( [fastapi]=8001 [fastify]=8002 [axum]=8003 )
FRAMEWORKS=( fastapi fastify axum )

log() { printf '[parity] %s\n' "$*" >&2; }

wait_health() {
  local url="$1" max="${2:-60}"
  for i in $(seq 1 "$max"); do
    if curl -fsS "$url" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  return 1
}

capture_endpoints() {
  local framework="$1" port="$2"
  for ep in "${ENDPOINTS[@]}"; do
    local out="${RAW_DIR}/parity-${framework}-${ep}.json"
    log "GET ${framework} /benchmark/${ep}"
    curl -fsS "http://localhost:${port}/benchmark/${ep}" -o "${out}"
    python3 -c "import json,sys; json.load(open(sys.argv[1]))" "${out}"
  done
}

log "ensure postgres + pgbouncer running"
docker compose -f "${COMPOSE_FILE}" up -d postgres pgbouncer

log "pg_prewarm transactions + transaction_items"
docker compose -f "${COMPOSE_FILE}" exec -T postgres psql -U bench -d benchmark -c \
  "SELECT pg_prewarm('transactions'); SELECT pg_prewarm('transaction_items');" >/dev/null 2>&1

# Stop any running services
for fw in "${FRAMEWORKS[@]}"; do
  docker compose -f "${COMPOSE_FILE}" --profile "${fw}" stop "${fw}" >/dev/null 2>&1 || true
done

# ---- Capture each framework ----
for fw in "${FRAMEWORKS[@]}"; do
  port="${FW_PORTS[$fw]}"
  "${REPO_ROOT}/services/${fw}-app/prebuild.sh" 2>/dev/null || true
  log "start ${fw}"
  docker compose -f "${COMPOSE_FILE}" --profile "${fw}" up -d --build "${fw}"
  wait_health "http://localhost:${port}/health" 60 || { log "FATAL: ${fw} /health timeout"; exit 1; }
  capture_endpoints "${fw}" "${port}"
  docker compose -f "${COMPOSE_FILE}" --profile "${fw}" stop "${fw}"
done

# ---- Diff: baseline=fastapi vs each candidate ----
PASS=0
FAIL=0
FAILED=()
for ep in "${ENDPOINTS[@]}"; do
  ok=true
  for fw in fastify axum; do
    if ! python3 "${SCRIPT_DIR}/parity_diff.py" \
        --endpoint "${ep}" \
        --baseline "${RAW_DIR}/parity-fastapi-${ep}.json" \
        --candidate "${RAW_DIR}/parity-${fw}-${ep}.json"; then
      ok=false
    fi
  done
  if $ok; then
    PASS=$((PASS+1))
  else
    FAIL=$((FAIL+1))
    FAILED+=("${ep}")
  fi
done

echo
if [ "${FAIL}" -eq 0 ]; then
  echo "OK ${PASS}/9 endpoints parity (fastapi vs fastify vs axum)"
  exit 0
else
  echo "FAIL ${PASS}/9 endpoints parity. Failed: ${FAILED[*]}"
  exit 1
fi

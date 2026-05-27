#!/usr/bin/env bash
# Phase 2a parity gate: diff axum vs fastapi for every /benchmark/* endpoint.
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
  "SELECT pg_prewarm('transactions'); SELECT pg_prewarm('transaction_items');" >/dev/null 2>&1 || true

# Stop any running services
docker compose -f "${COMPOSE_FILE}" --profile fastapi stop fastapi >/dev/null 2>&1 || true
docker compose -f "${COMPOSE_FILE}" --profile axum stop axum >/dev/null 2>&1 || true

# ---- FastAPI ----
"${REPO_ROOT}/services/fastapi-app/prebuild.sh"
log "start fastapi"
docker compose -f "${COMPOSE_FILE}" --profile fastapi up -d --build fastapi
wait_health "http://localhost:8001/health" 60 || { log "FATAL: fastapi /health timeout"; exit 1; }
capture_endpoints "fastapi" 8001
docker compose -f "${COMPOSE_FILE}" --profile fastapi stop fastapi

# ---- Axum ----
"${REPO_ROOT}/services/axum-app/prebuild.sh"
log "start axum"
docker compose -f "${COMPOSE_FILE}" --profile axum up -d --build axum
wait_health "http://localhost:8003/health" 60 || { log "FATAL: axum /health timeout"; exit 1; }
capture_endpoints "axum" 8003
docker compose -f "${COMPOSE_FILE}" --profile axum stop axum

# ---- Diff ----
PASS=0
FAIL=0
FAILED=()
for ep in "${ENDPOINTS[@]}"; do
  if python3 "${SCRIPT_DIR}/parity_diff.py" \
      --endpoint "${ep}" \
      --baseline "${RAW_DIR}/parity-fastapi-${ep}.json" \
      --candidate "${RAW_DIR}/parity-axum-${ep}.json"; then
    PASS=$((PASS+1))
  else
    FAIL=$((FAIL+1))
    FAILED+=("${ep}")
  fi
done

echo
if [ "${FAIL}" -eq 0 ]; then
  echo "OK ${PASS}/9 endpoints parity"
  exit 0
else
  echo "FAIL ${PASS}/9 endpoints parity. Failed: ${FAILED[*]}"
  exit 1
fi

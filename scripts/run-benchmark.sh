#!/usr/bin/env bash
# Phase 1a walking skeleton: hardcoded fastapi + daily-sales + c=10. No flags.
# Phase 1b replaces with full --frameworks/--endpoints/--concurrency parameterization.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${REPO_ROOT}/docker/docker-compose.yml"
DB_PATH="${REPO_ROOT}/results/results.db"
RAW_DIR="${REPO_ROOT}/results/raw"

FRAMEWORK="fastapi"
ENDPOINT="daily-sales"
CONCURRENCY=10
DURATION_S=60
WARMUP_S=10

mkdir -p "${RAW_DIR}"

[ -f "${DB_PATH}" ] || "${SCRIPT_DIR}/init-results-db.sh"

echo "[run] prebuild shared queries"
"${REPO_ROOT}/services/fastapi-app/prebuild.sh"

echo "[run] start ${FRAMEWORK} stack"
docker compose -f "${COMPOSE_FILE}" up -d postgres pgbouncer
docker compose -f "${COMPOSE_FILE}" --profile "${FRAMEWORK}" up -d --build "${FRAMEWORK}"

echo "[run] wait for /health"
for i in $(seq 1 30); do
  if curl -fsS "http://localhost:8001/health" >/dev/null 2>&1; then
    echo "[run] healthy after ${i}s"
    break
  fi
  sleep 1
  if [ "${i}" -eq 30 ]; then
    echo "FATAL: ${FRAMEWORK} /health never healthy"
    docker compose -f "${COMPOSE_FILE}" logs "${FRAMEWORK}" | tail -50
    exit 1
  fi
done

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
K6_OUT="${RAW_DIR}/k6-${FRAMEWORK}-${ENDPOINT}-c${CONCURRENCY}-${STAMP}.json"
K6_SUMMARY="${RAW_DIR}/k6-${FRAMEWORK}-${ENDPOINT}-c${CONCURRENCY}-${STAMP}-summary.json"

echo "[run] k6 daily-sales c=${CONCURRENCY} duration=${DURATION_S}s warmup=${WARMUP_S}s"
TARGET_URL="http://localhost:8001" VUS="${CONCURRENCY}" DURATION="${DURATION_S}s" WARMUP="${WARMUP_S}s" \
  k6 run \
    --summary-export "${K6_SUMMARY}" \
    --out "json=${K6_OUT}" \
    "${REPO_ROOT}/load-tests/${ENDPOINT}.js"

echo "[run] parse k6 summary"
# Use python to extract measure-phase metrics from k6 summary JSON.
python3 - "$K6_SUMMARY" "$DB_PATH" "$FRAMEWORK" "$ENDPOINT" "$CONCURRENCY" "$DURATION_S" "$K6_OUT" <<'PY'
import json, sqlite3, sys
summary_path, db_path, framework, endpoint, concurrency, duration_s, k6_raw_path = sys.argv[1:]

with open(summary_path) as f:
    s = json.load(f)

metrics = s.get("metrics", {})

http_reqs = metrics.get("http_reqs", {})
http_req_duration = metrics.get("http_req_duration", {})
http_req_failed = metrics.get("http_req_failed", {})

# k6 summary-export puts values directly on metric (no "values" nesting).
# http_req_failed uses "value" (0.0-1.0 fraction), not "rate".
rps = http_reqs.get("rate", 0.0)
total_requests = int(http_reqs.get("count", 0))
fail_fraction = http_req_failed.get("value", 0.0)
total_errors = int(round(fail_fraction * total_requests))
error_rate_pct = round(fail_fraction * 100, 4)
p50 = http_req_duration.get("med", None)
p95 = http_req_duration.get("p(95)", None)
p99 = http_req_duration.get("p(99)", None)

conn = sqlite3.connect(db_path)
cur = conn.cursor()
cur.execute(
    """
    INSERT INTO benchmark_results
      (framework, endpoint, concurrency, duration_seconds,
       rps_sustained, p50_ms, p95_ms, p99_ms,
       error_rate_pct, total_requests, total_errors, k6_raw_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """,
    (
        framework, endpoint, int(concurrency), int(duration_s),
        rps, p50, p95, p99,
        error_rate_pct, total_requests, total_errors, k6_raw_path,
    ),
)
conn.commit()
inserted_id = cur.lastrowid
conn.close()

print(f"[parse] inserted benchmark_results id={inserted_id} rps={rps:.2f} p99={p99}")
PY

echo "[run] stop ${FRAMEWORK}"
docker compose -f "${COMPOSE_FILE}" --profile "${FRAMEWORK}" stop "${FRAMEWORK}"

echo "[run] done"
sqlite3 "${DB_PATH}" "SELECT id, framework, endpoint, concurrency, ROUND(rps_sustained,2), p99_ms, error_rate_pct FROM benchmark_results ORDER BY id DESC LIMIT 3;"

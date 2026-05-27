#!/usr/bin/env bash
# Phase 1b — reproducibility gate. Same benchmark twice, RPS variance < 10%.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DB_PATH="${REPO_ROOT}/results/results.db"
CAVEATS="${REPO_ROOT}/docs/CAVEATS.md"

ENDPOINT="${1:-daily-sales}"
CONCURRENCY="${2:-1000}"

echo "[repro] run #1"
"${SCRIPT_DIR}/run-benchmark.sh" --frameworks fastapi --endpoints "${ENDPOINT}" --concurrency "${CONCURRENCY}"
RUN_1=$(sqlite3 "${DB_PATH}" "SELECT MAX(id) FROM benchmark_runs;")

echo "[repro] cooldown 30s"
sleep 30

echo "[repro] run #2"
"${SCRIPT_DIR}/run-benchmark.sh" --frameworks fastapi --endpoints "${ENDPOINT}" --concurrency "${CONCURRENCY}"
RUN_2=$(sqlite3 "${DB_PATH}" "SELECT MAX(id) FROM benchmark_runs;")

RPS_1=$(sqlite3 "${DB_PATH}" "SELECT rps_sustained FROM benchmark_results WHERE run_id=${RUN_1} AND endpoint='${ENDPOINT}' AND concurrency=${CONCURRENCY};")
RPS_2=$(sqlite3 "${DB_PATH}" "SELECT rps_sustained FROM benchmark_results WHERE run_id=${RUN_2} AND endpoint='${ENDPOINT}' AND concurrency=${CONCURRENCY};")

echo "[repro] RPS run1=${RPS_1}, run2=${RPS_2}"
VAR_PCT=$(python3 -c "a=${RPS_1}; b=${RPS_2}; m=(a+b)/2.0; print(round(abs(a-b)/m*100, 3))")
echo "[repro] variance = ${VAR_PCT}%"

PASS=$(python3 -c "print(1 if ${VAR_PCT} < 10.0 else 0)")
if [ "${PASS}" = "1" ]; then
  echo "[repro] PASS (< 10%)"
  exit 0
fi

echo "[repro] FAIL — variance ${VAR_PCT}% ≥ 10%" >&2
cat >> "${CAVEATS}" <<EOF

## C-REPRO ($(date -u +%Y-%m-%dT%H:%M:%SZ))
- Reproducibility gate FAILED at endpoint=${ENDPOINT}, concurrency=${CONCURRENCY}.
- run1 RPS=${RPS_1}, run2 RPS=${RPS_2}, variance=${VAR_PCT}%.
EOF
exit 1

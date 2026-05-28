#!/usr/bin/env bash
# Phase 1b — full benchmark driver.
#   --frameworks  fastapi
#   --endpoints   all | comma-list
#   --concurrency comma-list
#   --duration    measure duration seconds (default 60)
#   --warmup      warmup duration seconds (default 10)
#   --cooldown    cooldown seconds between levels (default 15)
set -euo pipefail

# --- Phase 3b: progress markers ---
PROGRESS_LAST=""
iso_now() { date -u +'%Y-%m-%dT%H:%M:%S.%3NZ'; }
emit_progress() {
  local fw="$1" ep="$2" cc="$3" phase="$4"
  local line="::progress framework=${fw} endpoint=${ep} concurrency=${cc} phase=${phase} at=$(iso_now)"
  if [ "${line}" != "${PROGRESS_LAST}" ]; then
    echo "${line}"
    PROGRESS_LAST="${line}"
  fi
}
emit_run_finished() {
  local code="$1"
  local status="ok"
  [ "${code}" -ne 0 ] && status="fail"
  echo "::run_finished run_id=${RUN_ID:-0} status=${status} at=$(iso_now) exit_code=${code}"
}
on_exit() { emit_run_finished "$?"; }
trap on_exit EXIT
# --- end Phase 3b ---

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE="docker compose -f ${REPO_ROOT}/docker/docker-compose.yml -f ${REPO_ROOT}/docker/docker-compose.override.yml"
DB_PATH="${REPO_ROOT}/results/results.db"
RAW_DIR="${REPO_ROOT}/results/raw"

ALL_ENDPOINTS=(daily-sales sales-by-location sales-by-product sales-by-payment hourly-sales top-products location-product-matrix discount-impact full-summary)
DEFAULT_CONCURRENCY="10,50,100,500,1000,5000,10000"

FRAMEWORKS="fastapi"
ENDPOINTS_ARG="all"
CONCURRENCY_ARG="${DEFAULT_CONCURRENCY}"
DURATION_S=60
WARMUP_S=10
COOLDOWN_S=15
ERR_RATE_THRESHOLD="${BENCH_ERROR_RATE_THRESHOLD:-0.05}"
ERR_RATE_PCT_THRESHOLD="$(python3 -c "print(${ERR_RATE_THRESHOLD} * 100)")"

while [ $# -gt 0 ]; do
  case "$1" in
    --frameworks)  FRAMEWORKS="$2"; shift 2 ;;
    --endpoints)   ENDPOINTS_ARG="$2"; shift 2 ;;
    --concurrency) CONCURRENCY_ARG="$2"; shift 2 ;;
    --duration)    DURATION_S="$2"; shift 2 ;;
    --warmup)      WARMUP_S="$2"; shift 2 ;;
    --cooldown)    COOLDOWN_S="$2"; shift 2 ;;
    --run-id)      RUN_ID="$2"; shift 2 ;;
    *)             echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

mkdir -p "${RAW_DIR}"

# 0) Init results.db + regenerate configs.
"${SCRIPT_DIR}/init-results-db.sh"
"${SCRIPT_DIR}/cpu-pin.sh"
"${SCRIPT_DIR}/generate-postgres-config.sh"

# 1) Hardware detection.
HARDWARE_ID="$("${SCRIPT_DIR}/detect-hardware.sh")"
echo "[bench] hardware_runs id=${HARDWARE_ID}"

# 2) Start postgres + pgbouncer.
"${REPO_ROOT}/services/fastapi-app/prebuild.sh"
${COMPOSE} up -d postgres pgbouncer
sleep 3

# 3) Connection-limits gate.
if echo ",${CONCURRENCY_ARG}," | grep -qE ',(5000|10000),'; then
  "${SCRIPT_DIR}/test-connection-limits.sh"
fi

# 4) Resolve endpoints list.
if [ "${ENDPOINTS_ARG}" = "all" ]; then
  ENDPOINTS=("${ALL_ENDPOINTS[@]}")
else
  IFS=',' read -ra ENDPOINTS <<< "${ENDPOINTS_ARG}"
fi

IFS=',' read -ra CONC_LEVELS <<< "${CONCURRENCY_ARG}"
IFS=',' read -ra FRAMEWORK_LIST <<< "${FRAMEWORKS}"

# 5) Open benchmark_runs row (or reuse --run-id).
if [ -z "${RUN_ID:-}" ]; then
  NOTES="frameworks=${FRAMEWORKS} endpoints=${ENDPOINTS_ARG} concurrency=${CONCURRENCY_ARG}"
  RUN_ID=$(sqlite3 "${DB_PATH}" "INSERT INTO benchmark_runs (hardware_id, started_at, notes) VALUES (${HARDWARE_ID}, CURRENT_TIMESTAMP, '${NOTES//\'/\'\'}'); SELECT last_insert_rowid();")
  echo "[bench] benchmark_runs id=${RUN_ID}"
fi
echo "::run_started run_id=${RUN_ID} at=$(iso_now)"

# k6 cpuset.
K6_CPUSET="$(cat "${REPO_ROOT}/.k6-cpuset" 2>/dev/null || echo '')"
TASKSET_PREFIX=""
if [ -n "${K6_CPUSET}" ] && command -v taskset >/dev/null 2>&1; then
  TASKSET_PREFIX="taskset -c ${K6_CPUSET}"
  echo "[bench] pinning k6 to cores ${K6_CPUSET}"
fi

run_one_level() {
  local framework="$1" endpoint="$2" concurrency="$3"
  local stamp
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  local k6_summary="${RAW_DIR}/k6-${framework}-${endpoint}-c${concurrency}-${stamp}-summary.json"
  local rss_out="${RAW_DIR}/rss-${framework}-c${concurrency}-${stamp}.csv"
  local container="bench-${framework}"
  local target_url
  case "${framework}" in
    fastapi) target_url="http://localhost:8001" ;;
    fastify) target_url="http://localhost:8002" ;;
    axum)    target_url="http://localhost:8003" ;;
    *) echo "unknown framework ${framework}" >&2; return 2 ;;
  esac

  echo "[bench] === ${framework} ${endpoint} c=${concurrency} ==="
  emit_progress "${framework}" "${endpoint}" "${concurrency}" "warmup"

  # Start RSS sampler in background.
  "${SCRIPT_DIR}/sample-rss.sh" "${container}" "${rss_out}" &
  local sampler_pid=$!

  emit_progress "${framework}" "${endpoint}" "${concurrency}" "measure"
  set +e
  ${TASKSET_PREFIX} k6 run \
    --env "TARGET_URL=${target_url}" \
    --env "VUS=${concurrency}" \
    --env "DURATION=${DURATION_S}s" \
    --env "WARMUP=${WARMUP_S}s" \
    --summary-export "${k6_summary}" \
    "${REPO_ROOT}/load-tests/${endpoint}.js"
  local k6_rc=$?
  set -e

  kill "${sampler_pid}" 2>/dev/null || true
  wait "${sampler_pid}" 2>/dev/null || true

  emit_progress "${framework}" "${endpoint}" "${concurrency}" "parse"
  # Parse k6 summary JSON + RSS CSV.
  python3 - "${k6_summary}" "${rss_out}" "${DB_PATH}" "${RUN_ID}" "${framework}" "${endpoint}" "${concurrency}" "${DURATION_S}" "${WARMUP_S}" <<'PY'
import csv, json, sqlite3, sys

(summary_path, rss_path, db_path, run_id, framework, endpoint,
 concurrency, duration_s, warmup_s) = sys.argv[1:]

with open(summary_path) as f:
    s = json.load(f)

metrics = s.get("metrics", {})

# k6 summary-export puts values directly on the metric object.
# We REQUIRE measure-tagged submetrics for fair comparison.
http_reqs_measure = metrics.get("http_reqs{phase:measure}", {})
http_req_duration_measure = metrics.get("http_req_duration{phase:measure}", {})
http_req_failed_measure = metrics.get("http_req_failed{phase:measure}", {})

# Fail loudly if measure-tagged submetrics are missing (thresholds not emitted)
if http_reqs_measure is None or http_req_duration_measure is None:
    print("[parse] ERROR: measure-phase submetrics not found. k6 thresholds may be misconfigured.", file=sys.stderr)
    sys.exit(1)

# Use only measure-phase data
measure_count = int(http_reqs_measure.get("count", 0))
if measure_count == 0:
    print("[parse] ERROR: no requests in measure phase", file=sys.stderr)
    sys.exit(1)

# RPS computed from measure-phase count and duration
rps = measure_count / float(duration_s)
total_requests = measure_count  # Store measure-phase count as total
fail_fraction = http_req_failed_measure.get("value", 0.0)
total_errors = int(round(fail_fraction * measure_count))
error_rate_pct = round(fail_fraction * 100, 4)

# Use measure-tagged duration percentiles
p50 = http_req_duration_measure.get("med", None)
p95 = http_req_duration_measure.get("p(95)", None)
p99 = http_req_duration_measure.get("p(99)", None)

# RSS CSV: skip first warmup_s seconds for AVG.
rss_vals = []
cpu_vals = []
try:
    with open(rss_path) as f:
        rd = csv.DictReader(f)
        rows = list(rd)
    if rows:
        first_ts = int(rows[0]["ts_epoch"])
        cutoff = first_ts + int(warmup_s)
        for r in rows:
            ts = int(r["ts_epoch"])
            rss_kb = int(r["rss_kb"])
            cpu = float(r["cpu_pct"])
            if ts >= cutoff:
                rss_vals.append(rss_kb)
            cpu_vals.append(cpu)
        peak_rss_mb = max(int(r["rss_kb"]) for r in rows) / 1024.0
        avg_rss_mb  = (sum(rss_vals) / len(rss_vals) / 1024.0) if rss_vals else None
        peak_cpu_pct = max(cpu_vals) if cpu_vals else None
    else:
        peak_rss_mb = avg_rss_mb = peak_cpu_pct = None
except Exception:
    peak_rss_mb = avg_rss_mb = peak_cpu_pct = None

conn = sqlite3.connect(db_path)
cur = conn.cursor()
cur.execute("""
INSERT INTO benchmark_results
  (run_id, framework, endpoint, concurrency, duration_seconds,
   rps_sustained, p50_ms, p95_ms, p99_ms,
   error_rate_pct, total_requests, total_errors,
   peak_rss_mb, avg_rss_mb, peak_cpu_pct,
   k6_raw_path, rss_raw_path)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
""", (
    int(run_id), framework, endpoint, int(concurrency), int(duration_s),
    rps, p50, p95, p99,
    error_rate_pct, total_requests, total_errors,
    peak_rss_mb, avg_rss_mb, peak_cpu_pct,
    summary_path, rss_path,
))
conn.commit()
print(f"[parse] inserted result rps={rps:.1f} p99={p99} err={error_rate_pct:.2f}% peak_rss={peak_rss_mb}")

with open(summary_path + ".err_rate", "w") as f:
    f.write(f"{error_rate_pct:.4f}")
PY

  emit_progress "${framework}" "${endpoint}" "${concurrency}" "cooldown"
  local err_rate
  err_rate="$(cat "${k6_summary}.err_rate" 2>/dev/null || echo 0)"
  rm -f "${k6_summary}.err_rate"
  awk -v e="${err_rate}" -v t="${ERR_RATE_PCT_THRESHOLD}" 'BEGIN{ exit !(e > t) }' && {
    echo "[bench] STOP — error_rate=${err_rate}% > ${ERR_RATE_PCT_THRESHOLD}% at c=${concurrency}" >&2
    return 99
  }
  return 0
}

for framework in "${FRAMEWORK_LIST[@]}"; do
  echo "[bench] === starting ${framework} ==="
  ${COMPOSE} --profile "${framework}" up -d --build "${framework}"

  case "${framework}" in
    fastapi) HEALTH_URL="http://localhost:8001/health" ;;
    fastify) HEALTH_URL="http://localhost:8002/health" ;;
    axum)    HEALTH_URL="http://localhost:8003/health" ;;
  esac
  for i in $(seq 1 60); do
    if curl -fsS "${HEALTH_URL}" >/dev/null 2>&1; then break; fi
    sleep 1
    if [ "${i}" -eq 60 ]; then
      echo "FATAL: ${framework} /health never came up" >&2
      ${COMPOSE} logs "${framework}" | tail -100
      exit 1
    fi
  done

  # Pre-warm cache.
  echo "[bench] pg_prewarm transactions + transaction_items"
  ${COMPOSE} exec -T postgres psql -U bench -d benchmark -c \
    "SELECT pg_prewarm('transactions'); SELECT pg_prewarm('transaction_items');"

  for endpoint in "${ENDPOINTS[@]}"; do
    BREAKING=0
    for concurrency in "${CONC_LEVELS[@]}"; do
      if [ "${BREAKING}" -eq 1 ]; then
        echo "[bench] skip ${framework}/${endpoint}/c=${concurrency} (error rate exceeded)"
        continue
      fi
      set +e
      run_one_level "${framework}" "${endpoint}" "${concurrency}"
      rc=$?
      set -e
      if [ "${rc}" -eq 99 ]; then
        BREAKING=1
      elif [ "${rc}" -ne 0 ]; then
        echo "FATAL: run_one_level returned ${rc}" >&2
        exit "${rc}"
      fi
      sleep "${COOLDOWN_S}"
    done
  done

  ${COMPOSE} --profile "${framework}" stop "${framework}"
done

sqlite3 "${DB_PATH}" "UPDATE benchmark_runs SET finished_at=CURRENT_TIMESTAMP WHERE id=${RUN_ID};"
echo "[bench] done. Summary:"
sqlite3 -header -column "${DB_PATH}" "SELECT framework, endpoint, concurrency, ROUND(rps_sustained,1) rps, ROUND(p99_ms,1) p99, ROUND(error_rate_pct,2) err, ROUND(peak_rss_mb,1) peak_rss FROM benchmark_results WHERE run_id=${RUN_ID} ORDER BY endpoint, concurrency;"

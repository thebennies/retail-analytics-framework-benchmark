#!/usr/bin/env bash
# Phase 1b — spec section 6. 1Hz RSS+CPU collector. Writes CSV.
# Usage: sample-rss.sh <container_name> <out_csv>
set -euo pipefail

CONTAINER="${1:?container name required}"
OUT="${2:?output CSV path required}"

mkdir -p "$(dirname "${OUT}")"
echo "ts_epoch,rss_kb,cpu_pct" > "${OUT}"

PID="$(docker inspect -f '{{.State.Pid}}' "${CONTAINER}" 2>/dev/null || echo 0)"
if [ "${PID}" = "0" ] || [ -z "${PID}" ]; then
  echo "FATAL: cannot resolve PID of ${CONTAINER}" >&2
  exit 1
fi

# Parse cgroup v2 0:: unified path (fixes M-44)
# Fallback to v1 'memory' controller if v2 not available
CG_LINE="$(grep -m1 '0::.*memory' /proc/${PID}/cgroup 2>/dev/null || grep -m1 'memory' /proc/${PID}/cgroup 2>/dev/null || echo '')"
if [ -z "${CG_LINE}" ]; then
  echo "FATAL: cannot find memory cgroup for PID ${PID}" >&2
  exit 1
fi
CG_DIR="$(echo "${CG_LINE}" | cut -d: -f3 || echo '')"
if [ -z "${CG_DIR}" ]; then
  echo "FATAL: cannot parse cgroup directory from line: ${CG_LINE}" >&2
  exit 1
fi

cleanup() { exit 0; }
trap cleanup TERM INT

PREV_CPU=0
PREV_TS=0

while true; do
  TS=$(date +%s)

  if [ -n "${CG_DIR}" ] && [ -r "/sys/fs/cgroup${CG_DIR}/memory.current" ]; then
    RSS_BYTES=$(cat "/sys/fs/cgroup${CG_DIR}/memory.current")
    RSS_KB=$(( RSS_BYTES / 1024 ))
  else
    echo "FATAL: cannot read /sys/fs/cgroup${CG_DIR}/memory.current" >&2
    exit 1
  fi

  CPU_STAT_PATH="/sys/fs/cgroup${CG_DIR}/cpu.stat"
  if [ -r "${CPU_STAT_PATH}" ]; then
    CPU_USEC=$(awk '/^usage_usec/{print $2}' "${CPU_STAT_PATH}")
    if [ "${PREV_TS}" -gt 0 ]; then
      DELTA_USEC=$(( CPU_USEC - PREV_CPU ))
      DELTA_S=$(( TS - PREV_TS ))
      if [ "${DELTA_S}" -gt 0 ]; then
        CPU_PCT=$(awk -v u="${DELTA_USEC}" -v s="${DELTA_S}" 'BEGIN{printf "%.2f", (u/1000000.0)/s*100}')
      else
        CPU_PCT="0.00"
      fi
    else
      CPU_PCT="0.00"
    fi
    PREV_CPU="${CPU_USEC}"
    PREV_TS="${TS}"
  else
    CPU_PCT="0.00"
  fi

  echo "${TS},${RSS_KB},${CPU_PCT}" >> "${OUT}"
  sleep 1
done

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

CG_DIR="$(grep -m1 memory /proc/${PID}/cgroup 2>/dev/null | cut -d: -f3 || echo "")"

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
    RSS_KB=$(awk '/VmRSS/{print $2}' "/proc/${PID}/status" 2>/dev/null || echo 0)
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

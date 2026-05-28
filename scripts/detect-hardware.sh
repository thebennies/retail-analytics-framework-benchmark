#!/usr/bin/env bash
# Phase 1b — spec section 2. Hard-fails on non-Linux + cgroup v1; warns on
# non-Ubuntu-24; inserts a row into hardware_runs and prints the new id.
set -euo pipefail

NO_POSTGRES=false
if [ "${1:-}" = "--no-postgres" ]; then
  NO_POSTGRES=true
  shift
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DB_PATH="${REPO_ROOT}/results/results.db"

# 1) Linux only.
if [ "$(uname -s)" != "Linux" ]; then
  echo "FATAL: Linux required. Detected: $(uname -s)" >&2
  exit 1
fi

# 2) cgroup v2 only.
if [ ! -f /sys/fs/cgroup/cgroup.controllers ]; then
  echo "FATAL: cgroup v2 required (missing /sys/fs/cgroup/cgroup.controllers)." >&2
  exit 1
fi
CGROUP_VERSION="v2"

# 3) Ubuntu 24 recommended.
UBUNTU_VERSION="$(. /etc/os-release 2>/dev/null && echo "${PRETTY_NAME:-unknown}" || echo "unknown")"
if ! echo "${UBUNTU_VERSION}" | grep -q 'Ubuntu 24'; then
  echo "WARN: Methodology validated on Ubuntu 24.04 only. Detected: ${UBUNTU_VERSION}" >&2
fi

CPU_MODEL="$(grep -m1 'model name' /proc/cpuinfo | sed 's/^[^:]*: //')"
CPU_CORES="$(nproc --all)"
CPU_THREADS="$(grep -c ^processor /proc/cpuinfo)"
TOTAL_RAM_MB="$(awk '/MemTotal/{printf "%d", $2/1024}' /proc/meminfo)"

ROOT_DEV="$(findmnt -no SOURCE / 2>/dev/null | sed 's|/dev/||; s|[0-9]*$||' || echo unknown)"
if echo "${ROOT_DEV}" | grep -q '^nvme'; then
  DISK_TYPE="nvme"
elif [ -r "/sys/block/${ROOT_DEV}/queue/rotational" ]; then
  if [ "$(cat "/sys/block/${ROOT_DEV}/queue/rotational")" = "0" ]; then
    DISK_TYPE="ssd"
  else
    DISK_TYPE="hdd"
  fi
else
  DISK_TYPE="unknown"
fi

KERNEL_VERSION="$(uname -r)"
DOCKER_VERSION="$(docker --version 2>/dev/null | sed 's/^Docker version //; s/,.*//' || echo unknown)"

if [ "${NO_POSTGRES}" = true ]; then
  POSTGRES_VERSION="detecting"
else
  POSTGRES_VERSION="$(docker exec bench-postgres postgres -V 2>/dev/null | awk '{print $3}' || echo 'not-running')"
fi

if command -v systemd-detect-virt >/dev/null 2>&1; then
  HYPERVISOR="$(systemd-detect-virt 2>/dev/null || echo unknown)"
else
  HYPERVISOR="unknown"
fi

NOTES="auto-detected by scripts/detect-hardware.sh"

if [ ! -f "${DB_PATH}" ]; then
  echo "FATAL: ${DB_PATH} missing. Run scripts/init-results-db.sh first." >&2
  exit 1
fi
if ! sqlite3 "${DB_PATH}" ".tables" | grep -q 'hardware_runs'; then
  echo "FATAL: hardware_runs table missing. Run scripts/init-results-db.sh first." >&2
  exit 1
fi

# shellcheck disable=SC2086
HW_ID=$(sqlite3 "${DB_PATH}" <<SQL
INSERT INTO hardware_runs
  (detected_at, cpu_model, cpu_cores, cpu_threads, total_ram_mb, disk_type,
   kernel_version, ubuntu_version, docker_version, postgres_version,
   hypervisor, cgroup_version, notes)
VALUES
  (CURRENT_TIMESTAMP, '${CPU_MODEL//\'/\'\'}', ${CPU_CORES}, ${CPU_THREADS}, ${TOTAL_RAM_MB},
   '${DISK_TYPE}', '${KERNEL_VERSION//\'/\'\'}', '${UBUNTU_VERSION//\'/\'\'}',
   '${DOCKER_VERSION//\'/\'\'}', '${POSTGRES_VERSION//\'/\'\'}',
   '${HYPERVISOR}', '${CGROUP_VERSION}', '${NOTES//\'/\'\'}');
SELECT last_insert_rowid();
SQL
)

echo "${HW_ID}"

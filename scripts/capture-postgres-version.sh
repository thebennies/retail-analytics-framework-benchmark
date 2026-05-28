#!/usr/bin/env bash
# Capture postgres_version after infra is healthy and update hardware_runs row.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DB_PATH="${REPO_ROOT}/results/results.db"

if [ -z "${1:-}" ]; then
  echo "Usage: capture-postgres-version.sh <hardware_id>" >&2
  exit 1
fi

HW_ID="$1"

POSTGRES_VERSION="$(docker exec bench-postgres postgres -V 2>/dev/null | awk '{print $3}' || echo 'unknown')"
echo "[capture-postgres-version] postgres_version=${POSTGRES_VERSION}"

sqlite3 "${DB_PATH}" <<SQL
UPDATE hardware_runs SET postgres_version = '${POSTGRES_VERSION}' WHERE id = ${HW_ID};
SQL

echo "[capture-postgres-version] updated hardware_runs id=${HW_ID}"

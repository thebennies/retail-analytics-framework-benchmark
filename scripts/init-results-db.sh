#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DB_PATH="${REPO_ROOT}/results/results.db"

mkdir -p "${REPO_ROOT}/results/raw"

if [ -f "${DB_PATH}" ]; then
  echo "[init-results-db] ${DB_PATH} already exists. Skipping."
  exit 0
fi

sqlite3 "${DB_PATH}" <<'SQL'
-- Phase 1a minimal results schema. Phase 1b expands to full hardware_runs + benchmark_runs FK.

CREATE TABLE IF NOT EXISTS benchmark_results (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  framework           TEXT NOT NULL,
  endpoint            TEXT NOT NULL,
  concurrency         INTEGER NOT NULL,
  duration_seconds    INTEGER NOT NULL,
  rps_sustained       REAL,
  p50_ms              REAL,
  p95_ms              REAL,
  p99_ms              REAL,
  error_rate_pct      REAL,
  total_requests      INTEGER,
  total_errors        INTEGER,
  k6_raw_path         TEXT,
  created_at          TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_results_framework_endpoint
  ON benchmark_results(framework, endpoint, concurrency);
SQL

echo "[init-results-db] created ${DB_PATH}"

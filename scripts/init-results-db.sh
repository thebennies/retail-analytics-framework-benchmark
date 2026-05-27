#!/usr/bin/env bash
# Phase 1b — full results.db schema per spec section 6.
# Migrates Phase 1a single-table by backing up and rebuilding.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DB_PATH="${REPO_ROOT}/results/results.db"
BACKUP_PATH="${REPO_ROOT}/results/results.db.phase1a.bak"

mkdir -p "${REPO_ROOT}/results/raw"

NEEDS_MIGRATION=0
if [ -f "${DB_PATH}" ]; then
  if sqlite3 "${DB_PATH}" ".tables" | grep -q 'hardware_runs'; then
    echo "[init-results-db] schema already up to date"
    exit 0
  else
    echo "[init-results-db] detected Phase 1a schema; migrating"
    NEEDS_MIGRATION=1
    cp "${DB_PATH}" "${BACKUP_PATH}"
    echo "[init-results-db] backed up to ${BACKUP_PATH}"
    rm "${DB_PATH}"
  fi
fi

sqlite3 "${DB_PATH}" <<'SQL'
CREATE TABLE hardware_runs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  detected_at     TIMESTAMP NOT NULL,
  cpu_model       TEXT,
  cpu_cores       INTEGER,
  cpu_threads     INTEGER,
  total_ram_mb    INTEGER,
  disk_type       TEXT,
  kernel_version  TEXT,
  ubuntu_version  TEXT,
  docker_version  TEXT,
  postgres_version TEXT,
  hypervisor      TEXT,
  cgroup_version  TEXT,
  notes           TEXT
);

CREATE TABLE benchmark_runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  hardware_id   INTEGER NOT NULL REFERENCES hardware_runs(id),
  started_at    TIMESTAMP NOT NULL,
  finished_at   TIMESTAMP,
  notes         TEXT
);

CREATE TABLE benchmark_results (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id              INTEGER NOT NULL REFERENCES benchmark_runs(id),
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
  peak_rss_mb         REAL,
  avg_rss_mb          REAL,
  peak_cpu_pct        REAL,
  k6_raw_path         TEXT,
  rss_raw_path        TEXT,
  created_at          TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_results_framework_endpoint
  ON benchmark_results(framework, endpoint, concurrency);
SQL

echo "[init-results-db] created ${DB_PATH} with full Phase 1b schema"

if [ "${NEEDS_MIGRATION}" -eq 1 ]; then
  echo "[init-results-db] NOTE: Phase 1a rows preserved in ${BACKUP_PATH}"
fi

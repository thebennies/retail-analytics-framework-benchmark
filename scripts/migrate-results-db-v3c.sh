#!/usr/bin/env bash
# Phase 3c migration: add manual_scores table to existing results.db.
# Idempotent. Safe to run multiple times.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DB_PATH="${REPO_ROOT}/results/results.db"

if [ ! -f "${DB_PATH}" ]; then
  echo "FATAL: ${DB_PATH} not found. Run earlier-phase init/migrations first."
  exit 1
fi

echo "[migrate-v3c] target: ${DB_PATH}"

EXISTS="$(sqlite3 "${DB_PATH}" "SELECT name FROM sqlite_master WHERE type='table' AND name='manual_scores';")"

if [ "${EXISTS}" = "manual_scores" ]; then
  echo "[migrate-v3c] manual_scores already exists. Nothing to do."
  exit 0
fi

sqlite3 "${DB_PATH}" <<'SQL'
CREATE TABLE IF NOT EXISTS manual_scores (
  run_id                INTEGER NOT NULL,
  framework             TEXT NOT NULL,
  dev_experience_score  INTEGER NOT NULL CHECK (dev_experience_score BETWEEN 1 AND 5),
  notes                 TEXT,
  updated_at            TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (run_id, framework)
);

CREATE INDEX IF NOT EXISTS idx_manual_scores_run
  ON manual_scores(run_id);
SQL

echo "[migrate-v3c] created manual_scores table."
sqlite3 "${DB_PATH}" ".schema manual_scores"

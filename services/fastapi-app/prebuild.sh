#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "${SCRIPT_DIR}/../shared/queries.sql" "${SCRIPT_DIR}/shared-queries.sql"
echo "[prebuild] copied shared/queries.sql → fastapi-app/shared-queries.sql"

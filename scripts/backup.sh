#!/usr/bin/env bash
set -euo pipefail

# Ruiru Titans Automated Database Backup Script
# Can be executed manually or via cron / systemd timer.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

if [ -f "venv/bin/python" ]; then
    PYTHON_BIN="venv/bin/python"
else
    PYTHON_BIN="python3"
fi

echo "[$(date -u +"%Y-%m-%d %H:%M:%SZ")] Starting Ruiru Titans Database Backup..."

"$PYTHON_BIN" manage.py backup_database "$@"

echo "[$(date -u +"%Y-%m-%d %H:%M:%SZ")] Backup finished successfully."

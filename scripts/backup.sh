#!/usr/bin/env bash
set -euo pipefail

# Ruiru Titans Automated Database Backup Script
# Can be executed manually, via cron, or as a K3s Kubernetes CronJob.
#
# Production Host Cron Example (for deployment under service user 'titans'):
# Deployment path: /var/www/ruirutitans
# Run nightly at 02:00 UTC:
#   0 2 * * * /var/www/ruirutitans/scripts/backup.sh >> /var/log/ruirutitans/backup.log 2>&1
#
# Ensure log directory exists and has appropriate permissions:
#   sudo mkdir -p /var/log/ruirutitans && sudo chown -R titans:titans /var/log/ruirutitans

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

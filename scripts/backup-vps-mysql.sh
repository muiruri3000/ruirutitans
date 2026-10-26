#!/usr/bin/env bash
# ==============================================================================
# Ruiru Titans - MySQL Daily Midnight VPS Host Backup Script
# ==============================================================================
# This script runs directly on the VPS host (via host crontab).
# It discovers the active MySQL container in the K3s/Kubernetes cluster,
# streams an atomic mysqldump through gzip, and saves it to the host storage.
# ==============================================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/mysql}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
NAMESPACE="ruirutitans"
TIMESTAMP="$(date +"%Y%m%d_%H%M%S")"
TARGET_FILE="${BACKUP_DIR}/mysql_backup_${TIMESTAMP}.sql.gz"
LOG_PREFIX="[$(date +"%Y-%m-%d %H:%M:%S")]"

echo "${LOG_PREFIX} Initiating Ruiru Titans MySQL backup..."

# 1. Ensure backup directory exists with restricted permissions
mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

# 2. Configure KUBECONFIG if default k3s locations exist and are readable
if [ -z "${KUBECONFIG:-}" ]; then
    if [ -f "$HOME/.kube/config" ]; then
        export KUBECONFIG="$HOME/.kube/config"
    elif [ -r "/etc/rancher/k3s/k3s.yaml" ]; then
        export KUBECONFIG="/etc/rancher/k3s/k3s.yaml"
    fi
fi

# Locate kubectl or k3s binary
if command -v kubectl >/dev/null 2>&1; then
    KUBECTL="kubectl"
elif command -v k3s >/dev/null 2>&1; then
    KUBECTL="k3s kubectl"
else
    echo "${LOG_PREFIX} [ERROR] Neither 'kubectl' nor 'k3s' command was found on this VPS." >&2
    exit 1
fi

# 3. Find running MySQL pod
# Query pods matching label; if none, try matching by name prefix
MYSQL_POD=$(${KUBECTL} get pods -n "${NAMESPACE}" -l app.kubernetes.io/name=ruirutitans-mysql --field-selector=status.phase=Running -o jsonpath='{.items[0].metadata.name}' 2>&1 || true)

# If label didn't match or failed, check for any pod starting with ruirutitans-mysql
if [ -z "${MYSQL_POD}" ] || echo "${MYSQL_POD}" | grep -q "error"; then
    POD_ERROR="${MYSQL_POD}"
    MYSQL_POD=$(${KUBECTL} get pods -n "${NAMESPACE}" --field-selector=status.phase=Running -o jsonpath='{.items[?(@.metadata.labels.app\.kubernetes\.io/name=="ruirutitans-mysql")].metadata.name}' 2>&1 || true)
    
    if [ -z "${MYSQL_POD}" ] || echo "${MYSQL_POD}" | grep -q "error"; then
        echo "${LOG_PREFIX} [ERROR] Could not find running MySQL pod in namespace '${NAMESPACE}'." >&2
        if [ -n "${POD_ERROR}" ]; then
            echo "${LOG_PREFIX} Cluster output: ${POD_ERROR}" >&2
        fi
        exit 1
    fi
fi

echo "${LOG_PREFIX} Found active MySQL pod: ${MYSQL_POD}"

# 4. Stream mysqldump from inside the pod directly into gzip on the host
# Reads MYSQL_ROOT_PASSWORD and MYSQL_DATABASE injected into the container environment by K3s secrets.
${KUBECTL} exec -n "${NAMESPACE}" "${MYSQL_POD}" -- sh -c '
    exec mysqldump \
      -uroot \
      -p"$MYSQL_ROOT_PASSWORD" \
      --single-transaction \
      --quick \
      --routines \
      --triggers \
      "$MYSQL_DATABASE" 2>/dev/null
' | gzip -9 > "${TARGET_FILE}"

# 5. Verify the backup file was created and is non-empty
if [ ! -s "${TARGET_FILE}" ]; then
    echo "${LOG_PREFIX} [ERROR] Backup failed! Destination file is empty or missing: ${TARGET_FILE}" >&2
    rm -f "${TARGET_FILE}"
    exit 1
fi

chmod 600 "${TARGET_FILE}"
FILE_SIZE=$(du -h "${TARGET_FILE}" | cut -f1)
echo "${LOG_PREFIX} ✓ MySQL backup successfully written to: ${TARGET_FILE} (${FILE_SIZE})"

# 6. Prune old backups older than retention policy
echo "${LOG_PREFIX} Pruning backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -type f -name "mysql_backup_*.sql.gz" -mtime +"${RETENTION_DAYS}" -delete

TOTAL_BACKUPS=$(find "${BACKUP_DIR}" -type f -name "mysql_backup_*.sql.gz" | wc -l)
echo "${LOG_PREFIX} ✓ Retention check complete. Total current backups retained: ${TOTAL_BACKUPS}"

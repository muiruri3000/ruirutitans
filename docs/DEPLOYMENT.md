# Ruiru Titans Production Deployment & Operations Guide

This guide details containerization, Kubernetes orchestration, database persistence, and daily maintenance procedures for **Ruiru Titans**.

---

## 1. Container Architecture

The application is containerized using multi-stage Docker builds:

- **`Dockerfile.backend`**:
  - Base: `python:3.13-slim`
  - Installs system runtime dependencies (SQLite3, curl, libpq-dev).
  - Copies Python dependencies and application code.
  - Runs Django via Gunicorn (`config.wsgi:application`) on port `8000`.

- **`frontend/Dockerfile.frontend`**:
  - Stage 1: `node:20-alpine` builds the Vite React production bundle.
  - Stage 2: `nginx:alpine` serves static assets with optimal caching headers and reverse-proxies `/api` traffic.

---

## 2. Kubernetes (k3s / k8s) Manifests

All orchestration manifests are located in [`k8s/`](file:///home/marie/Desktop/ruirutitans/k8s/):

| File | Purpose |
| :--- | :--- |
| `namespace.yaml` | Creates isolated namespace `ruirutitans` |
| `config.yaml` | Non-sensitive environment variables (`DJANGO_SETTINGS_MODULE`, etc.) |
| `secrets.yaml` | Production `SECRET_KEY`, administrator passwords, database credentials |
| `pvc.yaml` | PersistentVolumeClaim (`ruirutitans-data-pvc`) for SQLite database and media files |
| `backend.yaml` | Deployment & Service for Gunicorn Django backend with readiness/liveness probes |
| `frontend.yaml` | Deployment & Service for Nginx React frontend |
| `ingress.yaml` | Traefik Ingress configuration with Let's Encrypt TLS termination |
| `backup-cronjob.yaml` | Daily automated database snapshot CronJob (02:00 UTC) |

### Deploying to Cluster
```bash
# 1. Apply namespace
kubectl apply -f k8s/namespace.yaml

# 2. Provision secret (copy from secrets.example.yaml first)
kubectl apply -f k8s/secrets.yaml

# 3. Apply configurations, PVC, and services
kubectl apply -k k8s/
```

---

## 3. Database Management & Persistence

### SQLite on Persistent Volumes
When running SQLite in Kubernetes:
- The database is stored at `/app/data/db.sqlite3` on the PersistentVolume mounted via `ruirutitans-data-pvc`.
- Storage permissions must allow read/write by user `1000:1000` or root as configured in `backend.yaml`.
- The backend deployment uses `strategy: type: Recreate` to ensure only one pod accesses the SQLite volume at any given time, preventing file locking conflicts.

### Running Migrations in Production
```bash
kubectl exec -it -n ruirutitans deploy/ruirutitans-backend -- python manage.py migrate
```

---

## 4. Automated Backup & Recovery Procedures

### Running an Immediate Manual Backup
```bash
kubectl exec -it -n ruirutitans deploy/ruirutitans-backend -- python manage.py backup_database
```

### Backup Archive Storage
Backups are written to the persistent volume at `/app/data/backups/`:
- `db_backup_sqlite_YYYYMMDD_HHMMSS.sqlite3.gz` (Atomic SQLite binary snapshot)
- `state_snapshot_YYYYMMDD_HHMMSS.json.gz` (Complete tournament JSON state)

### Restoring from a Snapshot
To restore from a backup:
```bash
# 1. Scale backend deployment to 0
kubectl scale deployment ruirutitans-backend --replicas=0 -n ruirutitans

# 2. Extract and restore snapshot
gzip -d -c /app/data/backups/db_backup_sqlite_YYYYMMDD_HHMMSS.sqlite3.gz > /app/data/db.sqlite3

# 3. Scale backend deployment back to 1
kubectl scale deployment ruirutitans-backend --replicas=1 -n ruirutitans
```

---

## 5. Environment Variables Reference

| Variable | Default | Description |
| :--- | :--- | :--- |
| `SECRET_KEY` | *(Required in prod)* | Django cryptographic signing secret |
| `DEBUG` | `False` | Enable or disable debug mode (must be `False` in prod) |
| `ALLOWED_HOSTS` | `ruirutitans.com,localhost` | Comma-separated allowed domain hosts |
| `CSRF_TRUSTED_ORIGINS` | `https://ruirutitans.com` | Trusted origins for CSRF POST verification |
| `SQLITE_DB_PATH` | `/app/data/db.sqlite3` | Path to the SQLite database file |
| `BACKUP_DIR` | `/app/data/backups` | Target directory for automated database backups |
| `BACKUP_RETENTION_DAYS`| `14` | Days to keep automated snapshot archives before pruning |

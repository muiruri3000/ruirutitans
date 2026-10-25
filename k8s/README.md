# Ruiru Titans — Kubernetes (K3s) Deployment Guide & Secret Provisioning

This directory contains the production Kubernetes manifests for deploying **Ruiru Titans** onto a **K3s** cluster with **Traefik Ingress** and **Local-Path Storage**.

---

## 🔒 Secret Management & First Deployment Safety

To ensure production security, **no secrets or credentials are ever committed to Git, embedded in container images, or generated as placeholder manifests in Kustomize.**

Running `kubectl apply -k k8s/` or `kustomize build k8s/` will **never** create or overwrite `ruirutitans-secrets` or `ruirutitans-tls-cert`.

All sensitive credentials must be provisioned directly on the K3s cluster prior to running the deployment pipeline.

---

## 📋 Step-by-Step Prerequisites Checklist

### Step 1: Create the Namespace
Before provisioning secrets, ensure the target namespace exists:
```bash
kubectl apply -f k8s/namespace.yaml
```

---

### Step 2: Provision Application Secret (`ruirutitans-secrets`)

Generate a cryptographically secure Django `SECRET_KEY` and create the Kubernetes Secret:

```bash
# Generate a 50-character cryptographically secure token
SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(50))")

# Create the Kubernetes secret in the ruirutitans namespace
kubectl create secret generic ruirutitans-secrets \
  -n ruirutitans \
  --from-literal=SECRET_KEY="$SECRET_KEY"
```

> [!NOTE]
> If running with MySQL (`DB_ENGINE=mysql`), append database credentials:
> ```bash
> kubectl create secret generic ruirutitans-secrets \
>   -n ruirutitans \
>   --from-literal=SECRET_KEY="$SECRET_KEY" \
>   --from-literal=MYSQL_DATABASE="ruirutitans" \
>   --from-literal=MYSQL_USER="titans_user" \
>   --from-literal=MYSQL_PASSWORD="<STRONG_DB_PASSWORD>" \
>   --from-literal=MYSQL_ROOT_PASSWORD="<STRONG_ROOT_PASSWORD>"
> ```

---

### Step 3: Provision TLS Certificate (`ruirutitans-tls-cert`)

Traefik terminates TLS using the certificate secret `ruirutitans-tls-cert`.

#### Option A: Existing Let's Encrypt / Certbot Certificates
If Certbot is already running on the host VPS:
```bash
kubectl create secret tls ruirutitans-tls-cert \
  -n ruirutitans \
  --cert=/etc/letsencrypt/live/ruirutitans.com/fullchain.pem \
  --key=/etc/letsencrypt/live/ruirutitans.com/privkey.pem
```

#### Option B: If Using cert-manager
If `cert-manager` is installed on K3s, ensure a `Certificate` resource issues to secret `ruirutitans-tls-cert`, or uncomment the `cert-manager.io/cluster-issuer` annotation in [`k8s/ingress.yaml`](file:///home/marie/Desktop/ruirutitans/k8s/ingress.yaml).

---

### Step 4: Configure GitHub Container Registry (GHCR) Image Pulls

GitHub Actions builds and publishes backend and frontend images to GitHub Container Registry:
- `ghcr.io/<owner>/ruirutitans-backend:<commit-sha>`
- `ghcr.io/<owner>/ruirutitans-frontend:<commit-sha>`

By default, container images published under private GitHub repositories are **private**.

#### Option A: Cluster Image Pull Secret (Recommended for Private Images)
1. Generate a GitHub Personal Access Token (classic) with `read:packages` scope (or fine-grained PAT with read access to packages).
2. Create the `ghcr-secret` secret in K3s:
   ```bash
   kubectl create secret docker-registry ghcr-secret \
     -n ruirutitans \
     --docker-server=ghcr.io \
     --docker-username=<GITHUB_USERNAME> \
     --docker-password=<GITHUB_PAT_WITH_READ_PACKAGES>
   ```
3. Patch the `default` ServiceAccount in the `ruirutitans` namespace so all pods automatically inherit image pull authentication:
   ```bash
   kubectl patch serviceaccount default -n ruirutitans -p '{"imagePullSecrets": [{"name": "ghcr-secret"}]}'
   ```

#### Option B: Public GHCR Packages
If the packages are non-sensitive and intended to be publicly pullable:
1. Navigate to: `https://github.com/users/<owner>/packages/container/ruirutitans-backend/settings` (and `ruirutitans-frontend/settings`).
2. Under "Danger Zone" $\rightarrow$ "Change package visibility", select **Public**.
3. No Kubernetes image pull secret is required.

---

### Step 5: Configure GitHub Actions Secrets
In your GitHub repository settings (**Settings** $\rightarrow$ **Secrets and variables** $\rightarrow$ **Actions**):
- **`KUBECONFIG`**: The raw kubeconfig file content for the K3s cluster.
  - Recommended: Create a dedicated ServiceAccount with cluster-admin or namespace-admin permissions restricted to `ruirutitans`.

---

## 🚀 CI/CD Pipeline Safety Features

The deployment workflow [`.github/workflows/deploy.yml`](file:///home/marie/Desktop/ruirutitans/.github/workflows/deploy.yml) includes automated guardrails:

1. **Automated Testing & Checks**:
   - Backend `python manage.py check --deploy` and full test suite (`python manage.py test`) must pass.
   - Frontend `npm ci` and `npm run build` must succeed.
2. **Pre-Flight Cluster Verification**:
   - Verifies `ruirutitans-secrets` exists.
   - Verifies the `SECRET_KEY` data key is populated **without printing its value to logs**.
   - Fails immediately and halts deployment if secrets are missing.
   - Checks TLS secret `ruirutitans-tls-cert` and warns if missing.
   - Checks `ghcr-secret` and alerts if private image pulls may fail.
3. **Atomic Rollout & Automatic Rollback**:
   - Monitors deployment rollout status (`kubectl rollout status`).
   - If rollout fails or times out, automatically executes `kubectl rollout undo` to revert to the previous working revision.

---

## 🛠️ Verification & Maintenance Commands

### Check Pod Status
```bash
kubectl get pods,svc,ingress -n ruirutitans -o wide
```

### Inspect Backend Logs
```bash
kubectl logs -n ruirutitans -l app.kubernetes.io/name=ruirutitans-backend -c backend --tail=100 -f
```

### Run Migrations Manually (if needed)
```bash
kubectl exec -n ruirutitans deployment/ruirutitans-backend -c backend -- python manage.py migrate --noinput
```

### Trigger an Immediate Database Backup
```bash
kubectl create job --from=cronjob/ruirutitans-backup-nightly manual-backup-$(date +%s) -n ruirutitans
```

---

## 🛡️ Disaster Recovery & SQLite Database Restoration

> [!WARNING]
> A container rollback (`kubectl rollout undo`) only reverts the container image; it does **not** revert SQLite database schema migrations or persistent volume (`ruirutitans-data-pvc`) data.
> In SQLite WAL mode, overwriting `db.sqlite3` while leaving stale `db.sqlite3-wal` or `db.sqlite3-shm` files causes database corruption or stale log replays.

### Backup File Naming Convention
Nightly backups generate timestamped pairs in `/app/backups` on `ruirutitans-backups-pvc`:
- `db_backup_sqlite_<YYYYMMDD_HHMMSS>.sqlite3.gz` (Atomic SQLite database snapshot)
- `state_snapshot_<YYYYMMDD_HHMMSS>.json.gz` (Complete serialized tournament state snapshot)

### Safe Restoration Procedure

1. **Scale down the Backend Deployment** (stops all active SQLite connections and background writes):
   ```bash
   kubectl scale deployment ruirutitans-backend -n ruirutitans --replicas=0
   ```

2. **Launch a Dedicated Recovery Pod**:
   ```bash
   kubectl run sqlite-recovery --rm -it \
     --namespace ruirutitans \
     --image=ghcr.io/muiruri3000/ruirutitans-backend:latest \
     --overrides='
     {
       "spec": {
         "securityContext": { "fsGroup": 1000 },
         "volumes": [
           { "name": "data", "persistentVolumeClaim": { "claimName": "ruirutitans-data-pvc" } },
           { "name": "backups", "persistentVolumeClaim": { "claimName": "ruirutitans-backups-pvc" } }
         ],
         "containers": [
           {
             "name": "recovery",
             "image": "ghcr.io/muiruri3000/ruirutitans-backend:latest",
             "command": ["/bin/sh"],
             "stdin": true,
             "tty": true,
             "volumeMounts": [
               { "name": "data", "mountPath": "/app/data" },
               { "name": "backups", "mountPath": "/app/backups" }
             ]
           }
         ]
       }
     }'
   ```

3. **Restore Using the Automated Management Command**:
   Inside the recovery container shell:
   ```bash
   # List available backups by timestamp
   ls -la /app/backups/db_backup_sqlite_*.sqlite3.gz

   # Choose the target backup and restore
   # The command automatically:
   # 1. Validates backup integrity (PRAGMA integrity_check) before touching active files
   # 2. Archives existing db.sqlite3, -wal, and -shm files to timestamped .failed_<timestamp> backups
   # 3. Unlinks stale active WAL/SHM files to prevent corruption on first open
   # 4. Swaps restored database and performs a final PRAGMA integrity_check
   python manage.py backup_database --restore /app/backups/db_backup_sqlite_20261024_020000.sqlite3.gz

   exit
   ```

4. **Roll Back Deployment Image (if required) and Scale Up**:
   ```bash
   kubectl rollout undo deployment/ruirutitans-backend -n ruirutitans
   kubectl scale deployment ruirutitans-backend -n ruirutitans --replicas=1
   kubectl rollout status deployment/ruirutitans-backend -n ruirutitans --timeout=180s
   ```

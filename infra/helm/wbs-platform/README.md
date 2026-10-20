# wbs-platform Helm chart

This chart packages the WBS extension layer for on-premises Kubernetes:

- WBS API
- WBS portal
- Optional PostgreSQL 17 StatefulSet
- Optional Ingress routing
- Prometheus scrape annotations on the API pod

OpenProject CE is intentionally treated as an external engine endpoint through `api.openprojectBaseUrl`. This keeps the extension layer deployable without forking or coupling to OpenProject's chart.

Before enabling actual sync, call the API preflight endpoints:

```bash
curl https://wbs-api.example.com/api/pm-engine/preflight
curl https://wbs-api.example.com/api/projects/{project_id}/sync-preflight
```

The default sync mode remains dry-run/disabled until `api.openprojectSyncEnabled` and `api.openprojectApiToken` are configured.
If the API reaches OpenProject through an internal service name while OpenProject validates another public host name, set `api.openprojectHostHeader` to that public host.
For local installation validation without external OpenProject calls, set `api.pmEngineAdapter=mock`.
The operations health endpoint reads PostgreSQL backup metadata from `api.backupDir`.
Set `api.backupVolume.enabled=true` with `api.backupVolume.existingClaim` when the API pod should read backup files from a PVC.
Short login aliases such as `admin/admin` are disabled by default in this chart; enable `api.enableLoginAliases=true` only for demos or local validation.
Weekly report delivery is controlled by `api.reportSchedulerEnabled` and the `api.reportSmtp*` values. Without SMTP, report runs still generate Excel artifacts and audit records but skip email delivery.
Set `api.reportOutputVolume.enabled=true` with `api.reportOutputVolume.existingClaim` when generated Excel artifacts should survive API pod replacement.

## Render

```bash
helm template wbs-platform ./infra/helm/wbs-platform
```

## Install with bundled PostgreSQL

```bash
helm upgrade --install wbs-platform ./infra/helm/wbs-platform \
  --namespace wbs --create-namespace \
  --set postgresql.auth.password='replace-me' \
  --set api.portalOrigin='https://wbs.example.com' \
  --set portal.apiBaseUrl='https://wbs-api.example.com'
```

## Install with external PostgreSQL

```bash
helm upgrade --install wbs-platform ./infra/helm/wbs-platform \
  --namespace wbs --create-namespace \
  --set postgresql.enabled=false \
  --set externalPostgresql.host='postgres.internal' \
  --set externalPostgresql.password='replace-me'
```

For production, prefer an existing Kubernetes Secret and set `postgresql.auth.existingSecret` or `externalPostgresql.existingSecret`. The Secret must contain `username`, `password`, and `database` keys.

## Deployment-target overlays

Two ready-made values overlays select a deployment target without changing the chart:

- `values-onprem.yaml` — single/few-node on-premises or laptop Kubernetes cluster (bundled PostgreSQL, HPA/PDB disabled, nginx Ingress, no ExternalSecret).
- `values-azure.yaml` — AKS, paired with `infra/azure/` Bicep (ACR images, Azure Database for PostgreSQL Flexible Server via `externalPostgresql`, Azure Key Vault via `externalSecret` + Workload Identity, HPA/PDB/NetworkPolicy enabled).

```bash
helm upgrade --install wbs-platform ./infra/helm/wbs-platform -f values-onprem.yaml
helm upgrade --install wbs-platform ./infra/helm/wbs-platform -f values-azure.yaml \
  --set api.image.repository='<ACR_LOGIN_SERVER>/wbs-api' \
  --set portal.image.repository='<ACR_LOGIN_SERVER>/wbs-portal' \
  --set externalPostgresql.host='<POSTGRES_FLEXIBLE_SERVER_FQDN>'
```

`externalSecret.keySeparator` controls how `externalSecret.remoteKeyPrefix` is joined with each
secret name (default `/`, suitable for AWS Secrets Manager and Vault paths). Azure Key Vault
secret names cannot contain `/`, so `values-azure.yaml` sets `keySeparator: "-"`.

When `postgresql.enabled=false` and `networkPolicy.enabled=true`, the API egress rule for
PostgreSQL switches from a pod selector to an `ipBlock` (port 5432 to any destination) since the
external database is not a pod in the cluster.

## Migration job

The API can apply the SQL migration at startup by default. For stricter operations, run it as a separate Kubernetes Job and disable startup migration:

```bash
helm upgrade --install wbs-platform ./infra/helm/wbs-platform \
  --namespace wbs --create-namespace \
  --set api.migrationJob.enabled=true \
  --set api.runMigrationsOnStartup=false
```

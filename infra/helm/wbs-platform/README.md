# wbs-platform Helm chart

This chart packages the WBS extension layer for on-premises Kubernetes:

- WBS API
- WBS portal
- Optional PostgreSQL 17 StatefulSet
- Optional Ingress routing
- Prometheus scrape annotations on the API pod

OpenProject CE is intentionally treated as an external engine endpoint through `api.openprojectBaseUrl`. This keeps the extension layer deployable without forking or coupling to OpenProject's chart.

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

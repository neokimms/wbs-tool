#!/usr/bin/env bash
# 옵션 기반 배포 진입점.
#   scripts/deploy.sh onprem up|down|status [--monitoring]
#   scripts/deploy.sh azure infra [--rg NAME] [--location LOC] [--env-name NAME]
#   scripts/deploy.sh azure app   [--rg NAME] [--namespace NS] [--env-name NAME]
#
# onprem  : 루트 docker-compose.yml 기반 온프레미스/노트북 설치
# azure   : infra/azure Bicep 인프라 프로비저닝 + infra/helm/wbs-platform values-azure.yaml Helm 배포
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

usage() {
  sed -n '2,8p' "$0"
  exit 1
}

[[ $# -ge 1 ]] || usage
TARGET="$1"; shift

case "$TARGET" in
  onprem)
    [[ $# -ge 1 ]] || usage
    ACTION="$1"; shift
    PROFILES=(--profile api --profile openproject)
    for arg in "$@"; do
      case "$arg" in
        --monitoring) PROFILES+=(--profile monitoring) ;;
        *) echo "알 수 없는 옵션: $arg" >&2; usage ;;
      esac
    done

    case "$ACTION" in
      up)
        docker compose "${PROFILES[@]}" up -d --build
        ;;
      down)
        docker compose "${PROFILES[@]}" down
        ;;
      status)
        bash scripts/status-check.sh
        ;;
      *)
        echo "알 수 없는 동작: $ACTION (up|down|status)" >&2
        usage
        ;;
    esac
    ;;

  azure)
    [[ $# -ge 1 ]] || usage
    ACTION="$1"; shift

    RG="${WBS_AZURE_RG:-wbs-platform-prod}"
    LOCATION="${WBS_AZURE_LOCATION:-koreacentral}"
    ENV_NAME="${WBS_AZURE_ENV_NAME:-prod}"
    NAMESPACE="${WBS_AZURE_NAMESPACE:-wbs}"

    while [[ $# -gt 0 ]]; do
      case "$1" in
        --rg) RG="$2"; shift 2 ;;
        --location) LOCATION="$2"; shift 2 ;;
        --env-name) ENV_NAME="$2"; shift 2 ;;
        --namespace) NAMESPACE="$2"; shift 2 ;;
        *) echo "알 수 없는 옵션: $1" >&2; usage ;;
      esac
    done

    case "$ACTION" in
      infra)
        : "${WBS_AZURE_POSTGRES_PASSWORD:?WBS_AZURE_POSTGRES_PASSWORD 환경변수에 PostgreSQL 관리자 비밀번호를 설정하세요}"

        az group create --name "$RG" --location "$LOCATION" >/dev/null

        az deployment group create \
          --resource-group "$RG" \
          --template-file infra/azure/main.bicep \
          --parameters infra/azure/main.parameters.json \
          --parameters environmentName="$ENV_NAME" location="$LOCATION" \
          --parameters postgresAdminPassword="$WBS_AZURE_POSTGRES_PASSWORD" \
          --name main
        ;;

      app)
        ACR=$(az deployment group show -g "$RG" -n main --query properties.outputs.acrLoginServer.value -o tsv)
        PGHOST=$(az deployment group show -g "$RG" -n main --query properties.outputs.postgresFqdn.value -o tsv)
        AKS=$(az deployment group show -g "$RG" -n main --query properties.outputs.aksName.value -o tsv)

        az aks get-credentials --resource-group "$RG" --name "$AKS" --overwrite-existing

        helm upgrade --install wbs-platform infra/helm/wbs-platform \
          --namespace "$NAMESPACE" --create-namespace \
          -f infra/helm/wbs-platform/values-azure.yaml \
          --set api.image.repository="${ACR}/wbs-api" \
          --set portal.image.repository="${ACR}/wbs-portal" \
          --set externalPostgresql.host="$PGHOST" \
          "$@"
        ;;

      *)
        echo "알 수 없는 동작: $ACTION (infra|app)" >&2
        usage
        ;;
    esac
    ;;

  *)
    echo "알 수 없는 대상: $TARGET (onprem|azure)" >&2
    usage
    ;;
esac

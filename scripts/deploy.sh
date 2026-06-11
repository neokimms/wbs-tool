#!/usr/bin/env bash
# 옵션 기반 배포 진입점.
#   scripts/deploy.sh onprem up|down|status [--monitoring]
#   scripts/deploy.sh azure infra [--rg NAME] [--location LOC] [--env-name NAME]
#   scripts/deploy.sh azure app   [--rg NAME] [--namespace NS] [--env-name NAME]
#   scripts/deploy.sh azure aca infra|build|apps|all [--rg NAME] [--location LOC] [--env-name NAME] [--image-tag TAG]
#
# onprem    : 루트 docker-compose.yml 기반 온프레미스/노트북 설치
# azure     : infra/azure Bicep 인프라 프로비저닝 + infra/helm/wbs-platform values-azure.yaml Helm 배포 (AKS)
# azure aca : Azure Container Apps 기반 경량/저비용 배포 (AKS 대신, OpenProject 제외, scale-to-zero)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

usage() {
  sed -n '2,10p' "$0"
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

    ACA_ACTION=""
    if [[ "$ACTION" == "aca" ]]; then
      [[ $# -ge 1 ]] || usage
      ACA_ACTION="$1"; shift
    fi

    RG="${WBS_AZURE_RG:-wbs-platform-prod}"
    LOCATION="${WBS_AZURE_LOCATION:-koreacentral}"
    ENV_NAME="${WBS_AZURE_ENV_NAME:-prod}"
    NAMESPACE="${WBS_AZURE_NAMESPACE:-wbs}"
    IMAGE_TAG="${WBS_AZURE_ACA_IMAGE_TAG:-$(git rev-parse --short HEAD)}"

    while [[ $# -gt 0 ]]; do
      case "$1" in
        --rg) RG="$2"; shift 2 ;;
        --location) LOCATION="$2"; shift 2 ;;
        --env-name) ENV_NAME="$2"; shift 2 ;;
        --namespace) NAMESPACE="$2"; shift 2 ;;
        --image-tag) IMAGE_TAG="$2"; shift 2 ;;
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

      aca)
        : "${WBS_AZURE_POSTGRES_PASSWORD:?WBS_AZURE_POSTGRES_PASSWORD 환경변수에 PostgreSQL 관리자 비밀번호를 설정하세요}"

        DEPLOY_BASE="wbs-aca-${ENV_NAME}-base"
        DEPLOY_APPS="wbs-aca-${ENV_NAME}-apps"

        run_aca_infra() {
          az group create --name "$RG" --location "$LOCATION" >/dev/null

          az deployment group create \
            --resource-group "$RG" \
            --template-file infra/azure/containerapps-base.bicep \
            --parameters environmentName="$ENV_NAME" location="$LOCATION" \
            --parameters postgresAdminPassword="$WBS_AZURE_POSTGRES_PASSWORD" \
            --name "$DEPLOY_BASE"
        }

        run_aca_build() {
          local acr
          acr=$(az deployment group show -g "$RG" -n "$DEPLOY_BASE" --query properties.outputs.acrName.value -o tsv)
          az acr build -r "$acr" -t "wbs-api:$IMAGE_TAG" -f services/wbs-api/Dockerfile services/wbs-api
          az acr build -r "$acr" -t "wbs-portal:$IMAGE_TAG" -f apps/portal/Dockerfile apps/portal
        }

        run_aca_apps() {
          local acr_name acr_login_server env_id env_domain pg_fqdn
          acr_name=$(az deployment group show -g "$RG" -n "$DEPLOY_BASE" --query properties.outputs.acrName.value -o tsv)
          acr_login_server=$(az deployment group show -g "$RG" -n "$DEPLOY_BASE" --query properties.outputs.acrLoginServer.value -o tsv)
          env_id=$(az deployment group show -g "$RG" -n "$DEPLOY_BASE" --query properties.outputs.environmentId.value -o tsv)
          env_domain=$(az deployment group show -g "$RG" -n "$DEPLOY_BASE" --query properties.outputs.environmentDefaultDomain.value -o tsv)
          pg_fqdn=$(az deployment group show -g "$RG" -n "$DEPLOY_BASE" --query properties.outputs.postgresFqdn.value -o tsv)

          az deployment group create \
            --resource-group "$RG" \
            --template-file infra/azure/containerapps-apps.bicep \
            --parameters environmentName="$ENV_NAME" location="$LOCATION" \
            --parameters acrName="$acr_name" acrLoginServer="$acr_login_server" \
            --parameters environmentId="$env_id" environmentDefaultDomain="$env_domain" \
            --parameters postgresFqdn="$pg_fqdn" postgresAdminPassword="$WBS_AZURE_POSTGRES_PASSWORD" \
            --parameters apiImageTag="$IMAGE_TAG" portalImageTag="$IMAGE_TAG" \
            --name "$DEPLOY_APPS"

          echo "포털 URL: $(az deployment group show -g "$RG" -n "$DEPLOY_APPS" --query properties.outputs.portalUrl.value -o tsv)"
          echo "API URL : $(az deployment group show -g "$RG" -n "$DEPLOY_APPS" --query properties.outputs.apiUrl.value -o tsv)"
        }

        case "$ACA_ACTION" in
          infra) run_aca_infra ;;
          build) run_aca_build ;;
          apps) run_aca_apps ;;
          all)
            run_aca_infra
            run_aca_build
            run_aca_apps
            ;;
          *)
            echo "알 수 없는 동작: $ACA_ACTION (infra|build|apps|all)" >&2
            usage
            ;;
        esac
        ;;

      *)
        echo "알 수 없는 동작: $ACTION (infra|app|aca)" >&2
        usage
        ;;
    esac
    ;;

  *)
    echo "알 수 없는 대상: $TARGET (onprem|azure)" >&2
    usage
    ;;
esac

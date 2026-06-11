# Azure 인프라 (Bicep)

AX WBS Platform을 Azure에 배포하기 위한 최소 인프라를 Bicep으로 프로비저닝합니다.
이 디렉터리는 **Azure 옵션**일 때만 사용하며, 온프레미스/노트북 배포(`docker-compose.yml`,
`infra/helm/wbs-platform/values-onprem.yaml`)에는 영향을 주지 않습니다.

## 생성되는 리소스

| 리소스 | 모듈 | 용도 |
|---|---|---|
| Azure Container Registry (ACR) | `modules/acr.bicep` | `wbs-api`, `wbs-portal` 컨테이너 이미지 저장소 |
| Azure Database for PostgreSQL Flexible Server | `modules/postgresql.bicep` | `wbs_platform`, `openproject` 데이터베이스 (CLAUDE.md: PostgreSQL 단일 표준) |
| Azure Key Vault | `modules/keyvault.bicep` | DB 자격 증명·API 토큰·SMTP 비밀번호 보관 (RBAC 인증) |
| AKS (Azure Kubernetes Service) | `modules/aks.bicep` | `infra/helm/wbs-platform` Helm chart 실행, Workload Identity + OIDC issuer 활성화, ACR Pull 권한 자동 부여 |
| User Assigned Managed Identity | `modules/identity.bicep` | External Secrets Operator(ESO)가 Key Vault를 읽기 위한 Workload Identity (federated credential + Key Vault Secrets User 역할) |

OpenProject 자체는 이 Bicep으로 배포하지 않습니다 (CLAUDE.md 원칙: OpenProject 코어 무수정,
PM 엔진은 외부 어댑터로 연동). 동일 AKS에 OpenProject를 별도로 운영하거나, 기존 온프레미스
OpenProject를 `api.openprojectBaseUrl`로 계속 바라보게 구성할 수 있습니다.

## 사전 준비

```bash
az login
az account set --subscription <SUBSCRIPTION_ID>
az bicep install   # 최초 1회
```

## 1. 리소스 그룹 생성 및 배포

```bash
RG=wbs-platform-prod
LOCATION=koreacentral

az group create --name "$RG" --location "$LOCATION"

az deployment group create \
  --resource-group "$RG" \
  --template-file infra/azure/main.bicep \
  --parameters infra/azure/main.parameters.json \
  --parameters postgresAdminPassword='<강력한-비밀번호>' \
  --parameters environmentName=prod location="$LOCATION"
```

`main.parameters.json`의 `postgresAdminPassword`는 플레이스홀더이므로 **반드시**
`--parameters postgresAdminPassword=...`로 실제 값을 덮어쓰고, 실제 비밀번호는 git에 커밋하지
않습니다.

배포가 끝나면 출력값을 확인합니다.

```bash
az deployment group show -g "$RG" -n main --query properties.outputs -o json
```

주요 출력값: `acrLoginServer`, `postgresFqdn`, `keyVaultName`, `aksName`, `aksOidcIssuerUrl`,
`externalSecretsIdentityClientId`.

## 2. 컨테이너 이미지 빌드 & 푸시

```bash
ACR=$(az deployment group show -g "$RG" -n main --query properties.outputs.acrLoginServer.value -o tsv)
az acr build --registry "${ACR%%.*}" --image wbs-api:0.2.0 services/wbs-api
az acr build --registry "${ACR%%.*}" --image wbs-portal:0.2.0 -f apps/portal/Dockerfile apps/portal
```

## 3. AKS 자격 증명 가져오기

```bash
AKS=$(az deployment group show -g "$RG" -n main --query properties.outputs.aksName.value -o tsv)
az aks get-credentials --resource-group "$RG" --name "$AKS"
```

## 4. External Secrets Operator + Azure Key Vault 연동

ESO를 설치하고, Bicep이 만든 Workload Identity(`externalSecretsIdentityClientId`)를
ESO ServiceAccount에 연결합니다.

```bash
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets \
  --namespace external-secrets --create-namespace

CLIENT_ID=$(az deployment group show -g "$RG" -n main --query properties.outputs.externalSecretsIdentityClientId.value -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)
KEYVAULT=$(az deployment group show -g "$RG" -n main --query properties.outputs.keyVaultName.value -o tsv)

kubectl annotate serviceaccount external-secrets \
  -n external-secrets \
  azure.workload.identity/client-id="$CLIENT_ID" --overwrite

kubectl label serviceaccount external-secrets \
  -n external-secrets \
  azure.workload.identity/use=true --overwrite
```

`ClusterSecretStore`(`azure-keyvault-store`, `infra/helm/wbs-platform/values-azure.yaml`이
참조하는 이름)를 등록합니다.

```yaml
# cluster-secret-store-azure.yaml
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: azure-keyvault-store
spec:
  provider:
    azurekv:
      authType: WorkloadIdentity
      vaultUrl: "https://<KEYVAULT_NAME>.vault.azure.net"
      serviceAccountRef:
        name: external-secrets
        namespace: external-secrets
```

```bash
kubectl apply -f cluster-secret-store-azure.yaml
```

PostgreSQL 자격 증명(`wbs-platform-postgres-username/password/database`)은 Bicep이 Key Vault에
시드로 등록합니다. `OPENPROJECT_API_TOKEN`, `SMTP_PASSWORD` 등 추가 시크릿은 직접 등록합니다.

```bash
az keyvault secret set --vault-name "$KEYVAULT" --name wbs-platform-openproject-api-token --value '<OP_API_TOKEN>'
az keyvault secret set --vault-name "$KEYVAULT" --name wbs-platform-smtp-password --value '<SMTP_PASSWORD>'
az keyvault secret set --vault-name "$KEYVAULT" --name wbs-platform-database-url --value 'postgresql://...'
```

> Bicep으로 Key Vault에 시드 시크릿을 쓰려면 배포 주체(사용자/서비스 주체)에게 해당 Key Vault에 대한
> **Key Vault Secrets Officer** 이상의 RBAC 역할이 있어야 합니다. 권한이 없다면 `seedSecrets`
> 파라미터를 비워두고 위 `az keyvault secret set` 명령으로 직접 등록하세요.

## 5. ingress-nginx 설치 (선택, AGIC 등 대체 가능)

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace
```

## 6. WBS 플랫폼 Helm 배포

`infra/helm/wbs-platform/values-azure.yaml`의 `<ACR_LOGIN_SERVER>`, `<POSTGRES_FLEXIBLE_SERVER_FQDN>`,
`<your-domain>` 플레이스홀더를 1단계 출력값으로 교체하거나 `--set`으로 덮어씁니다.

```bash
ACR=$(az deployment group show -g "$RG" -n main --query properties.outputs.acrLoginServer.value -o tsv)
PGHOST=$(az deployment group show -g "$RG" -n main --query properties.outputs.postgresFqdn.value -o tsv)

helm upgrade --install wbs-platform infra/helm/wbs-platform \
  --namespace wbs --create-namespace \
  -f infra/helm/wbs-platform/values-azure.yaml \
  --set api.image.repository="${ACR}/wbs-api" \
  --set portal.image.repository="${ACR}/wbs-portal" \
  --set externalPostgresql.host="$PGHOST" \
  --set api.portalOrigin='https://wbs.<your-domain>' \
  --set portal.apiBaseUrl='https://wbs-api.<your-domain>'
```

## 참고 사항

- **PostgreSQL 버전**: `postgresVersion` 기본값은 `16`입니다. 리전에서 PostgreSQL 17 Flexible
  Server가 가능하면 `--parameters postgresVersion=17`로 override 하세요.
- **고가용성/백업**: `postgresHighAvailability=true`로 Zone Redundant HA를 켤 수 있습니다.
  Flexible Server의 자동 백업(`backupRetentionDays: 7`)과 별개로, 애플리케이션 레벨 백업은
  `services/wbs-api`의 백업 스케줄러(`BACKUP_DIR`, `scripts/backup-postgres.sh`)를 그대로
  사용할 수 있도록 `api.backupVolume`을 Azure Files 기반 PVC로 구성하는 것을 권장합니다.
- **네트워크**: 기본값은 PostgreSQL Flexible Server에 "Allow Azure services" 방화벽 규칙을
  적용한 퍼블릭 액세스입니다. 운영 환경에서는 VNet 통합(Private Access)으로 전환하는 것을
  권장하며, 이 경우 AKS 서브넷과 동일 VNet에 Private DNS Zone을 연결해야 합니다(이 Bicep은
  퍼블릭 액세스 기준 최소 구성이며, VNet 통합은 향후 확장 지점입니다).
- **OpenProject**: 이 인프라는 WBS API/포털용 AKS·DB·Key Vault만 프로비저닝합니다. OpenProject는
  기존 온프레미스 인스턴스를 계속 사용하거나, 별도 Helm chart/VM으로 운영 후
  `api.openprojectBaseUrl`로 연결하세요.

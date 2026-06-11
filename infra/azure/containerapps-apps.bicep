targetScope = 'resourceGroup'

@description('환경 이름 (예: dev, demo) - 리소스 이름에 포함됨')
param environmentName string = 'dev'

@description('배포 리전 (containerapps-base.bicep과 동일해야 함)')
param location string = resourceGroup().location

@description('containerapps-base.bicep 출력값: ACR 이름')
param acrName string

@description('containerapps-base.bicep 출력값: ACR 로그인 서버')
param acrLoginServer string

@description('containerapps-base.bicep 출력값: Container Apps 환경 리소스 ID')
param environmentId string

@description('containerapps-base.bicep 출력값: Container Apps 환경 기본 도메인')
param environmentDefaultDomain string

@description('containerapps-base.bicep 출력값: PostgreSQL FQDN')
param postgresFqdn string

@description('PostgreSQL 관리자 로그인 ID (containerapps-base.bicep과 동일)')
param postgresAdminLogin string = 'wbsadmin'

@description('PostgreSQL 관리자 비밀번호 (containerapps-base.bicep과 동일)')
@secure()
param postgresAdminPassword string

@description('wbs-api 컨테이너 이미지 태그 (ACR에 미리 push되어 있어야 함)')
param apiImageTag string = 'latest'

@description('wbs-portal 컨테이너 이미지 태그 (ACR에 미리 push되어 있어야 함)')
param portalImageTag string = 'latest'

@description('wbs-api 최소 복제본 수 (0 = 트래픽 없을 때 비용 0, cold start 발생)')
param apiMinReplicas int = 0

@description('wbs-portal 최소 복제본 수')
param portalMinReplicas int = 0

var tags = {
  project: 'wbs-platform'
  environment: environmentName
  deployTarget: 'container-apps'
}

// Container App 이름은 고정값이므로 FQDN을 배포 전에 결정적으로 계산할 수 있음
// (Azure Container Apps FQDN 형식: <app-name>.<environment-default-domain>)
var apiFqdn = 'wbs-api.${environmentDefaultDomain}'
var portalFqdn = 'wbs-portal.${environmentDefaultDomain}'

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: acrName
}

module wbsApi 'modules/containerapp.bicep' = {
  name: 'wbs-api-app'
  params: {
    name: 'wbs-api'
    location: location
    environmentId: environmentId
    image: '${acrLoginServer}/wbs-api:${apiImageTag}'
    targetPort: 8000
    minReplicas: apiMinReplicas
    maxReplicas: 1
    cpu: '0.5'
    memory: '1Gi'
    registryServer: acrLoginServer
    registryUsername: acrName
    registryPasswordSecretName: 'acr-password'
    secrets: [
      {
        name: 'acr-password'
        value: acr.listCredentials().passwords[0].value
      }
      {
        name: 'database-url'
        value: 'postgresql://${postgresAdminLogin}:${postgresAdminPassword}@${postgresFqdn}:5432/wbs_platform?sslmode=require'
      }
    ]
    env: [
      { name: 'DATABASE_URL', secretRef: 'database-url' }
      { name: 'PM_ENGINE_ADAPTER', value: 'mock' }
      { name: 'OPENPROJECT_SYNC_ENABLED', value: 'false' }
      { name: 'PORTAL_ORIGIN', value: 'https://${portalFqdn}' }
      { name: 'WBS_ALLOW_FILE_ORIGIN', value: 'false' }
      { name: 'WBS_RUN_MIGRATIONS_ON_STARTUP', value: 'true' }
      { name: 'MULTITENANCY_ENABLED', value: 'true' }
      // 스케줄러는 scale-to-zero(minReplicas=0)와 맞지 않으므로 기본 비활성화.
      // 주간 리포트 메일 발송이 필요하면 apiMinReplicas=1로 올리고 true로 변경
      { name: 'WBS_REPORT_SCHEDULER_ENABLED', value: 'false' }
    ]
    tags: tags
  }
}

module wbsPortal 'modules/containerapp.bicep' = {
  name: 'wbs-portal-app'
  params: {
    name: 'wbs-portal'
    location: location
    environmentId: environmentId
    image: '${acrLoginServer}/wbs-portal:${portalImageTag}'
    targetPort: 80
    minReplicas: portalMinReplicas
    maxReplicas: 1
    cpu: '0.25'
    memory: '0.5Gi'
    registryServer: acrLoginServer
    registryUsername: acrName
    registryPasswordSecretName: 'acr-password'
    secrets: [
      {
        name: 'acr-password'
        value: acr.listCredentials().passwords[0].value
      }
    ]
    env: [
      { name: 'WBS_API_BASE_URL', value: 'https://${apiFqdn}' }
    ]
    tags: tags
  }
}

output apiUrl string = 'https://${wbsApi.outputs.fqdn}'
output portalUrl string = 'https://${wbsPortal.outputs.fqdn}'

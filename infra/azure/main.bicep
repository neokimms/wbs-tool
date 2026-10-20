targetScope = 'resourceGroup'

@description('환경 이름 (예: dev, staging, prod) - 리소스 이름에 포함됨')
param environmentName string = 'dev'

@description('배포 리전')
param location string = resourceGroup().location

@description('PostgreSQL Flexible Server 관리자 로그인 ID')
param postgresAdminLogin string = 'wbsadmin'

@description('PostgreSQL Flexible Server 관리자 비밀번호')
@secure()
param postgresAdminPassword string

@description('PostgreSQL 메이저 버전 (리전에서 17 Flexible Server를 지원하면 17로 변경 가능)')
param postgresVersion string = '16'

@description('PostgreSQL SKU 이름')
param postgresSkuName string = 'Standard_B1ms'

@allowed([
  'Burstable'
  'GeneralPurpose'
  'MemoryOptimized'
])
@description('PostgreSQL SKU 티어')
param postgresSkuTier string = 'Burstable'

@description('PostgreSQL 스토리지 크기(GB)')
param postgresStorageSizeGB int = 32

@description('PostgreSQL 고가용성(Zone Redundant) 활성화 여부')
param postgresHighAvailability bool = false

@description('AKS 시스템 노드 풀 VM 크기')
param aksNodeVmSize string = 'Standard_D2s_v5'

@description('AKS 시스템 노드 풀 노드 수')
param aksNodeCount int = 3

@allowed([
  'Basic'
  'Standard'
  'Premium'
])
@description('ACR SKU')
param acrSku string = 'Standard'

@description('External Secrets Operator가 실행되는 Kubernetes 네임스페이스')
param esoNamespace string = 'external-secrets'

@description('External Secrets Operator ServiceAccount 이름')
param esoServiceAccountName string = 'external-secrets'

var resourceToken = uniqueString(resourceGroup().id, environmentName)
var tags = {
  project: 'wbs-platform'
  environment: environmentName
}

module acr 'modules/acr.bicep' = {
  name: 'wbs-acr'
  params: {
    name: 'wbsacr${resourceToken}'
    location: location
    sku: acrSku
    tags: tags
  }
}

module postgres 'modules/postgresql.bicep' = {
  name: 'wbs-postgres'
  params: {
    name: 'wbs-pg-${environmentName}-${resourceToken}'
    location: location
    administratorLogin: postgresAdminLogin
    administratorLoginPassword: postgresAdminPassword
    postgresVersion: postgresVersion
    skuName: postgresSkuName
    skuTier: postgresSkuTier
    storageSizeGB: postgresStorageSizeGB
    highAvailabilityEnabled: postgresHighAvailability
    tags: tags
  }
}

module keyVault 'modules/keyvault.bicep' = {
  name: 'wbs-keyvault'
  params: {
    name: 'wbs-kv-${resourceToken}'
    location: location
    tags: tags
    // ESO ExternalSecret(extraKeys)이 동기화하는 PostgreSQL 자격 증명을 시드로 등록
    seedSecrets: {
      'wbs-platform-postgres-username': postgresAdminLogin
      'wbs-platform-postgres-password': postgresAdminPassword
      'wbs-platform-postgres-database': 'wbs_platform'
    }
  }
}

module aks 'modules/aks.bicep' = {
  name: 'wbs-aks'
  params: {
    name: 'wbs-aks-${environmentName}-${resourceToken}'
    location: location
    nodeVmSize: aksNodeVmSize
    nodeCount: aksNodeCount
    acrName: acr.outputs.name
    tags: tags
  }
}

module externalSecretsIdentity 'modules/identity.bicep' = {
  name: 'wbs-eso-identity'
  params: {
    name: 'wbs-eso-${environmentName}-${resourceToken}'
    location: location
    oidcIssuerUrl: aks.outputs.oidcIssuerUrl
    namespace: esoNamespace
    serviceAccountName: esoServiceAccountName
    keyVaultName: keyVault.outputs.name
    tags: tags
  }
}

output acrLoginServer string = acr.outputs.loginServer
output postgresFqdn string = postgres.outputs.fqdn
output postgresServerName string = postgres.outputs.name
output keyVaultName string = keyVault.outputs.name
output aksName string = aks.outputs.name
output aksOidcIssuerUrl string = aks.outputs.oidcIssuerUrl
output externalSecretsIdentityClientId string = externalSecretsIdentity.outputs.clientId

targetScope = 'resourceGroup'

@description('환경 이름 (예: dev, demo) - 리소스 이름에 포함됨')
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

@description('PostgreSQL SKU 이름 - 비용 절감을 위해 Burstable B1ms 기본값')
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

@allowed([
  'Basic'
  'Standard'
  'Premium'
])
@description('ACR SKU - Container Apps용 단일 리전 데모는 Basic으로 충분')
param acrSku string = 'Basic'

var resourceToken = uniqueString(resourceGroup().id, environmentName)
var tags = {
  project: 'wbs-platform'
  environment: environmentName
  deployTarget: 'container-apps'
}

module acr 'modules/acr.bicep' = {
  name: 'wbs-aca-acr'
  params: {
    name: 'wbsacaacr${resourceToken}'
    location: location
    sku: acrSku
    adminUserEnabled: true
    tags: tags
  }
}

module postgres 'modules/postgresql.bicep' = {
  name: 'wbs-aca-postgres'
  params: {
    name: 'wbs-aca-pg-${environmentName}-${resourceToken}'
    location: location
    administratorLogin: postgresAdminLogin
    administratorLoginPassword: postgresAdminPassword
    postgresVersion: postgresVersion
    skuName: postgresSkuName
    skuTier: postgresSkuTier
    storageSizeGB: postgresStorageSizeGB
    // OpenProject는 이번 Container Apps 배포 범위에서 제외 (PM_ENGINE_ADAPTER=mock)
    databaseNames: [
      'wbs_platform'
    ]
    tags: tags
  }
}

module env 'modules/containerapps-env.bicep' = {
  name: 'wbs-aca-env'
  params: {
    name: 'wbs-aca-env-${environmentName}-${resourceToken}'
    location: location
    logAnalyticsName: 'wbs-aca-log-${environmentName}-${resourceToken}'
    tags: tags
  }
}

output acrName string = acr.outputs.name
output acrLoginServer string = acr.outputs.loginServer
output postgresFqdn string = postgres.outputs.fqdn
output postgresServerName string = postgres.outputs.name
output environmentId string = env.outputs.id
output environmentDefaultDomain string = env.outputs.defaultDomain

@description('PostgreSQL Flexible Server 이름 (전역 고유, 소문자/숫자/하이픈)')
param name string

@description('배포 리전')
param location string

@description('관리자 로그인 ID')
param administratorLogin string

@description('관리자 비밀번호')
@secure()
param administratorLoginPassword string

@description('SKU 이름 (예: Standard_B1ms, Standard_D2ds_v4)')
param skuName string = 'Standard_B1ms'

@allowed([
  'Burstable'
  'GeneralPurpose'
  'MemoryOptimized'
])
@description('SKU 티어')
param skuTier string = 'Burstable'

@description('스토리지 크기(GB)')
param storageSizeGB int = 32

@description('PostgreSQL 메이저 버전 (CLAUDE.md: PostgreSQL 단일 표준 — 17 권장, 리전별 미지원 시 16)')
param postgresVersion string = '16'

@description('생성할 데이터베이스 이름 목록 (wbs_platform: 확장 API, openproject: PM 엔진)')
param databaseNames array = [
  'wbs_platform'
  'openproject'
]

@description('Azure 서비스(AKS 등)의 접근을 허용할지 여부 - VNet 통합을 사용하지 않는 경우 true')
param allowAzureServices bool = true

@description('CREATE EXTENSION 허용 목록 (Azure Database for PostgreSQL은 azure.extensions 서버 파라미터에 등록된 확장만 설치 가능). wbs-api 마이그레이션(001_init.sql)이 pgcrypto, citext를 사용')
param allowedExtensions string = 'pgcrypto,citext'

@description('고가용성(Zone Redundant) 활성화 여부 - 운영 환경 권장')
param highAvailabilityEnabled bool = false

param tags object = {}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2023-03-01-preview' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: skuName
    tier: skuTier
  }
  properties: {
    version: postgresVersion
    administratorLogin: administratorLogin
    administratorLoginPassword: administratorLoginPassword
    storage: {
      storageSizeGB: storageSizeGB
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: highAvailabilityEnabled ? 'ZoneRedundant' : 'Disabled'
    }
  }
}

resource databases 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-03-01-preview' = [for dbName in databaseNames: {
  parent: postgres
  name: dbName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}]

resource allowAzureServicesRule 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-03-01-preview' = if (allowAzureServices) {
  parent: postgres
  name: 'AllowAllAzureServicesAndResourcesWithinAzureIps'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource extensionsConfig 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2023-03-01-preview' = {
  parent: postgres
  name: 'azure.extensions'
  properties: {
    value: allowedExtensions
    source: 'user-override'
  }
}

output fqdn string = postgres.properties.fullyQualifiedDomainName
output name string = postgres.name

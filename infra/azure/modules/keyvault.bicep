@description('Key Vault 이름 (전역 고유, 3~24자, 문자로 시작)')
param name string

@description('배포 리전')
param location string

@description('Microsoft Entra 테넌트 ID')
param tenantId string = subscription().tenantId

@description('RBAC 기반 권한 부여 사용 여부 (External Secrets Operator의 Workload Identity에 Key Vault Secrets User 역할 부여 전제)')
param enableRbacAuthorization bool = true

param tags object = {}

@description('초기 시드 시크릿(이름-값 쌍). 배포 주체에게 Key Vault Secrets Officer 이상 권한이 필요. 운영에서는 az keyvault secret set으로 직접 등록 권장')
@secure()
param seedSecrets object = {}

resource kv 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    tenantId: tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: enableRbacAuthorization
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    publicNetworkAccess: 'Enabled'
  }
}

resource seed 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = [for item in items(seedSecrets): {
  parent: kv
  name: item.key
  properties: {
    value: item.value
  }
}]

output id string = kv.id
output name string = kv.name
output uri string = kv.properties.vaultUri

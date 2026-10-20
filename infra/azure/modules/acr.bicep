@description('Azure Container Registry 이름 (전역 고유, 영숫자만 5~50자)')
param name string

@description('배포 리전')
param location string

@allowed([
  'Basic'
  'Standard'
  'Premium'
])
@description('ACR SKU')
param sku string = 'Standard'

@description('Admin 사용자 활성화 여부 - AKS는 managed identity(AcrPull)를 쓰므로 기본 false. Container Apps에서 레지스트리 시크릿으로 간단히 인증할 때만 true로 설정')
param adminUserEnabled bool = false

param tags object = {}

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: sku
  }
  properties: {
    adminUserEnabled: adminUserEnabled
  }
}

output id string = acr.id
output name string = acr.name
output loginServer string = acr.properties.loginServer

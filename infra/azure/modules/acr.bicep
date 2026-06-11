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

param tags object = {}

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: sku
  }
  properties: {
    adminUserEnabled: false
  }
}

output id string = acr.id
output name string = acr.name
output loginServer string = acr.properties.loginServer

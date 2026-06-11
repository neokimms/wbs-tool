@description('AKS 클러스터 이름')
param name string

@description('배포 리전')
param location string

@description('Kubernetes 버전 (비워두면 Azure 기본값 사용)')
param kubernetesVersion string = ''

@description('시스템 노드 풀 VM 크기')
param nodeVmSize string = 'Standard_D2s_v5'

@description('시스템 노드 풀 노드 수')
param nodeCount int = 3

@description('AcrPull 역할을 부여할 ACR 이름 (동일 리소스 그룹). 비워두면 역할 부여 생략')
param acrName string = ''

param tags object = {}

resource aks 'Microsoft.ContainerService/managedClusters@2023-10-01' = {
  name: name
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    dnsPrefix: name
    kubernetesVersion: empty(kubernetesVersion) ? null : kubernetesVersion
    agentPoolProfiles: [
      {
        name: 'system'
        count: nodeCount
        vmSize: nodeVmSize
        mode: 'System'
        osType: 'Linux'
        type: 'VirtualMachineScaleSets'
      }
    ]
    networkProfile: {
      networkPlugin: 'azure'
      networkPolicy: 'azure'
    }
    // External Secrets Operator가 Azure Key Vault에 접근할 때 사용하는 Workload Identity용
    oidcIssuerProfile: {
      enabled: true
    }
    securityProfile: {
      workloadIdentity: {
        enabled: true
      }
    }
  }
}

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = if (!empty(acrName)) {
  name: acrName
}

@description('AcrPull 역할 정의 ID')
var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'

resource acrPullRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(acrName)) {
  name: guid(acr.id, aks.id, acrPullRoleId)
  scope: acr
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
    principalId: aks.properties.identityProfile.kubeletidentity.objectId
    principalType: 'ServicePrincipal'
  }
}

output name string = aks.name
output controlPlaneFqdn string = aks.properties.fqdn
output oidcIssuerUrl string = aks.properties.oidcIssuerProfile.issuerURL
output kubeletIdentityObjectId string = aks.properties.identityProfile.kubeletidentity.objectId

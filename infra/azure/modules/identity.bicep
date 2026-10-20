@description('User Assigned Managed Identity 이름 (External Secrets Operator용)')
param name string

@description('배포 리전')
param location string

@description('AKS OIDC 발급자 URL (aks.bicep 출력값: oidcIssuerUrl)')
param oidcIssuerUrl string

@description('External Secrets Operator가 실행되는 Kubernetes 네임스페이스')
param namespace string = 'external-secrets'

@description('External Secrets Operator ServiceAccount 이름')
param serviceAccountName string = 'external-secrets'

@description('Key Vault Secrets User 역할을 부여할 Key Vault 이름 (동일 리소스 그룹)')
param keyVaultName string

param tags object = {}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: name
  location: location
  tags: tags
}

resource federatedCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: identity
  name: 'eso-federated-credential'
  properties: {
    issuer: oidcIssuerUrl
    subject: 'system:serviceaccount:${namespace}:${serviceAccountName}'
    audiences: [
      'api://AzureADTokenExchange'
    ]
  }
}

resource kv 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

@description('Key Vault Secrets User 역할 정의 ID')
var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'

resource kvSecretsUserRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(kv.id, identity.id, keyVaultSecretsUserRoleId)
  scope: kv
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUserRoleId)
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

output clientId string = identity.properties.clientId
output principalId string = identity.properties.principalId
output id string = identity.id

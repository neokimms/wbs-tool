@description('Container App 이름 (Container Apps 환경 내 고유, FQDN의 첫 라벨로 사용됨)')
param name string

@description('배포 리전')
param location string

@description('Container Apps 환경 리소스 ID')
param environmentId string

@description('컨테이너 이미지 전체 경로 (예: myacr.azurecr.io/wbs-api:latest)')
param image string

@description('컨테이너가 수신 대기하는 포트')
param targetPort int

@description('컨테이너 환경 변수 (env 항목 배열: { name, value } 또는 { name, secretRef })')
param env array = []

@description('Container App 시크릿 ({ name, value } 배열) - 호출 측에서 listCredentials() 등 민감값을 직접 전달')
param secrets array = []

@description('컨테이너 레지스트리 서버 (비우면 레지스트리 인증 생략)')
param registryServer string = ''

@description('컨테이너 레지스트리 사용자명')
param registryUsername string = ''

@description('레지스트리 비밀번호를 담은 secrets 항목의 이름')
param registryPasswordSecretName string = ''

@description('최소 복제본 수 (0 = 트래픽 없을 때 0으로 스케일, 비용 절감)')
param minReplicas int = 0

@description('최대 복제본 수')
param maxReplicas int = 1

@description('컨테이너 CPU 코어 수 (예: "0.25", "0.5")')
param cpu string = '0.5'

@description('컨테이너 메모리 (예: "0.5Gi", "1Gi")')
param memory string = '1Gi'

param tags object = {}

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    environmentId: environmentId
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: targetPort
        transport: 'auto'
        allowInsecure: false
      }
      secrets: secrets
      registries: empty(registryServer) ? [] : [
        {
          server: registryServer
          username: registryUsername
          passwordSecretRef: registryPasswordSecretName
        }
      ]
    }
    template: {
      containers: [
        {
          name: name
          image: image
          resources: {
            cpu: json(cpu)
            memory: memory
          }
          env: env
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
      }
    }
  }
}

output fqdn string = containerApp.properties.configuration.ingress.fqdn
output name string = containerApp.name

targetScope = 'resourceGroup'

@description('Short environment name such as dev, staging, or prod.')
param environmentName string

@description('Azure region for integration resources.')
param location string = resourceGroup().location

@secure()
@description('Convex callback HMAC secret. Rotate through Key Vault.')
param convexCallbackSecret string

@secure()
@description('Bearer token used by Convex to call the Azure command boundary.')
param tieCamelServiceToken string

@description('Convex HTTP callback URL for publication results.')
param convexPublicationCallbackUrl string

var suffix = uniqueString(subscription().subscriptionId, resourceGroup().id, environmentName)
var normalizedEnvironment = toLower(replace(environmentName, '-', ''))
var storageName = take('tc${normalizedEnvironment}${suffix}', 24)
var serviceBusName = 'tiecamel-${environmentName}-${suffix}'
var keyVaultName = take('tc-${environmentName}-${suffix}', 24)
var logName = 'tiecamel-${environmentName}-logs'
var insightsName = 'tiecamel-${environmentName}-insights'
var environmentResourceName = 'tiecamel-${environmentName}-containers'

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  kind: 'StorageV2'
  sku: {
    name: 'Standard_GRS'
  }
  properties: {
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    publicNetworkAccess: 'Enabled'
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    deleteRetentionPolicy: {
      enabled: true
      days: 30
    }
    containerDeleteRetentionPolicy: {
      enabled: true
      days: 30
    }
  }
}

resource quarantine 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'quarantine'
  properties: {
    publicAccess: 'None'
  }
}

resource processed 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'processed'
  properties: {
    publicAccess: 'None'
  }
}

resource evidence 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'evidence'
  properties: {
    publicAccess: 'None'
  }
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    tenantId: tenant().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enablePurgeProtection: true
    softDeleteRetentionInDays: 90
    publicNetworkAccess: 'Enabled'
  }
}

resource callbackSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'convex-callback-secret'
  properties: {
    value: convexCallbackSecret
  }
}

resource commandToken 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'tiecamel-service-token'
  properties: {
    value: tieCamelServiceToken
  }
}

resource serviceBus 'Microsoft.ServiceBus/namespaces@2024-01-01' = {
  name: serviceBusName
  location: location
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
  properties: {
    minimumTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
    disableLocalAuth: true
  }
}

resource publicationsQueue 'Microsoft.ServiceBus/namespaces/queues@2024-01-01' = {
  parent: serviceBus
  name: 'publications'
  properties: {
    lockDuration: 'PT5M'
    maxDeliveryCount: 10
    deadLetteringOnMessageExpiration: true
    duplicateDetectionHistoryTimeWindow: 'P7D'
    requiresDuplicateDetection: true
  }
}

resource processingQueue 'Microsoft.ServiceBus/namespaces/queues@2024-01-01' = {
  parent: serviceBus
  name: 'processing'
  properties: {
    lockDuration: 'PT5M'
    maxDeliveryCount: 5
    deadLetteringOnMessageExpiration: true
  }
}

resource reconciliationQueue 'Microsoft.ServiceBus/namespaces/queues@2024-01-01' = {
  parent: serviceBus
  name: 'reconciliation'
  properties: {
    lockDuration: 'PT2M'
    maxDeliveryCount: 10
    deadLetteringOnMessageExpiration: true
  }
}

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logName
  location: location
  properties: {
    retentionInDays: 90
  }
}

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: insightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logs.id
  }
}

resource containerEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: environmentResourceName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: listKeys(logs.id, logs.apiVersion).primarySharedKey
      }
    }
  }
}

output storageBlobUrl string = storage.properties.primaryEndpoints.blob
output keyVaultUrl string = keyVault.properties.vaultUri
output serviceBusNamespace string = '${serviceBus.name}.servicebus.windows.net'
output containerAppsEnvironmentId string = containerEnvironment.id
output applicationInsightsConnectionString string = insights.properties.ConnectionString
output callbackUrl string = convexPublicationCallbackUrl

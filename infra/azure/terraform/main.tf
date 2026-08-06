data "azurerm_client_config" "current" {}

check "evidence_policy" {
  assert {
    condition     = !var.lock_evidence_policy || var.evidence_retention_days > 0
    error_message = "A locked evidence policy requires a non-zero retention period."
  }
}

resource "random_id" "suffix" {
  byte_length = 4
}

locals {
  suffix              = lower(random_id.suffix.hex)
  normalized_env      = replace(var.environment, "-", "")
  resource_group_name = var.resource_group_name != "" ? var.resource_group_name : "rg-tiecamel-${var.environment}"
  records_storage     = substr("tcrecords${local.normalized_env}${local.suffix}", 0, 24)
  functions_storage   = substr("tcfunc${local.normalized_env}${local.suffix}", 0, 24)
  common_tags = merge({
    application = "tiecamel"
    environment = var.environment
    managed-by  = "terraform"
  }, var.tags)
}

resource "azurerm_resource_group" "this" {
  name     = local.resource_group_name
  location = var.location
  tags     = local.common_tags
}

resource "azurerm_storage_account" "records" {
  name                              = local.records_storage
  resource_group_name               = azurerm_resource_group.this.name
  location                          = azurerm_resource_group.this.location
  account_tier                      = "Standard"
  account_replication_type          = var.environment == "prod" ? "GRS" : "LRS"
  min_tls_version                   = "TLS1_2"
  allow_nested_items_to_be_public   = false
  shared_access_key_enabled         = false
  public_network_access_enabled     = true
  infrastructure_encryption_enabled = var.environment == "prod"

  blob_properties {
    versioning_enabled = true

    delete_retention_policy {
      days = 30
    }

    container_delete_retention_policy {
      days = 30
    }
  }

  tags = local.common_tags
}

resource "azurerm_role_assignment" "records_blob_deployer" {
  scope                = azurerm_storage_account.records.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = data.azurerm_client_config.current.object_id
}

resource "azurerm_storage_container" "records" {
  for_each = toset(["quarantine", "processed", "evidence"])

  name                  = each.key
  storage_account_id    = azurerm_storage_account.records.id
  container_access_type = "private"

  depends_on = [azurerm_role_assignment.records_blob_deployer]
}

resource "azurerm_storage_container_immutability_policy" "evidence" {
  count = var.evidence_retention_days > 0 ? 1 : 0

  storage_container_resource_manager_id = azurerm_storage_container.records["evidence"].id
  immutability_period_in_days           = var.evidence_retention_days
  protected_append_writes_enabled       = false
  protected_append_writes_all_enabled   = false
  locked                                = var.lock_evidence_policy
}

resource "azurerm_storage_account" "functions" {
  name                            = local.functions_storage
  resource_group_name             = azurerm_resource_group.this.name
  location                        = azurerm_resource_group.this.location
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  min_tls_version                 = "TLS1_2"
  allow_nested_items_to_be_public = false
  shared_access_key_enabled       = true
  tags                            = local.common_tags
}

resource "azurerm_key_vault" "this" {
  name                       = substr("kv-tc-${var.environment}-${local.suffix}", 0, 24)
  resource_group_name        = azurerm_resource_group.this.name
  location                   = azurerm_resource_group.this.location
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  rbac_authorization_enabled = true
  purge_protection_enabled   = true
  soft_delete_retention_days = 90
  tags                       = local.common_tags
}

resource "azurerm_role_assignment" "key_vault_deployer" {
  scope                = azurerm_key_vault.this.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = data.azurerm_client_config.current.object_id
}

resource "azurerm_key_vault_secret" "callback" {
  name         = "convex-callback-secret"
  value        = var.convex_callback_secret
  key_vault_id = azurerm_key_vault.this.id

  depends_on = [azurerm_role_assignment.key_vault_deployer]
}

resource "azurerm_key_vault_secret" "service_token" {
  name         = "tiecamel-service-token"
  value        = var.tiecamel_service_token
  key_vault_id = azurerm_key_vault.this.id

  depends_on = [azurerm_role_assignment.key_vault_deployer]
}

resource "azurerm_key_vault_secret" "solana_signer" {
  count = var.solana_signer_secret != "" ? 1 : 0

  name         = "solana-integrity-signer"
  value        = var.solana_signer_secret
  key_vault_id = azurerm_key_vault.this.id

  depends_on = [azurerm_role_assignment.key_vault_deployer]
}

resource "azurerm_servicebus_namespace" "this" {
  name                          = "sb-tiecamel-${var.environment}-${local.suffix}"
  resource_group_name           = azurerm_resource_group.this.name
  location                      = azurerm_resource_group.this.location
  sku                           = "Standard"
  minimum_tls_version           = "1.2"
  local_auth_enabled            = false
  public_network_access_enabled = true
  tags                          = local.common_tags
}

resource "azurerm_servicebus_queue" "work" {
  for_each = {
    processing     = 5
    publications   = 10
    reconciliation = 10
    anchors        = 10
  }

  name                                    = each.key
  namespace_id                            = azurerm_servicebus_namespace.this.id
  lock_duration                           = each.key == "reconciliation" ? "PT2M" : "PT5M"
  max_delivery_count                      = each.value
  dead_lettering_on_message_expiration    = true
  requires_duplicate_detection            = true
  duplicate_detection_history_time_window = "P1D"
}

resource "azurerm_log_analytics_workspace" "this" {
  name                = "log-tiecamel-${var.environment}-${local.suffix}"
  resource_group_name = azurerm_resource_group.this.name
  location            = azurerm_resource_group.this.location
  sku                 = "PerGB2018"
  retention_in_days   = 90
  tags                = local.common_tags
}

resource "azurerm_application_insights" "this" {
  name                = "appi-tiecamel-${var.environment}-${local.suffix}"
  resource_group_name = azurerm_resource_group.this.name
  location            = azurerm_resource_group.this.location
  workspace_id        = azurerm_log_analytics_workspace.this.id
  application_type    = "web"
  tags                = local.common_tags
}

resource "azurerm_monitor_metric_alert" "service_bus_dead_letters" {
  name                = "tiecamel-${var.environment}-service-bus-dead-letters"
  resource_group_name = azurerm_resource_group.this.name
  scopes              = [azurerm_servicebus_namespace.this.id]
  description         = "A TieCamel processing, publication, reconciliation, or anchor message reached a dead-letter queue."
  severity            = 1
  frequency           = "PT5M"
  window_size         = "PT5M"

  criteria {
    metric_namespace = "Microsoft.ServiceBus/namespaces"
    metric_name      = "DeadletteredMessages"
    aggregation      = "Maximum"
    operator         = "GreaterThan"
    threshold        = 0
  }

  tags = local.common_tags
}

resource "azurerm_service_plan" "functions" {
  name                = "asp-tiecamel-${var.environment}-${local.suffix}"
  resource_group_name = azurerm_resource_group.this.name
  location            = azurerm_resource_group.this.location
  os_type             = "Linux"
  sku_name            = "Y1"
  tags                = local.common_tags
}

resource "azurerm_linux_function_app" "integrations" {
  name                       = "func-tiecamel-${var.environment}-${local.suffix}"
  resource_group_name        = azurerm_resource_group.this.name
  location                   = azurerm_resource_group.this.location
  service_plan_id            = azurerm_service_plan.functions.id
  storage_account_name       = azurerm_storage_account.functions.name
  storage_account_access_key = azurerm_storage_account.functions.primary_access_key
  https_only                 = true

  identity {
    type = "SystemAssigned"
  }

  site_config {
    application_insights_connection_string = azurerm_application_insights.this.connection_string
    application_insights_key               = azurerm_application_insights.this.instrumentation_key
    minimum_tls_version                    = "1.2"

    application_stack {
      node_version = "22"
    }
  }

  app_settings = {
    FUNCTIONS_WORKER_RUNTIME                              = "node"
    WEBSITE_RUN_FROM_PACKAGE                              = "1"
    AZURE_STORAGE_BLOB_URL                                = azurerm_storage_account.records.primary_blob_endpoint
    AZURE_SERVICE_BUS_NAMESPACE                           = "${azurerm_servicebus_namespace.this.name}.servicebus.windows.net"
    AZURE_SERVICE_BUS_CONNECTION__fullyQualifiedNamespace = "${azurerm_servicebus_namespace.this.name}.servicebus.windows.net"
    AZURE_KEY_VAULT_URL                                   = azurerm_key_vault.this.vault_uri
    AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT                  = var.enable_document_intelligence ? azurerm_cognitive_account.document_intelligence[0].endpoint : ""
    CONVEX_PUBLICATION_CALLBACK_URL                       = var.convex_publication_callback_url
    CONVEX_PROCESSING_CALLBACK_URL                        = var.convex_processing_callback_url
    CONVEX_INTEGRITY_CALLBACK_URL                         = var.convex_integrity_callback_url
    CONVEX_CALLBACK_SECRET                                = "@Microsoft.KeyVault(VaultName=${azurerm_key_vault.this.name};SecretName=${azurerm_key_vault_secret.callback.name})"
    TIECAMEL_SERVICE_TOKEN                                = "@Microsoft.KeyVault(VaultName=${azurerm_key_vault.this.name};SecretName=${azurerm_key_vault_secret.service_token.name})"
    SOLANA_NETWORK                                        = var.solana_network
    SOLANA_RPC_URL                                        = var.solana_rpc_url
    SOLANA_MINIMUM_SIGNER_BALANCE_LAMPORTS                = tostring(var.solana_minimum_signer_balance_lamports)
    SOLANA_KEY_VAULT_SECRET_NAME                          = "solana-integrity-signer"
    MALWARE_SCANNER_URL                                   = var.malware_scanner_image != "" ? "https://${azurerm_container_app.malware_scanner[0].ingress[0].fqdn}" : ""
    REQUIRE_MALWARE_SCANNER                               = var.malware_scanner_image != "" ? "true" : "false"
  }

  lifecycle {
    # Zip deployment replaces this value with the immutable package URL.
    ignore_changes = [app_settings["WEBSITE_RUN_FROM_PACKAGE"]]
  }

  tags = local.common_tags
}

resource "azurerm_cognitive_account" "document_intelligence" {
  count = var.enable_document_intelligence ? 1 : 0

  name                  = "di-tiecamel-${var.environment}-${local.suffix}"
  resource_group_name   = azurerm_resource_group.this.name
  location              = azurerm_resource_group.this.location
  kind                  = "FormRecognizer"
  sku_name              = "S0"
  custom_subdomain_name = "di-tiecamel-${var.environment}-${local.suffix}"
  local_auth_enabled    = false
  tags                  = local.common_tags
}

resource "azurerm_container_app_environment" "this" {
  name                       = "cae-tiecamel-${var.environment}-${local.suffix}"
  resource_group_name        = azurerm_resource_group.this.name
  location                   = azurerm_resource_group.this.location
  log_analytics_workspace_id = azurerm_log_analytics_workspace.this.id
  logs_destination           = "log-analytics"
  tags                       = local.common_tags
}

resource "azurerm_container_registry" "processor" {
  name                = substr("acrtc${local.normalized_env}${local.suffix}", 0, 50)
  resource_group_name = azurerm_resource_group.this.name
  location            = azurerm_resource_group.this.location
  sku                 = "Basic"
  admin_enabled       = false
  tags                = local.common_tags
}

resource "azurerm_user_assigned_identity" "document_processor" {
  count = var.enable_document_processor_job ? 1 : 0

  name                = "id-documents-${var.environment}-${local.suffix}"
  resource_group_name = azurerm_resource_group.this.name
  location            = azurerm_resource_group.this.location
  tags                = local.common_tags
}

resource "azurerm_container_app_job" "document_processor" {
  count = var.enable_document_processor_job ? 1 : 0

  name                         = "job-documents-${var.environment}-${local.suffix}"
  resource_group_name          = azurerm_resource_group.this.name
  location                     = azurerm_resource_group.this.location
  container_app_environment_id = azurerm_container_app_environment.this.id
  replica_timeout_in_seconds   = 1800
  replica_retry_limit          = 3

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.document_processor[0].id]
  }

  registry {
    server   = azurerm_container_registry.processor.login_server
    identity = azurerm_user_assigned_identity.document_processor[0].id
  }

  secret {
    name                = "convex-callback-secret"
    key_vault_secret_id = azurerm_key_vault_secret.callback.versionless_id
    identity            = azurerm_user_assigned_identity.document_processor[0].id
  }

  event_trigger_config {
    parallelism              = 1
    replica_completion_count = 1

    scale {
      min_executions              = 0
      max_executions              = 10
      polling_interval_in_seconds = 15

      rules {
        name             = "processing-queue"
        custom_rule_type = "azure-servicebus"
        identity_id      = azurerm_user_assigned_identity.document_processor[0].id
        metadata = {
          namespace    = azurerm_servicebus_namespace.this.name
          queueName    = azurerm_servicebus_queue.work["processing"].name
          messageCount = "1"
        }
      }
    }
  }

  template {
    container {
      name   = "document-processor"
      image  = var.document_processor_image != "" ? var.document_processor_image : "${azurerm_container_registry.processor.login_server}/tiecamel-document-processor:latest"
      cpu    = 2
      memory = "4Gi"

      env {
        name  = "AZURE_STORAGE_BLOB_URL"
        value = azurerm_storage_account.records.primary_blob_endpoint
      }
      env {
        name  = "AZURE_CLIENT_ID"
        value = azurerm_user_assigned_identity.document_processor[0].client_id
      }
      env {
        name  = "AZURE_SERVICE_BUS_NAMESPACE"
        value = "${azurerm_servicebus_namespace.this.name}.servicebus.windows.net"
      }
      env {
        name  = "CONVEX_PROCESSING_CALLBACK_URL"
        value = var.convex_processing_callback_url
      }
      env {
        name        = "CONVEX_CALLBACK_SECRET"
        secret_name = "convex-callback-secret"
      }
      env {
        name  = "REQUIRE_MALWARE_SCANNER"
        value = "true"
      }
    }
  }

  tags = local.common_tags

  depends_on = [
    azurerm_role_assignment.processor_acr_pull,
    azurerm_role_assignment.processor_blob_contributor,
    azurerm_role_assignment.processor_service_bus_receiver,
    azurerm_role_assignment.processor_key_vault_user,
    azurerm_role_assignment.processor_document_intelligence_user,
  ]
}

resource "azurerm_role_assignment" "processor_acr_pull" {
  count = var.enable_document_processor_job ? 1 : 0

  scope                = azurerm_container_registry.processor.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_user_assigned_identity.document_processor[0].principal_id
}

resource "azurerm_role_assignment" "processor_blob_contributor" {
  count = var.enable_document_processor_job ? 1 : 0

  scope                = azurerm_storage_account.records.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_user_assigned_identity.document_processor[0].principal_id
}

resource "azurerm_role_assignment" "processor_service_bus_receiver" {
  count = var.enable_document_processor_job ? 1 : 0

  scope                = azurerm_servicebus_namespace.this.id
  role_definition_name = "Azure Service Bus Data Receiver"
  principal_id         = azurerm_user_assigned_identity.document_processor[0].principal_id
}

resource "azurerm_role_assignment" "processor_key_vault_user" {
  count = var.enable_document_processor_job ? 1 : 0

  scope                = azurerm_key_vault.this.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_user_assigned_identity.document_processor[0].principal_id
}

resource "azurerm_role_assignment" "processor_document_intelligence_user" {
  count = var.enable_document_processor_job && var.enable_document_intelligence ? 1 : 0

  scope                = azurerm_cognitive_account.document_intelligence[0].id
  role_definition_name = "Cognitive Services User"
  principal_id         = azurerm_user_assigned_identity.document_processor[0].principal_id
}

resource "azurerm_container_app" "malware_scanner" {
  count = var.malware_scanner_image != "" ? 1 : 0

  name                         = "ca-malware-${var.environment}-${local.suffix}"
  container_app_environment_id = azurerm_container_app_environment.this.id
  resource_group_name          = azurerm_resource_group.this.name
  revision_mode                = "Single"

  template {
    min_replicas = 1
    max_replicas = 3

    container {
      name   = "scanner"
      image  = var.malware_scanner_image
      cpu    = 1
      memory = "2Gi"
    }
  }

  ingress {
    external_enabled = true
    target_port      = 8080

    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  tags = local.common_tags
}

resource "azurerm_role_assignment" "records_blob_contributor" {
  scope                = azurerm_storage_account.records.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_linux_function_app.integrations.identity[0].principal_id
}

resource "azurerm_role_assignment" "records_blob_delegator" {
  scope                = azurerm_storage_account.records.id
  role_definition_name = "Storage Blob Delegator"
  principal_id         = azurerm_linux_function_app.integrations.identity[0].principal_id
}

resource "azurerm_role_assignment" "service_bus_sender" {
  scope                = azurerm_servicebus_namespace.this.id
  role_definition_name = "Azure Service Bus Data Sender"
  principal_id         = azurerm_linux_function_app.integrations.identity[0].principal_id
}

resource "azurerm_role_assignment" "service_bus_receiver" {
  scope                = azurerm_servicebus_namespace.this.id
  role_definition_name = "Azure Service Bus Data Receiver"
  principal_id         = azurerm_linux_function_app.integrations.identity[0].principal_id
}

resource "azurerm_role_assignment" "key_vault_secrets_user" {
  scope                = azurerm_key_vault.this.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_linux_function_app.integrations.identity[0].principal_id
}

resource "azurerm_role_assignment" "document_intelligence_user" {
  count = var.enable_document_intelligence ? 1 : 0

  scope                = azurerm_cognitive_account.document_intelligence[0].id
  role_definition_name = "Cognitive Services User"
  principal_id         = azurerm_linux_function_app.integrations.identity[0].principal_id
}

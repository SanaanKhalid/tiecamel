output "resource_group_name" {
  value = azurerm_resource_group.this.name
}

output "integration_function_url" {
  value = "https://${azurerm_linux_function_app.integrations.default_hostname}/api"
}

output "records_blob_url" {
  value = azurerm_storage_account.records.primary_blob_endpoint
}

output "key_vault_url" {
  value = azurerm_key_vault.this.vault_uri
}

output "service_bus_namespace" {
  value = "${azurerm_servicebus_namespace.this.name}.servicebus.windows.net"
}

output "document_intelligence_endpoint" {
  value = var.enable_document_intelligence ? azurerm_cognitive_account.document_intelligence[0].endpoint : null
}

output "solana_network" {
  value = var.solana_network
}

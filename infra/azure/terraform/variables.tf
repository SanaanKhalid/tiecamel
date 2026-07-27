variable "environment" {
  description = "Short environment name such as dev, staging, or prod."
  type        = string
  default     = "dev"

  validation {
    condition     = can(regex("^[a-z0-9-]{2,12}$", var.environment))
    error_message = "environment must contain 2-12 lowercase letters, numbers, or hyphens."
  }
}

variable "location" {
  description = "Azure region for the integration plane."
  type        = string
  default     = "centralus"
}

variable "resource_group_name" {
  description = "Optional resource group name. A TieCamel name is generated when empty."
  type        = string
  default     = ""
}

variable "convex_publication_callback_url" {
  type        = string
  description = "Convex HTTP action URL ending in /integrations/publication-callback."
}

variable "convex_processing_callback_url" {
  type        = string
  description = "Convex HTTP action URL ending in /integrations/processing-callback."
}

variable "convex_integrity_callback_url" {
  type        = string
  description = "Convex HTTP action URL ending in /integrations/integrity-callback."
}

variable "convex_callback_secret" {
  type        = string
  sensitive   = true
  description = "HMAC secret Azure uses to sign callbacks to Convex."
}

variable "tiecamel_service_token" {
  type        = string
  sensitive   = true
  description = "Bearer token Convex uses to call the Azure command boundary."
}

variable "solana_network" {
  type        = string
  default     = "devnet"
  description = "Solana network used for public integrity anchors."

  validation {
    condition     = contains(["devnet", "mainnet-beta"], var.solana_network)
    error_message = "solana_network must be devnet or mainnet-beta."
  }
}

variable "solana_rpc_url" {
  type        = string
  sensitive   = true
  description = "RPC endpoint for the selected Solana network."
}

variable "solana_signer_secret" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Optional 64-byte Solana secret key as a JSON array or base64. Prefer importing/rotating this secret outside Terraform."
}

variable "enable_document_intelligence" {
  type        = bool
  default     = true
  description = "Create an Azure AI Document Intelligence account for OCR and extraction."
}

variable "malware_scanner_image" {
  type        = string
  default     = ""
  description = "Optional private/container image exposing POST /scan on port 8080."
}

variable "evidence_retention_days" {
  type        = number
  default     = 0
  description = "Evidence immutability period. Keep 0 until records/legal policy is approved."

  validation {
    condition     = var.evidence_retention_days == 0 || var.evidence_retention_days >= 14
    error_message = "Evidence retention must be 0 (disabled) or at least 14 days."
  }
}

variable "lock_evidence_policy" {
  type        = bool
  default     = false
  description = "Permanently lock the evidence policy. Enable only after legal approval."
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Additional Azure resource tags."
}

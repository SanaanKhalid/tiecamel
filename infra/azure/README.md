# TieCamel Azure integration plane

Terraform in [`terraform/`](./terraform) creates every Azure resource used by
TieCamel. Cloudflare hosts the web application and Convex remains the
transactional control plane.

Created resources:

- private Blob containers for quarantine, processed artifacts, and evidence;
- optional immutable evidence retention;
- Key Vault for callback, provider, and Solana signer secrets;
- Service Bus queues for processing, publication, reconciliation, and anchors;
- a managed-identity Linux Function App for the integration boundary;
- Azure AI Document Intelligence for OCR/structured extraction;
- Application Insights and Log Analytics;
- a Container Apps environment and optional malware scanner.

The function identity receives only Blob data, Service Bus sender/receiver,
Key Vault secret-read, and Document Intelligence user roles. Storage keys are
not used for record data. The separate Function host account necessarily uses
its key for the Azure Functions runtime.

## Deploy

```sh
cd infra/azure/terraform
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

Pass secrets through `TF_VAR_convex_callback_secret`,
`TF_VAR_tiecamel_service_token`, and an encrypted CI secret store. Prefer
creating/importing `solana-integrity-signer` directly in Key Vault instead of
putting a signer in Terraform state.

Build and deploy `apps/integrations` after Terraform creates the Function App.
Set Convex environment variables:

- `AZURE_INTEGRATION_URL` to the `integration_function_url` output;
- `AZURE_INTEGRATION_TOKEN` to the service token;
- `AZURE_CALLBACK_SECRET` to the callback HMAC secret;
- `SOLANA_NETWORK` to the Terraform-selected network.

Do not set `lock_evidence_policy = true` until legal counsel approves the
retention period. Azure cannot unlock a locked immutability policy.

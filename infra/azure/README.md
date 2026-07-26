# TieCamel Azure integration plane

This deployment creates the provider-neutral document infrastructure used by
TieCamel while Convex remains the transactional control plane.

- Blob containers: `quarantine`, `processed`, and `evidence`
- Key Vault for Google/Microsoft credentials and callback secrets
- Service Bus queues for processing, publication, and reconciliation
- Log Analytics, Application Insights, and a Container Apps environment

The Azure Functions app in `apps/integrations` is deployed separately with a
system-assigned managed identity. Grant that identity:

- Storage Blob Data Contributor on `quarantine`, `processed`, and `evidence`
- Storage Blob Delegator on the storage account
- Azure Service Bus Data Sender/Receiver on the namespace
- Key Vault Secrets User on the vault

Do not enable locked WORM retention until the client has approved its legal
retention policy. Configure time-based immutability on `evidence` only after
that review. External provider credentials are stored as individual Key Vault
secrets and Convex stores only `kv://<secret-name>` references.

# Records integration architecture

TieCamel always works without Google or Microsoft. Each repository has exactly
one accepted-record master:

| Mode | Master | Always retained by TieCamel |
| --- | --- | --- |
| TieCamel storage | Azure Blob `evidence` | Approved bytes, SHA-256, manifest, processing evidence |
| Google Drive | One fixed Shared Drive folder | Approved bytes, SHA-256, manifest, processing evidence |
| OneDrive for Business | One fixed business folder | Approved bytes, SHA-256, manifest, processing evidence |

Cloudflare hosts the TanStack application. Convex remains the transactional
database, authorization boundary, realtime layer, publication state machine,
notifications system, and audit ledger. Azure owns binary storage, credentials,
queues, processing, and external-provider API work.

## Publication invariant

A Change Request remains `approved` while its `publicationJob` is queued or
running. The Azure worker receives an idempotency key containing the exact
Change Request revision and storage-configuration version. Convex marks the
request `merged` only after the signed callback is verified and finalization
creates the immutable `RecordVersion`.

Changing the revision or repository destination makes an in-flight callback
stale. Replayed commands and callbacks return the existing job or record rather
than creating duplicate provider files.

## Provider boundaries

- Google uses a service account granted access only to an organization-owned
  Shared Drive folder.
- OneDrive uses an Entra application identity and supports business accounts
  only. The adapter is feature-flagged until Google production acceptance.
- Provider credentials live in Azure Key Vault. Convex stores `kv://...`
  references, never credentials.
- Publishers cannot choose a destination per Change Request.
- Public pages never expose provider URLs. They read Convex public snapshots.

## Existing records

Enabling Google does not copy existing Azure-master records. New records and
future approved updates use the newly configured destination. Existing Google
files enter TieCamel only through a baseline import: an administrator attests
to the current state, Azure downloads/scans/hashes/seals it, and Convex records
an explicitly labeled `legacy-baseline` version without inventing historical
approval.

## Drift and recovery

Provider-side edits, moves, deletion, and permission loss degrade the external
reference and repository destination, create a protected critical issue, notify
administrators, and block publication. Restoration uses the exact sealed Azure
bytes, verifies the approved checksum, updates the stable external reference,
and writes an audit event. A user cannot acknowledge a restoration directly;
only the signed Azure verification callback can restore healthy state.

## Public integrity

Public Transparency repositories may opt into Solana anchoring. After Azure
seals the approved bytes and canonical publication manifest, TieCamel submits
only `tiecamel:v1:<manifest-sha256>` to the Solana Memo program. The Solana
transaction is advisory public proof; Azure evidence and Convex authorization
remain the operational source of truth. A failed anchor never rolls back an
accepted record, but it remains visibly pending/failed until retried.

## Production setup

1. Deploy `infra/azure/terraform` with `terraform plan` and `terraform apply`.
2. Deploy `apps/integrations` with a system-assigned managed identity.
3. Apply the RBAC grants documented in `infra/azure/README.md`.
4. Store Google service-account JSON in a dedicated Key Vault secret.
5. Set the Convex server variables in `apps/app/.env.example`.
6. Set the Azure Function variables in `apps/integrations/.env.example`.
7. Share only the approved Shared Drive folder with the displayed service
   identity.
8. Verify the connection in Organization Settings, then select the fixed
   destination in Repository Settings.
9. Import a funded Solana signer into Key Vault and enable anchoring only on
   approved public Transparency repositories.

Demo identity switching uses provider simulators only. It never performs live
connection, import, publication, or restoration operations.

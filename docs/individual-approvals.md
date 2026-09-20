# Individual approvals: signing boundary and remaining launch gates

## Verified scope — September 20, 2026

This deliverable implements a shared transaction codec, a browser passkey adapter,
a server fee-sponsoring adapter, and a plain-language evidence review component.
The server path has been exercised against the actual governance program on a
local Solana validator with separate reviewer and service keys. Browser tests use
a clearly labeled simulation; they do not demonstrate live Turnkey enrollment or
a real passkey signature.

**Live critical approvals and closure remain disabled.** No signing endpoint is
exposed by this deliverable. Enrollment, durable intent storage, authenticated
workflow integration, public-network deployment and application reconciliation
remain required before these adapters can serve a nonprofit.

## Current decision: defer Turnkey setup

On September 20, 2026, the project owner chose to skip Turnkey setup for now.
Do not request a Turnkey account, provision provider resources or treat Turnkey
credentials as a blocker to ongoing development. The existing inactive adapter
is retained as tested implementation work; retaining it does not select or
activate a production provider. No replacement signing provider has been chosen.

Continue provider-independent work: authenticated intent storage, crash-safe
reconciliation, notice intake, deadline escalation and community reporting.
Individual cryptographic approval remains a requirement before enabling live
critical closure. Demo approvals remain explicitly simulated; application-only
records must not be described as independently signed Solana approvals. This
decision does not authorize service-owned reviewer keys or bypassing the gate.

## Modules and trust boundaries

### Confirmed application origin

The project owner confirmed the intended live application URL on September 20,
2026:

- Application origin: `https://app.tiecamel.com` (no trailing slash).
- Passkey relying-party ID: `app.tiecamel.com` (hostname only).

Use this exact hostname for live enrollment and signing. Do not substitute the
parent domain, a deployment preview hostname or localhost. The existing browser
adapter requires the enrolled relying-party ID to match the current hostname.
Development fixtures remain separate from real enrollment. This records the
deployment decision; it does not verify DNS, TLS, provider configuration or a
successful live passkey ceremony, and it does not enable critical approvals.

### Implementation

- `packages/governance`: portable builders, account decoders, salted evidence
  commitments, two-minute approval intents and exact-message signature checks.
- `apps/app/src/governance/passkey-approval.ts`: Turnkey WebAuthn adapter with
  required user verification, a pinned relying-party hostname and the enrolled
  credential. It requests exactly one Solana approval transaction from the
  individual's sub-organization; there is no service API-key signing fallback.
- `apps/app/src/components/secure-approval-review.tsx`: evidence-bound review,
  explicit independence confirmation, expiry and separate submitted, uncertain
  and finalized states. Changing the intent resets consent and discards late
  signing results. One approval is not closure or a compliance certificate.
- `apps/integrations/src/governance-signing.ts`: prepare from a finalized board/case
  snapshot, validate current membership and evidence, verify the reviewer's
  signature, add the separate service fee signature, and reconcile the exact
  finalized transaction message on the pinned network.

The caller must derive `ApprovalBinding` from authenticated, current application
records and `SigningNetwork` from trusted server configuration. Never accept
either from request JSON. The server must persist the original `ApprovalIntent`;
submission accepts its identifier and signed bytes, not a replacement envelope.
The envelope's application identifiers are trusted metadata, not extra fields
cryptographically included in the Solana instruction. Their server-side binding
checks are therefore essential.

The client reconstructs the one permitted instruction. Added transfers, altered
fee payers, changed blockhashes, changed evidence and forged or missing signatures
are rejected. The server rechecks the adopted identity, independence, policy,
case revision, board head, genesis hash and expiration before sponsoring. Chain
head concurrency also rejects approvals overtaken by another board event.

Submission is not confirmation. A timeout may happen after acceptance, so the
adapter returns `uncertain` with the locally computed signature. Reconcile that
signature instead of obtaining another approval automatically. Finalized receipt
verification remains possible after the original signing window expires. A
receipt only proves the exact on-chain action; it does not prove the underlying
document is truthful or that a tax obligation has legally been discharged.

## Requirements before live signing (provider setup deferred)

1. **Individual enrollment.** After a signing approach is selected, bind an
   authenticated, verified person to a user-controlled signing identity. For the
   retained Turnkey adapter, this would be a sub-organization and passkey; that
   provider setup is currently deferred. Provision the Solana
   signing account, prove possession, and save only public enrollment metadata.
   Verify root users, policies and recovery authority: a backend-controlled root
   or recovery path must not silently become an alternative approver. Test
   revocation, lost-device recovery and the intended production hostname.
2. **Board adoption and evidence mirroring.** Independently adopt the person/key
   roster, director roles, threshold and service key; map application identities
   to opaque chain identities. Register the case and have its actual submitter
   sign the evidence proposal. The service cannot substitute for that person.
   A unique key alone does not establish a unique human.
3. **Durable, authenticated intent ledger.** Prepare and store an intent only for
   an authorized independent reviewer of current processed evidence. Atomically
   claim each stored intent before sponsorship; record expiry, exact message,
   signature and attempt state. Re-read membership, assignment and evidence
   version at submission. Bound outstanding intents, sponsor spend and request
   rates. No public endpoint should wrap this adapter without these controls.
4. **Crash-safe submission and reconciliation.** Persist the expected signature
   before broadcast (split the current adapter's sign/send boundary or provide a
   durable pre-send hook), so a crash cannot strand an unknown attempt. Use leased
   reconciliation jobs. Apply finalized receipts to application state with an
   atomic version/membership check and idempotency key; changed or revoked
   application context must not become a current approval. Never treat an RPC
   timeout or a browser success callback as finality.
5. **Public-network pilot validation.** Pin genesis hash, program ID and audited
   deployment; test real passkeys and sponsor isolation on devnet. Show independent
   proof links, test two distinct reviewers including a director, evidence changes,
   failed transactions and downtime. Only then consider enabling the live gate.

The current adapter intentionally permits only localnet and devnet configuration.
There is no production/mainnet activation, account creation, provider enrollment,
or fund movement in this deliverable.

## Development and verification

Root build/test/development commands build the shared SDK first. When running a
package command directly after a clean checkout, run `pnpm governance:sdk` first.
Integration deployment artifacts must include the built workspace dependency;
copying only `apps/integrations/dist` is not a complete deployment bundle.

```sh
pnpm install
pnpm test
pnpm build
pnpm governance:test
pnpm dev:app
```

The development-only `/dev/approval-review` route exercises the browser codec and
review states using synthetic public metadata and simulated signing. It creates
no application session or database records, contacts no signing provider and
broadcasts no transaction. Its fixture is excluded from production builds and
the route returns not-found outside development. It must never be presented as a
live cryptographic demo.

Tests cover exact transaction signatures, instruction/payer/blockhash tampering,
expiry, tenant/member/evidence binding, provider incompletion, explicit consent,
late responses, duplicate clicks, pending/failed receipts and actual finalized
local-chain approval with a separate fee sponsor.

The provider adapter follows the official [Turnkey Solana SDK transaction flow](https://github.com/tkhq/sdk/blob/main/packages/solana/src/index.ts)
and [WebAuthn stamper](https://docs.turnkey.com/changelogs/webauthn-stamper/readme).
Enrollment must implement and verify the authority model exposed by
[sub-organization creation](https://docs.turnkey.com/api-reference/activities/create-sub-organization).

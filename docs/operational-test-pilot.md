# Operational test pilot

## Updated deployment decision

The owner explicitly selected **https://app.tiecamel.com** for operational
testing, replacing the browser-only demo on that host. The test build now targets
the existing `tiecamel-app` Worker; no separate test site is required. The backing
Convex and Azure services remain development/test infrastructure, with the same
synthetic-data and critical-closure restrictions. `admin@webnyl.com` is the sole
approved email alert recipient. WhatsApp remains unconfigured; no phone recipient
has been approved.

Use `pnpm deploy:operational-test` for this release. It rebuilds with explicit
development configuration and preserves Worker variables. Clerk server credentials
must be present securely on the Worker. `pnpm deploy:demo` restores the disconnected
browser-only demonstration if needed; it does not delete test records.

The initial separate-host recommendation and verification snapshot below are
historical; this explicit owner decision supersedes them.

### Activated on the main site — September 20, 2026

- Frontend source `7d04d03`, Worker version
  `0900ea7b-5108-40a3-8ae0-d0776d19e055`, is live at `app.tiecamel.com`.
- Operational-test backend functions deployed to `careful-setter-342` with type
  checking. The main host deliberately uses test infrastructure; this is not a
  claim that a production nonprofit service is ready.
- Development Clerk server credentials configured securely on the existing
  Worker. The owner approved `admin@webnyl.com` for sign-in as well as alerts.
- Created `[TEST] TieCamel Test Foundation` (`test-tiecamel`) with an empty
  restricted Compliance repository and six distinct Clerk identities. The owner
  signs in with the approved email. The other five are synthetic operator-test
  identities with reserved example addresses, not publicly shared test logins.
  Their alert destinations all map to the approved owner inbox.
- Enabled operational testing and configured the exact email recipient allowlist,
  main-site app URL and development callback base. Disabled legacy anonymous demo
  sessions. Outbound delivery remains explicitly **disabled**: Resend/Twilio
  credentials are absent. No alert email or WhatsApp message has been sent.
- Live signed Clerk JWT queries succeeded for all six identities. Five staff roles
  see the test repository; the member role sees none. Temporary operator-created
  sessions were revoked after each check. This verifies backend authentication
  and repository visibility, not a human OTP login or the full records workflow.
- Main-site browser shows the test warning and opens the real Clerk development
  sign-in modal without console errors. Both worker heartbeats were current.
- 134 tests, TypeScript and the test build passed. Two opt-in local-validator tests
  were not run. No document-processing, email-delivery, backup-restore or on-chain
  approval success is claimed for this activation.

Operator utilities (load development credentials securely):

```sh
node --env-file=apps/app/.env.development.local scripts/provision-operational-test.mjs admin@webnyl.com
node --env-file=apps/app/.env.development.local scripts/check-operational-test.mjs
```

Provisioning now exists: do not rerun the first command expecting a reset. It
refuses to overwrite an existing tenant. The second command creates short-lived
test sessions, checks the live tenant/repository boundary, and revokes its sessions.

Next external prerequisite for real email alerts is an email delivery service.
The existing adapter uses Resend; another provider requires an adapter and receipt
verification work. Twilio is needed only for the currently implemented WhatsApp
channel/phone verification, not for core sign-in or document storage. No provider
account or paid service was created during activation.

## Initial implementation snapshot

Requested September 20, 2026: mock client identities with real services behind
them. This is a separate stage from the browser-only public demo and from real
nonprofit onboarding. Use synthetic notices, accounts, amounts and evidence.
Mock identities cannot prove independent human approval or board authority.

Implemented in this deliverable (not yet activated or deployed):

- An explicit `operational-test` frontend mode. It forces anonymous demo mode
  off, requires development Clerk configuration and Convex, and never falls back
  to a browser-only sample workspace when configuration is missing.
- Persistent warning banner and assigned-account sign-in without a sign-up
  shortcut. Backend membership, not possession of a Clerk account, grants access.
- A separate build target named `tiecamel-operational-test`; it does not use the
  public demo Worker's name or domain. No automatic deployment script is added.
- Operator-only `operationalTests:provision` creates a dedicated `[TEST]` tenant,
  distinct role-bound memberships, and an empty restricted Compliance repository
  with two approvals and self-approval prevention. It rejects reused accounts,
  duplicate identities, existing tenants, and non-development issuers.
- No fake notices, payments, evidence, delivery receipts or demo sessions are
  created. Sign out and sign in as another assigned test user to change roles.
- Test email and WhatsApp deliveries require exact server-side recipient
  allowlists, ordinary provider configuration, consent checks and enablement.
  Test emails are labeled `[TEST]`; WhatsApp requires a separate test template.
  Phone verification sends are also allowlisted. An empty allowlist blocks sends.
- Readiness and public community output identify synthetic test identities.
  Critical secure approval/closure remains disabled; Turnkey remains deferred.

Direct read-only checks: existing Clerk instance reports `development`; it has a
`convex` JWT template with audience `convex`. Development Convex and Azure
infrastructure exist (see the September 20 readiness audit). These checks do not
prove browser login, document processing, provider delivery or recovery.

No accounts, provider credentials, notification destinations, environment
settings, infrastructure or deployments were changed for this deliverable.

Verification: 134 application/integration tests passed; the two opt-in
local-validator scenarios were not run. App TypeScript and the operational-test
build passed. The generated Worker name was checked and built JS/JSON/HTML assets
were scanned for the configured Clerk secret (no match). A local browser showed
the labeled assigned-account screen and opened the real Clerk development sign-in
modal without console errors. No authenticated user journey has been run yet.
On this Node 24 environment, tests use
`NODE_OPTIONS=--no-experimental-webstorage pnpm test` so Node's experimental
storage does not shadow jsdom's browser storage.

## Activation sequence

### 1. Select the test destination and participants

Recommended: retain `app.tiecamel.com` as the public demonstration and deploy the
test pilot to its own Worker/host. Confirm the destination before publishing.
This is membership-restricted application access, not a network-private site.
Explicit community publications remain publicly readable and must be synthetic.

Assign at least four dedicated test identities: owner, finance/evidence submitter,
reviewer and board. Add secretary and community member to exercise those roles.
Create them in the existing Clerk development instance using unique passwords
or ordinary individually controlled sign-ins. Do not publish passwords or use
Clerk's universally known test OTP as protection for sensitive data. Do not reuse
real nonprofit accounts. Clerk provisioning credentials stay server-side.

Enable `TIECAMEL_OPERATIONAL_TEST_ENABLED=true` on **development Convex only**.
Run the internal provisioning function through an authenticated operator CLI
with the verified Clerk user IDs, names, emails and fixed roles. Its slug must
begin `test-`. Never expose this function as a public mutation or self-serve role
picker. Provisioning deliberately refuses overwrite/retry on an existing slug:
inspect the existing tenant before attempting a different one.

Build from the explicit development environment file:

```sh
pnpm build:operational-test
```

The script requires test Clerk keys and `careful-setter-342.convex.cloud`; it
rejects a production backend. Inspect the generated Worker config to confirm the
name is `tiecamel-operational-test` before any deployment. Configure the new
Worker's Clerk server secret securely; never put it in a `VITE_` variable, commit
it, or copy production secrets. Configure the correct Clerk redirect/origin
settings for the selected host. Run the browser acceptance checks below.

### 2. Exercise real records and processing

Use existing development Convex and Azure, with callbacks staying on the
development deployment. Upload a synthetic PDF as the finance test user through
the application. Verify quarantine upload, processing, hash, authenticated
callback, ready status, permission-checked download, and evidence linkage to the
same organization. Also test unsupported files, failure states and retries.

Before describing processing as complete, resolve any malware-scanner
configuration requirement and verify a real job completes. An HTTP 200 health
response is not a processing receipt. Do not disable quarantine/security checks
to make the test pass. Managed Azure storage is the initial path; Google Drive
needs its own verified connection and OneDrive is not enabled in this release.

### 3. Activate real, restricted notifications

Collect explicit consenting test destinations first. Configure provider secrets
directly in the provider/deployment secret manager, not chat or source control.

| Capability | Configuration needed | Evidence of completion |
| --- | --- | --- |
| Email | Resend key, verified sender (`TIECAMEL_ALERT_FROM`), signed webhook secret, test app URL, exact `TIECAMEL_TEST_EMAIL_RECIPIENTS` | Actual received `[TEST]` email plus authenticated delivered callback |
| WhatsApp | Twilio account/token, sender, Verify service, approved explicitly test-labeled `TWILIO_TEST_ALERT_TEMPLATE_SID`, callback base, exact `TIECAMEL_TEST_WHATSAPP_RECIPIENTS` | Consented number verification, template delivery, signed receipt |
| Inbound notices | Dedicated inbound domain/DNS, Resend receiving/webhook configuration, enabled organization route | Forwarded synthetic notice arrives once and can be assigned |
| Workers and failure alerts | Existing scheduled workers, independent health monitor and a real outage recipient/action group | Missed deadline escalates; failed worker/queue triggers an outside alert |

Allowlists are comma-separated exact destinations; no wildcard/domain matching.
Only then enable `TIECAMEL_ALERT_DELIVERY_ENABLED=true` on the development
deployment. Confirm `TIECAMEL_APP_URL` is the test host, never the disconnected
public demo. Provider acceptance is not delivery; delivery is not human
acknowledgement. Do not mark a notice handled because an email was sent.

### 4. Complete the approval and Solana work separately

Standard authenticated record review and noncritical workflow actions can be
tested with the assigned accounts. Critical secure approval/closure is still a
deliberate hard gate. The focused governance program has local-validator tests,
not a verified public devnet deployment and complete live signing lifecycle.

Without Turnkey, a devnet-only test harness could use one dedicated test key per
role, clearly labeled synthetic approval. That is **not implemented here** and
must never be accepted as a real board attestation. Real clients still need
individual signer enrollment/ownership, adopted roster, persisted signing intent,
exact transaction validation, confirmed receipt reconciliation, stale revision
rejection and replay protection. Decide on that signer approach explicitly;
never silently use one service signer to impersonate the board.

### 5. Acceptance and recovery

Do not declare the pilot operational until all selected capabilities pass:

1. Sign in separately as each test user; verify roles and absence of role
   impersonation. Unprovisioned, revoked and other-tenant accounts are denied.
2. Register a synthetic notice with owner, backup, reviewer and exact deadline;
   reload and use a second browser to prove persistence.
3. Upload/process/download/link evidence; ensure another tenant cannot access it.
4. Let a deadline/checkpoint expire; observe escalation and real delivery only to
   allowed recipients. Prove an unlisted email/phone cannot trigger provider sends.
5. Test acknowledgement separately from delivery; self-approval and stale
   revisions fail. Critical closure stays visibly blocked until step 4 is done.
6. Publish an approved, redacted community update; verify private source text,
   documents and personal contact details are absent and output is test-labeled.
7. Inspect errors/retries, restore a test backup, and test an outside outage alert.

Stop new test access and test notification sends by setting
`TIECAMEL_OPERATIONAL_TEST_ENABLED=false`; disable outbound delivery separately
with `TIECAMEL_ALERT_DELIVERY_ENABLED=false`. Existing provider sends cannot be
recalled, and already public publications are not automatically unpublished.
Revoke dedicated memberships/Clerk sessions for account-specific shutdown.

The public demo deployment remains independent. No real nonprofit should rely on
this test environment for tax deadlines, payments or governance decisions.

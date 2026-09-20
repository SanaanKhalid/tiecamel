# TieCamel — hackathon implementation ledger

Implementation began September 19, 2026. Existing work is explicitly disclosed;
it is not claimed as work produced during the hackathon.

## Existing baseline

- Main before this implementation: `4e438ac`.
- Pre-existing financial-transparency branch: `6fb7f13`, merged without rewriting history.
- Existing capabilities: document repositories, issues, change review, immutable
  versions, public publications, Azure processing, Solana Memo receipts, CSV
  financial ledgers and read-only wallet reconciliation.
- Baseline verification: 37 application tests and 9 integration tests pass.

## Implementation sequence

1. Integrate the financial baseline and preserve attribution/history.
2. Add controlled responsibilities, human-confirmed notice intake, immutable
   evidence revisions, independent closure and a board-visible escalation ledger.
3. Deliver a usable responsibilities/approvals/community workflow, clearly
   separating local demonstration from authenticated organization data.
4. Add durable notification processing and provider configuration, exposing
   delivery failure and stale monitoring rather than claiming success.
5. Implement and test focused Solana governance controls and independent proof
   verification; integrate secure individual approvals only after provider and
   network setup are verified.

Each deliverable is tested and pushed separately. Provider provisioning, pilot
recruitment and production rollout are not implied by a successful local build.

## Non-negotiable product controls

- Acknowledging a notice does not approve it or resolve the underlying obligation.
- Pending exemption does not resolve a tax liability.
- Owner, backup, source, actual deadline and required evidence stay visible.
- Critical closure requires two distinct independent people, including a director.
- Revised evidence invalidates earlier approvals; administrators cannot bypass it.
- Critical risks are visible to the whole board. Sensitive documents are not public.
- Minimal community status is automatic; detailed disclosure requires review.
- Monitoring describes registered responsibilities, not all possible obligations.
- No wallet, token, gas or seed phrase vocabulary is required in everyday nonprofit work.

## Progress

- Baseline integrated; no production deployment performed.
- Deliverable 2: shared responsibility policy engine, persistent Convex workflows,
  optimistic revision checks, append-only hash-linked events, automatic minimal
  community summary, independent publication review and five-minute escalation
  scans. Linked issues cannot close unresolved responsibilities.
- Demo sessions are isolated from pilot organizations. Multiple active memberships
  require an explicit organization choice. Expired demo sessions show recovery UI.
- Critical approvals/closure in real organizations deliberately fail closed until
  individual secure signing is provisioned. Demo approvals are simulations, not
  cryptographic receipts. Hash-linked database events are tamper-evident exports,
  not independently anchored proof by themselves.
- Deliverable 3: responsive Overview, Responsibilities, Approvals and Community
  screens; human confirmation, source excerpts, owner/backup/reviewer assignments,
  separate exemption state, evidence review and redacted community publication.
  Managed PDF/photo uploads reuse the Azure document-processing pipeline. Only
  processed managed documents can be live closure evidence. The local demo has an
  explicitly simulated clock and sample evidence, with no outbound notifications.
- Public community pages do not require sign-in or create demo sessions. Approved
  publications are append-only; proposing a correction does not erase older updates.
- Development Convex functions deployed to `careful-setter-342` for browser tests.
  Production Convex and production hosting have not been deployed by this work.
- Deliverable 4: durable email/WhatsApp outbox, worker leases, bounded retries,
  signed provider callbacks, race-safe delivery receipts, WhatsApp opt-in and
  ownership verification, incoming plain-text email review queue, and health
  endpoint. External sends require explicit server-side enablement. Forwarded
  attachments are not auto-imported; officers use the managed upload pipeline.
- Repository workspace reads now respect repository assignments. Quarantined
  documents cannot be downloaded, and real organizations cannot receive demo fixtures.
- Deliverable 5: focused Anchor program, generated IDL, typed transaction builders,
  salted evidence commitments and database-independent CLI proof verification.
  Separate local signing keys exercised self-approval rejection, service isolation,
  director/quorum requirements, stale heads, evidence replacement, roster changes,
  handover, immutable closure and finalized proof tampering checks. No public network
  deployment or live passkey integration is implied; real critical closure stays gated.
- Deliverable 6: board-facing pilot-readiness checklist distinguishes observed
  configuration from live-tested delivery, checks independent reviewer capacity and
  missing verified contacts, and keeps secure signing explicitly blocked. Queued
  alert eligibility is rechecked after role/assignment changes. Community workspaces
  link to the public, limited-disclosure view without granting additional access.
- Deliverable 7: portable governance SDK, exact-message individual approval
  intents, WebAuthn-only Turnkey signing adapter, separate server fee sponsorship
  and finalized receipt reconciliation. The plain-language review requires
  explicit consent and distinguishes submission from confirmation. A local-chain
  scenario verifies a real reviewer signature and fee sponsor; the browser preview
  is explicitly simulated. No live signing endpoint, enrollment or public-network
  deployment is claimed. Durable authenticated intent storage, crash-safe receipt
  application and provider provisioning remain required; critical closure stays
  gated. See [the integration guide](individual-approvals.md).
- Deliverable 7 verification: 115 application/integration tests, 11 Rust tests and
  2 actual local-validator scenarios passed. All workspace production builds and
  application/integration TypeScript checks passed. Browser consent, pending
  receipt and refreshed-review states were checked; simulation fixtures were
  absent from production output. No production deployment was performed.
- September 20 decision: defer Turnkey account/provider setup and continue
  provider-independent implementation. Preserve the inactive signing adapter;
  do not provision a replacement provider or weaken individual-approval controls.
  Live critical approvals and closure remain disabled.
- September 20 live audit/deployment: production Convex was missing the new
  governance modules. After explicit deployment authorization, deployed current
  functions/schema from `0674fba`, confirmed 128 functions/routes and healthy
  production worker heartbeats. Frontend and Azure remain unreleased pending
  release scope and production provisioning; this is not client onboarding.
  See [the readiness audit](production-readiness-audit-2026-09-20.md).

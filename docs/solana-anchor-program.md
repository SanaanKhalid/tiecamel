# TieCamel Solana governance controls

## Current status

An Anchor program now enforces critical-case approval and board-policy rules. It
has been compiled to SBF and exercised on an isolated local Solana validator with
real, separate test signing keys. **It has not been deployed to devnet or mainnet,
audited, or connected to live nonprofit signing accounts.** Real critical closure
remains disabled in the application until that integration is verified.

This is separate from the existing document-history Memo integration. A Memo
receipt timestamps a commitment; it does not enforce independent review. Existing
Memo receipts remain unchanged and must not be described as governance approvals.

## What the program enforces

- A board has 3–12 distinct opaque person identities and signing keys. Its critical
  approval threshold cannot be less than two, and a director must participate.
- Initialization requires signatures from the proposed roster quorum. Later roster
  changes, key recovery, and policy changes require the **current** roster quorum.
- A service key can register cases and relay a fully approved closure. It cannot
  submit evidence, approve closure, or unilaterally change the board.
- Neither the responsible owner nor the evidence submitter can approve closure.
- Approvals bind the evidence revision and adopted policy version. Replacing
  evidence, reassigning responsibility, or changing policy invalidates prior authority.
- Every write checks the expected board head; case writes also check the exact case
  revision. Concurrent or replayed requests must refresh, not silently overwrite.
- Finalized cases cannot be rewritten. Reporting checkpoints require board quorum.

With a separate owner and evidence submitter, a two-person independent closure
needs at least four roster members (including an eligible director). A valid roster
does not guarantee every assignment leaves a usable quorum; onboarding must check
that operational constraint and explain it before adoption.

## Data and privacy

`Board` is a PDA derived from `board` and a random 32-byte chain ID. `CriticalCase`
is derived from `case`, its board address, and a random 32-byte case ID. The board
keeps its adopted roster, threshold, policy version, sequence and hash-linked head.
The case keeps opaque owner/submitter identities, commitments, revisions, phase and
approval records. Events record each new head and its prior head.

No names, emails, titles, amounts, deadlines or document bytes are stored on-chain.
Keys, pseudonymous identities, director flags, case relationships and activity timing
are public and linkable. Do not claim anonymity or put an email-derived identity on-chain.
Off-chain membership mapping and roster adoption must verify distinct real people;
the program cannot discover that two different identities belong to the same human.

Evidence uses SHA-256 over `tiecamel:private-evidence:v1`, a fresh random 32-byte
salt, and the document SHA-256 digest. The salt and digest remain in the private
evidence bundle. A shared proof bundle reveals that digest and its salt; release it
only with the relevant disclosure approval. Registration notice commitments and
reporting checkpoints also need privacy-reviewed, domain-separated commitments.

## Build and test

Required: Node 22.12+, pnpm, Anchor CLI 0.31.1, host Rust 1.89+, Solana CLI/test
validator 2.3.8. The build pins SBF platform tools v1.56 because newer transitive
crates use Rust's 2024 edition; the CLI's default v1.48 toolchain cannot build them.
`Cargo.lock` is committed. The existing CLI may emit a syscall post-processing
warning with v1.56; the local-validator execution test is required, not just compilation.

```sh
pnpm install
cargo test --workspace
pnpm governance:build
pnpm governance:test
pnpm --filter @tiecamel/integrations test
```

`governance:test` starts its own loopback validator, funds ephemeral test keys with
local-only SOL, runs the network test and stops that process. It never uses a saved
wallet or public-network funds. Ports 18898/18899, 19901 and 18000–18050 must be free.
The temporary ledger is retained and its path printed for inspection. The regular
test suite explicitly skips this network test; it does not imply a validator run.

IDL and TypeScript types are generated in `packages/governance-idl`. Program address:
`4G9rXL6BLXEKWM9QT6YWSBpXaTFBGmYbLB77P3vpZtxD`. This is a reserved development
identity, **not evidence of public deployment**. Key files are ignored by Git; do not
run `anchor keys sync` to silently change the identity or commit deployment secrets.

## Independent verification

```sh
pnpm --filter @tiecamel/integrations build
pnpm governance:verify /absolute/path/to/proof.json https://your-trusted-solana-rpc
```

The CLI needs no TieCamel database, API or login. It derives the board/case accounts,
reads finalized network state, checks ownership and commitments, and retrieves a
successful finalization transaction for the exact case, revision and evidence.
The proof cannot select its own trusted program or RPC. The operator selects the
network/RPC independently. HTTPS is required except for an explicit loopback validator.

Results are `verified`, `altered`, `outdated`, `pending`, or `unavailable`. Network
failure and missing archival transactions never become a success. A verified
receipt proves recorded governance under the trusted program, **not** that a tax
authority accepted an exemption, a payment settled, or a document is truthful.

Private proof format (`tiecamel-critical-proof/v1`): `programId`, random `chainId`,
random `caseId`, decimal-string `caseRevision` and `policyVersion`, `contentSha256`,
`evidenceSalt`, and `finalizationSignature`. Hashes and IDs are lowercase 64-character
hex. The CLI defaults to devnet when no RPC is supplied; local proofs require the
correct local RPC, and no public proof exists merely because a test passed.

## Gates before live critical closure

1. Provision individual user-controlled signing accounts/passkeys. TieCamel's service
   must not have signing authority over them; verify recovery and revocation behavior.
2. Bind authenticated membership, unique real-person identity and key; adopt the
   initial roster with an independently checked quorum and secure key backups.
3. Deploy to devnet and publish the binary/build hash, program identity, cluster and
   upgrade authority. Review/audit the program. An upgrade authority can replace the
   rules: pinning an address alone is not a code-integrity guarantee. The local test
   loads an immutable program; a future upgradeable deployment has a different trust model.
4. Bind managed document evidence and every proposed action to the current app
   revision, chain revision, board head and policy. Display human-readable signing
   intent; the user signs the actual Solana transaction, not a blanket service consent.
5. Verify finalized network outcomes before updating app state. A failed, expired,
   changed or unconfirmed transaction cannot produce a green closure badge.
6. Test two real independent users, evidence replacement, revoked membership,
   recovery, network outage and stale transaction handling end to end. Then remove
   the live critical gate through a reviewed change, not an environment-only bypass.

No guarantees are made about obligations never registered, incoming notices never
received, provider outages, dishonest documents, a colluding quorum, compromised
devices or legal compliance. These limits belong in both pilot onboarding and demos.

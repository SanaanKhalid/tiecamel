# Future TieCamel Solana Anchor Program

TieCamel currently commits every accepted repository commit through the Solana Memo Program using:

```text
tiecamel:commit:v2:<commitSha256>
```

The Memo implementation is intentionally the launch and hackathon protocol. It is easy to inspect, requires no custom program authority, and keeps document bytes and private metadata off-chain. Azure retains the canonical commit and tree manifests; Convex retains workflow and authorization state.

## Proposed Anchor program

A later Anchor program would maintain one repository-head account per opaque TieCamel repository chain.

### Accounts

- `RepositoryHead` PDA derived from `b"repository"` and a random 32-byte repository chain identifier.
- Current commit hash and parent hash.
- Monotonic sequence.
- Current append authority and optional pending authority.
- Bump, program version, and last update slot.

No organization name, repository title, filename, reviewer, comment, document content, or external-provider identifier would be stored on-chain.

### Instructions

- `initialize_repository(chain_id, initial_authority)` creates the head PDA.
- `append_commit(expected_parent, next_commit, tree_hash)` succeeds only when `expected_parent` equals the current head and the signer is the append authority.
- `propose_authority(next_authority)` begins a two-step rotation.
- `accept_authority()` completes rotation and prevents an accidental or unilateral key swap.
- `freeze_repository()` permanently prevents future appends only when an explicitly configured governance authority permits it.

Every successful append would emit a `CommitAppended` event containing the opaque chain ID, sequence, parent hash, commit hash, tree hash, authority, and slot.

### Security properties

- Parent-hash enforcement prevents the on-chain head from silently skipping or rewriting history.
- Optimistic concurrency makes competing append attempts explicit.
- Authority rotation supports Key Vault signer replacement without changing repository identity.
- Repository PDAs make the latest independently observed head queryable without relying on TieCamel infrastructure.
- Documents remain private and off-chain; SHA-256 commitments reveal only equality and timing.

## Migration from Memo receipts

Memo receipts remain valid historical proofs. Migration would:

1. Verify every stored Memo transaction and its exact `tiecamel:commit:v2:` payload.
2. Initialize the repository PDA with the latest verified Memo commit as its genesis head.
3. Publish a signed migration manifest listing the full Memo receipt chain and its canonical hash.
4. Anchor that migration-manifest hash in the first program event.
5. Continue displaying Memo and program receipts on the same public verification page.

No existing record version or receipt would be rewritten.

## Why it is deferred

The custom program adds deployment authority, upgrade policy, program audits, account rent, RPC/indexing work, signer migration, and incident-response responsibilities. The Memo Program already supplies durable third-party timestamping and public tamper evidence for the hackathon vertical slice. TieCamel should validate real repository workflows and privacy boundaries before introducing a custom on-chain state machine.

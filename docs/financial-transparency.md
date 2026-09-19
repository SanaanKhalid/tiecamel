# Financial transparency architecture

TieCamel’s financial feature is a read-only glass ledger and publication
system. It gives an organization a complete, reconciled account-coverage view
and lets it publish privacy-safe financial snapshots. It is not a bank,
accounting system, card issuer, exchange, custodian, or cryptocurrency treasury.

## Source model

Organizations declare bank, card, cash, processor, and wallet accounts and mark
each one included or excluded from a reporting period. Version one accepts:

- validated CSV exports for fiat accounts and cards;
- seeded demo activity for local evaluation; and
- read-only synchronization of native Circle USDC held by a configured Solana
  owner address.

The Solana integration discovers the owner’s USDC token accounts, reads
confirmed signatures and parsed transactions, and records deterministic net
transfer IDs. It never accepts a seed phrase or private key and cannot sign a
transfer. USDC entries remain `review-required` until a finance user assigns a
category, fund, sensitivity, and confirmed USD reporting value.

Live Plaid, QuickBooks, fiat conversion, card issuing, custody, transfer
initiation, and multisig proposals are outside this slice.

## Private data boundary

Raw imports, descriptions, donor identities, private counterparties, employee
and beneficiary details, private account identifiers, and RPC responses remain
in organization-scoped private tables. Owners, administrators, and finance
members can manage this workspace. Board and reviewer roles have authenticated
read access.

The unauthenticated query reads only `financialSnapshots` and public integrity
metadata. It never joins a transaction, connection, account, import, or sync
table. This is the primary non-bypassable privacy boundary.

## Disclosure policy

Each policy version assigns one treatment to every sensitivity class:
ordinary, donation, payroll, beneficiary aid, legal, and security.

| Treatment | Public output |
| --- | --- |
| `individual-redacted` | Date, amount, category, fund, and approved public description. A public counterparty is allowed only for ordinary activity. |
| `period-aggregate` | One or more category/fund totals with transaction counts and no individual date or identity. |
| `confidential-total` | Protected inflow/outflow totals by fund with no sensitive category or description. |

Every posted transaction stays in total inflow, outflow, and fund movement.
Changing the treatment changes granularity, not the financial totals. Raw donor,
employee, beneficiary, legal-matter, and private-counterparty data are never
eligible for a public snapshot.

## Reconciliation and publication

A period cannot publish until it has an adopted policy, at least one included
account, opening and closing balances for every included account, reviewed USDC
transactions, and USD reporting values for all posted activity. A nonzero
reconciliation difference requires a public exception explanation.

Publication creates an immutable `tiecamel-financial-snapshot/v1` manifest with
scope, source freshness, balances, reconciliation, inflow/outflow totals,
restricted-fund movement, sanitized entries, limitations, policy version,
publisher, timestamp, and the previous snapshot hash. The server canonicalizes
the manifest and computes SHA-256. Repeating a publication against identical
source state returns the existing snapshot; a correction creates a new version
chained to the prior hash.

## Optional Solana proof

Financial anchoring is organization-controlled and off by default. When
enabled, the existing integrity worker publishes only:

```text
tiecamel:financial:v1:<snapshot-sha256>
```

The public view distinguishes a locally verified hash from queued, running,
anchored, and failed Solana states. Simulated demo wallet activity never links
to an explorer. Anchor failure does not invalidate the snapshot, and no
financial details or operating funds are placed on-chain.

# TieCamel

TieCamel is a repository-based accountability platform for mission-driven
organizations. Teams manage issues, review document changes, accept immutable
records, and selectively publish approved history.

The hackathon build adds a nonprofit board workflow: notices become assigned
responsibilities with actual deadlines, independent evidence review, escalation,
and limited community reporting. Email/WhatsApp delivery and forwarded-notice
intake are configuration-gated; demos never send real alerts.

Live critical closure is deliberately disabled until individual passkey signing
and public-network receipt verification are integrated. The focused Solana program
is compiled and tested on a local validator, not deployed to a public network.
Individual signing and fee-sponsoring adapters are implemented and locally tested;
enrollment and durable application integration are still launch gates. See the
[individual approvals integration guide](docs/individual-approvals.md).
See the [implementation ledger](docs/hackathon-build-log.md),
[pilot operations runbook](docs/governance-operations.md), and
[Solana controls and verification](docs/solana-anchor-program.md) for verified scope
and remaining launch gates.

## Workspace

- `apps/app` — TanStack Start repository platform and public SSR views
- `apps/web` — public Astro landing page
- `apps/integrations` — Azure Functions and provider adapters
- `infra/azure/terraform` — Azure Blob, Key Vault, Service Bus, Functions,
  Document Intelligence, and Container Apps IaC
- `apps/app/DEPLOYMENTS.md` — development and production environment map
- `PRODUCT_PLAN.md` — product, pilot, and technical roadmap

- `programs/tiecamel-governance` — independent critical-approval Anchor program
- `packages/governance` — shared browser/server transaction and approval-intent SDK
- `packages/governance-idl` — generated program interface and TypeScript types

## Requirements

- Node.js 22.12 or newer (Node 24.6 is pinned in `.nvmrc`)
- pnpm 10.34.5

## Development

```bash
corepack enable
pnpm install
pnpm dev
```

The application runs at [http://localhost:3000](http://localhost:3000).
The landing page runs at [http://localhost:4321](http://localhost:4321).

To run one surface independently:

```bash
pnpm dev:app
pnpm dev:web
```

## Client environments

The app can run without credentials using the isolated ICN preview dataset. To
configure a real organization, copy the template to a named Vite environment:

```bash
cp apps/app/.env.example apps/app/.env.acme.local
pnpm dev:app -- --mode acme
```

Each client profile controls its display name, support contact, landing-page URL, Clerk instance, and Convex deployment without changing source code. Keep `CLERK_SECRET_KEY` server-only; only variables prefixed with `VITE_` are available to browser code.

Production services:

- Clerk for verified identity and MFA.
- Convex for tenant-scoped repositories, issues, changes, reviews, records,
  notifications, public snapshots, and audit events.
- Azure Blob Storage for quarantine, processed artifacts, and sealed evidence.
- Azure Key Vault, Service Bus, Functions, and Container Apps for document
  processing and provider publication.
- A financial “glass ledger” built from validated CSV imports and optional
  read-only native USDC wallet synchronization. Public financial pages read
  immutable sanitized snapshots, never the private transaction tables.
- Optional Solana manifest anchoring for independently verifiable repository
  commits and financial snapshots. Only canonical SHA-256 commitments go
  on-chain; TieCamel does not custody donations or operating funds.
- Optional Google Shared Drive destinations configured per repository.
  OneDrive for Business follows through the same provider contract.

Start the Convex development workflow after those values exist:

```bash
pnpm convex:dev
```

The repository domain is split across focused modules in `apps/app/convex`.
`platform.ts` seeds the isolated ICN tenant, while `repositories.ts`,
`issues.ts`, `changes.ts`, `uploads.ts`, `integrations.ts`,
`publications.ts`, `integrity.ts`, and `publicRepositories.ts` enforce
server-side access and workflow rules. Cloudflare hosts the app; Convex remains
the transactional control plane, while Azure owns binary storage and
background integration work.

The financial transparency model, publication invariant, CSV contract, and
privacy boundary are documented in
[`docs/financial-transparency.md`](docs/financial-transparency.md).

## Quality checks

```bash
pnpm check
pnpm test
pnpm build
```

# TieCamel

TieCamel is a repository-based accountability platform for mission-driven
organizations. Teams manage issues, review document changes, accept immutable
records, and selectively publish approved history.

## Workspace

- `apps/app` — TanStack Start repository platform and public SSR views
- `apps/web` — public Astro landing page
- `apps/integrations` — Azure Functions and provider adapters
- `infra/azure` — Azure Blob, Key Vault, Service Bus, and Container Apps IaC
- `apps/app/DEPLOYMENTS.md` — development and production environment map
- `PRODUCT_PLAN.md` — product, pilot, and technical roadmap

Shared packages will live under `packages/` as the product grows.

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
- Optional Google Shared Drive destinations configured per repository.
  OneDrive for Business follows through the same provider contract.

Start the Convex development workflow after those values exist:

```bash
pnpm convex:dev
```

The repository domain is split across focused modules in `apps/app/convex`.
`platform.ts` seeds the isolated ICN tenant, while `repositories.ts`,
`issues.ts`, `changes.ts`, `uploads.ts`, `integrations.ts`,
`publications.ts`, and `publicRepositories.ts` enforce server-side access and
workflow rules. Cloudflare hosts the app; Convex remains the transactional
control plane, while Azure owns binary storage and background integration work.

## Quality checks

```bash
pnpm check
pnpm test
pnpm build
```

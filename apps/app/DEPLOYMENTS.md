# TieCamel deployments

## Development

- Convex deployment: `careful-setter-342`
- Application URL: `https://careful-setter-342.convex.cloud`
- Dashboard: `https://dashboard.convex.dev/t/sanaan-khalid/tiecamel/careful-setter-342`
- Clerk: development instance using test keys
- Status: Azure document, repository publication, provider integration, and
  integrity schema/functions deployed; development Azure callbacks are active

The ignored `.env.development.local` file points local development to this deployment. Production builds do not load this file.

## Production

- Intended user-facing application origin: `https://app.tiecamel.com`, confirmed
  by the project owner on September 20, 2026. Individual passkey enrollment must
  use relying-party ID `app.tiecamel.com`. This confirmation is not a deployment
  or a verification of DNS, TLS or signing-provider setup.
- Convex deployment: `resolute-tortoise-895`
- Application URL: `https://resolute-tortoise-895.convex.cloud`
- Dashboard: `https://dashboard.convex.dev/t/sanaan-khalid/tiecamel/resolute-tortoise-895`
- Clerk: disabled with the reserved `.invalid` bootstrap issuer; production
  requires a separate live Clerk instance before authenticated routes are enabled
- Backend status (September 20, 2026): current repository, financial and governance
  functions/schema deployed from `0674fba`; production governance worker health
  returned HTTP 200 after deployment. This is not an onboarding launch.
- Frontend status (September 20, 2026): the project owner selected a labeled public
  demo. Deployed source `ff50239`, Cloudflare version
  `7275fa54-66e4-4e5d-a572-84caf8348325`, to `app.tiecamel.com` in `public-demo` mode.
  It opens the latest responsibility overview with a site-wide demo notice and
  browser-only sample data. Convex and Clerk connections are disabled for this
  frontend; it connects to neither development nor production client records.
  Live verification shows an explicit unavailable message. This is not onboarding.
- Azure integration: intentionally disabled. The existing Terraform deployment
  is the development integration plane and its signed callbacks target
  `careful-setter-342`; provision a separate production Terraform environment
  before setting production `AZURE_INTEGRATION_*` variables.

Do not use Clerk `pk_test_` or `sk_test_` credentials in production. Set `VITE_CONVEX_URL`, the live Clerk keys, and `CLERK_FRONTEND_API_URL` in the production hosting and Convex environments only after the authorization and tenant-isolation test suite passes.

See the [fresh readiness audit](../../docs/production-readiness-audit-2026-09-20.md)
for direct observations, deployment verification and untested launch gates.

Use `pnpm deploy:demo` for subsequent updates to this public demonstration. It
builds with explicit demo isolation before publishing. Do not substitute the
ordinary `deploy:app` command, which can inherit local Vite configuration.

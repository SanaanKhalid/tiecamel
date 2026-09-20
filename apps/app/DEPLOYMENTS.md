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
- Frontend status: latest observed Cloudflare release remains July 29, 2026,
  version `032d09f3-ef82-4b3a-904d-4e630f66f9ca`. Live settings show demo identity;
  its served bundle references development Convex. Frontend release is held pending
  a labeled-demo versus live-onboarding decision, not silently treated as current.
- Azure integration: intentionally disabled. The existing Terraform deployment
  is the development integration plane and its signed callbacks target
  `careful-setter-342`; provision a separate production Terraform environment
  before setting production `AZURE_INTEGRATION_*` variables.

Do not use Clerk `pk_test_` or `sk_test_` credentials in production. Set `VITE_CONVEX_URL`, the live Clerk keys, and `CLERK_FRONTEND_API_URL` in the production hosting and Convex environments only after the authorization and tenant-isolation test suite passes.

See the [fresh readiness audit](../../docs/production-readiness-audit-2026-09-20.md)
for direct observations, deployment verification and untested launch gates.

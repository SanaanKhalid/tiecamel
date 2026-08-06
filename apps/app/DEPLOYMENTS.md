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

- Convex deployment: `resolute-tortoise-895`
- Application URL: `https://resolute-tortoise-895.convex.cloud`
- Dashboard: `https://dashboard.convex.dev/t/sanaan-khalid/tiecamel/resolute-tortoise-895`
- Clerk: disabled with the reserved `.invalid` bootstrap issuer; production
  requires a separate live Clerk instance before authenticated routes are enabled
- Status: repository-platform schema deployed; Clerk intentionally remains
  unconfigured, so protected functions deny access and the hosted app continues
  to use its simulated demo provider
- Azure integration: intentionally disabled. The existing Terraform deployment
  is the development integration plane and its signed callbacks target
  `careful-setter-342`; provision a separate production Terraform environment
  before setting production `AZURE_INTEGRATION_*` variables.

Do not use Clerk `pk_test_` or `sk_test_` credentials in production. Set `VITE_CONVEX_URL`, the live Clerk keys, and `CLERK_FRONTEND_API_URL` in the production hosting and Convex environments only after the authorization and tenant-isolation test suite passes.

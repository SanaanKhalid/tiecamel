# TieCamel deployments

## Development

- Convex deployment: `careful-setter-342`
- Application URL: `https://careful-setter-342.convex.cloud`
- Dashboard: `https://dashboard.convex.dev/t/sanaan-khalid/tiecamel/careful-setter-342`
- Clerk: development instance using test keys
- Status: schema, auth configuration, and MVP workspace functions deployed

The ignored `.env.development.local` file points local development to this deployment. Production builds do not load this file.

## Production

- Convex deployment: `resolute-tortoise-895`
- Application URL: `https://resolute-tortoise-895.convex.cloud`
- Dashboard: `https://dashboard.convex.dev/t/sanaan-khalid/tiecamel/resolute-tortoise-895`
- Clerk: not configured; production requires a separate live Clerk instance
- Status: reserved, with no MVP schema deployment performed by this setup

Do not use Clerk `pk_test_` or `sk_test_` credentials in production. Set `VITE_CONVEX_URL`, the live Clerk keys, and `CLERK_FRONTEND_API_URL` in the production hosting and Convex environments only after the authorization and tenant-isolation test suite passes.

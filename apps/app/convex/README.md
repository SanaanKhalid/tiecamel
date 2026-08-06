# TieCamel Convex backend

This directory contains TieCamel's tenant-safe repository platform:

- `platform.ts` — organization overview and ICN seed
- `repositories.ts` — repository visibility, membership, and protection rules
- `issues.ts` — issue creation, workflow, and comments
- `changes.ts` — revisions, reviews, checks, and atomic acceptance
- `uploads.ts` — authorized quarantine sessions and processing callbacks
- `publicRepositories.ts` — approved public snapshot reads

Before enabling authenticated routes:

1. Create a Convex project for the client/environment.
2. Activate Clerk's Convex integration, or create the fallback `convex` JWT template with an `aud` claim of `convex`.
3. Add `CLERK_FRONTEND_API_URL` to the Convex deployment environment.
4. Add the generated `VITE_CONVEX_URL` to the client's local app environment profile.

For a schema-only production bootstrap, set `CLERK_FRONTEND_API_URL` to the
reserved non-resolving issuer `https://auth-disabled.tiecamel.invalid`.
Protected functions remain inaccessible because no JWT can be verified against
that issuer. Replace it with the production Clerk issuer before exposing
authenticated application routes.

Every internal operation resolves Clerk identity server-side, derives active
organization and repository membership from the database, and denies access by
default. A client-provided role or organization ID is never sufficient
authorization. Public readers query immutable public snapshots instead of
filtering internal data in the browser.

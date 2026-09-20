# Live readiness audit — September 20, 2026

## Verdict

**Not ready for real nonprofit onboarding.** A reachable website and successful
tests do not establish an operational client service. The audit began read-only;
the project owner then explicitly requested production deployment. The latest
Convex backend was deployed. The owner subsequently selected a clearly labeled
demo frontend release, which is now live; real client onboarding remains blocked.

## Follow-up: public demo released

After the audit, the owner explicitly requested option 1: publish the latest
features as a clearly labeled demo. Source `ff50239` is deployed as Cloudflare
version `7275fa54-66e4-4e5d-a572-84caf8348325` at `https://app.tiecamel.com`.

- The new responsibility overview is the landing page; responsibilities,
  approvals, community reporting, documents and financial previews are accessible.
- A site-wide notice explains sample data, browser-only changes and the absence
  of server uploads, real alerts and on-chain approvals.
- Explicit `public-demo` mode overrides backend/identity configuration. Built
  client/server assets were checked for the known Convex deployment addresses and
  embedded Clerk keys: none were found. The frontend is deliberately disconnected
  from both development and production Convex; the production backend remains
  separately deployed, not activated for anonymous demo users.
- Public demo routes receive the sample-data provider. Verification routes show
  an explicit unavailable message rather than mounting live proof queries.
- A live-browser server/client clock mismatch was found and fixed by rendering
  browser-specific sample state only after hydration. The final live browser check
  reported no console errors while checking overview, approvals, financials and
  settings. The local demo acknowledgement flow was also exercised.
- 122 application/integration tests, application TypeScript checks and the demo
  build passed. No provider configuration, Azure resources, private client
  records, signing authorities or production notification settings were changed.

The observations below describe the audit snapshot before this demo release.

## Direct observations before deployment

Checks were performed against the live services at approximately 19:54–19:59 UTC,
not inferred only from repository documentation.

| Area | Direct observation | Meaning |
| --- | --- | --- |
| App availability | `https://app.tiecamel.com/` returned HTTP 200 over validated HTTPS | Site reachable; not evidence of onboarding readiness |
| Frontend release | Cloudflare's latest deployment was July 29, 2026, version `032d09f3-ef82-4b3a-904d-4e630f66f9ca` | September hackathon frontend changes were not live |
| Frontend backend target | Live JS contained `VITE_CONVEX_URL=https://careful-setter-342.convex.cloud` | Published frontend configuration referenced development |
| Identity experience | Browser opened the seeded ICN workspace; settings showed “Current demo view”, “Demo identity” and a provider “Simulator” | This was a demonstration, not verified client access |
| Production functions | Convex metadata listed 64 functions/routes; governance, delivery and inbound modules were absent | Production backend was behind the repository |
| Production monitoring | `/health/governance` returned HTTP 404 | New governance monitoring endpoint was not deployed |
| Development monitoring | Same endpoint on development returned 200 with two current worker heartbeats | Workers running; not proof of alert delivery |
| Development alerts | Deployment variable names/presence checked: no Resend/Twilio credentials or enabled alert-delivery flag | Outbound alerts were not configured there |
| Azure inventory | Both accessible subscriptions inspected; TieCamel resources discovered only in `rg-tiecamel-dev`, tagged `dev` | No production TieCamel integration stack found in accessible inventory |
| Azure callbacks | Function App callback URLs targeted `careful-setter-342.convex.site` | Existing document integration is development-only |
| Azure availability | Development Function App running; `/api/health` returned 200 | Basic service reachability only; no upload/processing test performed |
| Storage protections | Records storage: public blob access false, shared-key access false, HTTPS-only, TLS 1.2 minimum; versioning and 30-day blob/container delete retention enabled | Useful development safeguards; not a tested production recovery plan |
| Alert routing | Development dead-letter metric alert enabled, with zero actions | No notification action attached to that rule |

The live frontend's absent Clerk configuration and demo branch were confirmed in
its served bundle as well as the settings UI. The development URL embedded in the
bundle does not by itself prove that the demo's records are persisted there.

Two unauthenticated, read-only production queries (`platform:workspace` and
`integrations:listConnections`) returned errors with no data, both before and
after deployment. The errors were generic; these checks alone do not prove the
complete authentication or cross-tenant authorization model.

Production Convex insights reported no OCC/resource-limit issues over the last
72 hours. This is a narrow diagnostic, not a functional or security sign-off.

## Authorized deployment and verification

- Source: `main` at `0674fba` (all previously committed implementation changes).
- Re-ran 115 application/integration tests and application TypeScript checking:
  passed. The two local-validator scenarios are excluded from the default suite;
  they were not rerun for this deployment-only change.
- Ran production Convex dry-run with type checking: schema valid, no index
  deletions proposed.
- Deployed to `resolute-tortoise-895` with type checking. Schema validation passed;
  new indexes were additive.
- Re-read live function metadata: 128 functions/routes, including governance,
  delivery, inbound intake and provider webhook routes.
- Production `/health/governance` changed from 404 to 200, with both responsibility
  and notification worker heartbeats current at 19:59 UTC. Response explicitly
  limits its claim to heartbeat health, not delivery or compliance.
- No provider settings were changed, test alerts sent, client files uploaded,
  signing gates removed, or Solana transactions broadcast.
- No Cloudflare frontend or Azure deployment was performed in this release step.

## Remaining launch gates

1. The labeled demo scope is now selected and published; it must not be advertised
   as client onboarding. A client release requires live authentication, production backend
   configuration and fail-closed behavior when configuration is incomplete.
2. Provision and verify a separate production document integration plane. Do not
   redirect development callbacks or reuse its client evidence store as production.
3. Configure and live-test intended notification channels with consenting test
   recipients; test failures, retries, escalation and monitoring notification routing.
4. Exercise real organization enrollment, invitations, membership revocation,
   cross-tenant denial, private document access and community disclosure boundaries.
5. Establish and test backup/restore, incident response, retention and manual
   deadline follow-up procedures with the pilot organization.
6. Complete individual signing before offering critical approval/closure. Turnkey
   setup remains deferred; no substitute signer has been selected or provisioned.

## Limits

This was an operational readiness audit, not a penetration test. Production
Convex access through the connector was metadata-only; production secrets and
client records were not inspected. Live Clerk administration, recovery restores,
real email/WhatsApp delivery, production document processing and real passkeys
were not tested. Absence of production Azure resources is limited to the two
accessible subscriptions and resources identifiable as TieCamel. No claim is made
about unrelated accounts or unobserved infrastructure.

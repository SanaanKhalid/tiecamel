# Governance operations runbook

## Pilot-readiness checklist

The board workspace includes a read-only checklist of registered categories,
source confirmation, eligible independent reviewers, messaging setup, verified
WhatsApp consent, notice inbox and worker freshness. Configuration alone is labelled
**Needs live test**, never delivered or pilot-ready. A fresh worker heartbeat does
not prove that a provider works. The secure-approval item remains blocked until the
individual-signing and finalized-receipt integration is completed and reviewed.

Use this sequence before relying on a pilot:

1. Inventory all known obligations with the board; omissions are not discovered by
   the app. Confirm exact deadlines against original authority notices.
2. Check assignments leave two independent reviewers, including a director. Verify
   the underlying people, not merely two membership records.
3. Configure provider secrets in the deployment environment, never in chat or Git.
   Test dedicated inbound routing and signed delivery callbacks with consenting users.
4. Exercise an unacknowledged notice, backup escalation, failed delivery and a missing
   worker heartbeat. Give an external outage responder a documented manual fallback.
5. Inspect the public community view while signed out; counts are automatic, details
   require disclosure review. Do not upload real private notices to a demo organization.
6. Complete the secure signing gates in [the program runbook](solana-anchor-program.md).
   Do not remove the live critical-closure block merely to make a demo appear complete.

Queued notifications recheck current membership, organization, role and assignment
before sending. A former owner who is no longer an eligible recipient will not receive
an old queued alert. Reading a provider receipt never acknowledges a responsibility.

## Deployment boundaries

Local UI and development Convex have been exercised. Current Convex functions were
also deployed to production on September 20, 2026, and worker heartbeats verified;
frontend and provider provisioning remain incomplete. This is **not** a production
launch or a guarantee that all obligations will be discovered. The system covers
the responsibilities registered by an organization. Critical pilot closure is
blocked until secure individual signing is integrated and provisioned.

Demo sessions can only use `demoOnly` organizations. Local simulated clocks never
affect Convex time. Demo alert jobs are suppressed. No pilot is seeded with sample
financial records or document fixtures.

## Email and WhatsApp

Configure these **server-side** in the intended Convex environment. Never use a
`VITE_` prefix for secrets and never commit them:

| Variable | Purpose |
| --- | --- |
| `TIECAMEL_ALERT_DELIVERY_ENABLED` | Must explicitly be `true` before sending |
| `TIECAMEL_APP_URL` | HTTPS application origin |
| `RESEND_API_KEY` | Sending and received-email retrieval |
| `TIECAMEL_ALERT_FROM` | Verified sender address |
| `RESEND_WEBHOOK_SECRET` | Signature verification for `/webhooks/resend` |
| `TIECAMEL_INBOUND_DOMAIN` | Dedicated receiving subdomain with Resend MX |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | Twilio API and callback authentication |
| `TWILIO_WHATSAPP_FROM` | Approved sender in E.164 format, without `whatsapp:` |
| `TWILIO_ALERT_TEMPLATE_SID` | Approved template; variable `1` is the secure app link |
| `TWILIO_VERIFY_SERVICE_SID` | WhatsApp ownership verification service |
| `TIECAMEL_WEBHOOK_BASE` | Exact public Convex HTTP origin, used in signed callbacks |

Use opted-in test recipients before enabling a live organization. WhatsApp requires
explicit individual consent and successful ownership verification. The UI provides
consent withdrawal. No SMS fallback is implemented or silently enabled.

Alerts contain a generic prompt and secure link, not notice contents, tax amounts,
donor data, privileged text or attachments. Board awareness remains available in
the application if every external delivery fails.

Resend POST retries use a stable idempotency key and end after five attempts or
20 hours (inside its documented 24-hour key window). WhatsApp ambiguous outcomes
are marked **uncertain**, not automatically resent. Check the provider's message
records before taking a manual follow-up action. A delivery/read receipt never
acknowledges, approves or resolves a responsibility.

Register provider callbacks at `/webhooks/resend` and `/webhooks/twilio`. Resend
requests require the signed raw body and a timestamp within five minutes. Twilio
signatures bind the exact configured callback URL, delivery ID and form values.
Out-of-order/duplicate callbacks cannot downgrade a delivered receipt. Receipts
arriving before the send response are retained and reconciled.

## Forwarded-notice intake

An authorized officer enables a random organization inbox address. A signed
`email.received` event is deduplicated by provider ID. The worker retrieves the
plain-text body from Resend; HTML is never rendered as active content. Mail never
supplies instructions to an agent, changes controls, acknowledges itself or closes
a case. An officer assigns responsibility and confirms the actual source deadline.

Attachments are currently counted, **not automatically imported**. Officers must
upload the original PDF/photo through the managed Azure document pipeline. Only a
processed managed document with matching content fingerprint can become live
closure evidence. Expanding automatic attachment ingestion requires its own
quarantine/scanning integration; it is not claimed as delivered here.

## Monitoring and incident response

- Responsibility scans run every five minutes, with paginated catch-up and
  deduplicated escalation recipients.
- Delivery workers run every minute. Worker leases prevent simultaneous sends;
  expired WhatsApp leases become uncertain instead of risking duplicates.
- The board sees provider-blocked, failed, accepted and delivered states separately.
- `GET /health/governance` returns 503 if either worker heartbeat is unknown or
  older than 15 minutes. Configure an **external** uptime monitor against this
  endpoint; the endpoint alone is not an independent watchdog.
- On monitor outage, confirm critical deadlines manually and use direct board
  contact. Do not treat an absent warning or green worker heartbeat as compliance.
- Acknowledgement stops neither the actual deadline nor the requirement for evidence.

## Before a pilot

1. Provision real Clerk membership, explicitly select the organization, and adopt
   its roster with real director roles. Do not use a demo token.
2. Verify private-repository permissions and protected document access with a member
   who has no access, a reviewer, and a director.
3. Confirm deadlines in the source's jurisdiction; the current date form clearly
   labels the browser's time zone and requires conversion from the original notice.
4. Configure outbound services and an external health monitor. Test delivery
   failure, missing consent, an expired session and a delayed scan.
5. Complete individual passkey/Solana provisioning before enabling critical closure.
6. Establish retention, privacy, legal review and board handover procedures with the
   organization. This workflow is not a substitute for legal or tax advice.

Provider references: [Resend sending](https://resend.com/docs/api-reference/emails/send-email),
[Resend webhook signatures](https://resend.com/docs/webhooks/verify-webhooks-requests),
[Twilio webhook security](https://www.twilio.com/docs/usage/webhooks/webhooks-security),
[WhatsApp templates](https://www.twilio.com/docs/whatsapp/tutorial/send-whatsapp-notification-messages-templates).

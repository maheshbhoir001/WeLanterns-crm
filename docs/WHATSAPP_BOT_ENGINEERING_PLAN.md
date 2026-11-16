# WeLanterns WhatsApp Bot — engineering and rollout plan

## Scope in this release
- Official Meta WhatsApp Cloud API only. No WhatsApp Web scraping, browser automation, reverse-engineered private endpoints, or unofficial libraries.
- Signed webhook verification and quick event persistence.
- Idempotent inbound event storage using Meta message IDs.
- Queue and outbox tables with bounded retries and SKIP LOCKED worker claims.
- Contact/conversation/message persistence.
- Menu, basic service selection, qualification intake, opt-out and human handover.
- Financial-advice and trading-signal requests are handed to a person.
- Staging database only; production CRM data remains unchanged.

## Repository branch
`feature/whatsapp-business-bot`

## Database environment
Staging project: `athnmealzrgqhqxxdexa`.
Production project is intentionally not migrated.

Tables:
- whatsapp_contacts
- whatsapp_conversations
- whatsapp_messages
- whatsapp_bot_sessions
- whatsapp_lead_intakes
- whatsapp_webhook_events
- whatsapp_outbox

RLS is enabled; client roles cannot write to WhatsApp operational tables. Server-side service role is required by webhook/worker routes and must never be exposed in a browser bundle.

## Vercel Preview-only secrets
Create these on the Preview environment for the feature branch:
- `SUPABASE_SERVICE_ROLE_KEY` — staging project's service-role key only.
- `META_APP_SECRET` — Meta app secret.
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN` — high-entropy random verification token.
- `WHATSAPP_ACCESS_TOKEN` — long-lived system-user access token.
- `WHATSAPP_PHONE_NUMBER_ID` — registered phone-number ID.
- `WHATSAPP_API_VERSION` — current Graph API version approved for the app.
- `WHATSAPP_WORKER_SECRET` — independent high-entropy bearer secret for worker.
- `WHATSAPP_TEST_SUPABASE_URL` and `WHATSAPP_TEST_SUPABASE_SERVICE_ROLE_KEY` — optional staging integration-test secrets.

Existing Preview `NEXT_PUBLIC_SUPABASE_URL` and publishable key must continue to point to staging. Never copy staging service-role credentials into Production.

## Meta onboarding checklist
1. Create a Meta Business app and add WhatsApp product.
2. Select or create the WeLanterns Business Portfolio and WABA.
3. Check the official in-product existing-number onboarding path. If Coexistence is offered and eligible, follow it. Otherwise plan a supported number migration or a separate dedicated number. Do not delete WhatsApp Business or deregister the number as a workaround.
4. Complete display-name review/business verification as required.
5. Create a system-user token with the minimum WhatsApp permissions required.
6. Configure callback URL:
   `https://YOUR-PREVIEW-DOMAIN/api/whatsapp/webhook`
7. Set the same verify token in Meta and Vercel. Subscribe to the messages field.
8. Add Preview secrets only and run the test number workflow first.

## Worker scheduling
The worker endpoint is `POST /api/whatsapp/worker` and requires:
`Authorization: Bearer $WHATSAPP_WORKER_SECRET`.
Schedule it every minute using Vercel Cron or an external scheduler only after Preview secrets are set. The scheduler must send the bearer header. Do not add a public unauthenticated worker endpoint.

## Test-driven development gates
1. Unit tests cover text normalization, STOP, human handover, menu, service routing, 24-hour service window, financial-safety routing.
2. Integration tests verify the staging schema when the optional staging test secrets are configured. Without those secrets, the database integration test is intentionally skipped.
3. GitHub Actions runs unit, integration, lint and Next build checks on the feature branch and pull requests.
4. Do not merge until CI is green and real Meta test-number inbound/outbound tests pass.

## Load test plan
Run on Preview only, using synthetic test contacts and no real customer phone numbers:
- 100 concurrent sessions / 5 minutes.
- 500 concurrent sessions / 10 minutes.
- 2,000 concurrent sessions / 15 minutes.
Measure webhook p50/p95/p99 latency, HTTP 2xx/4xx/5xx, queue depth, oldest event age, worker duration, duplicate event rate, outbound failures, Supabase connection/pool pressure, Vercel function duration and throttles.
Acceptance targets: webhook p95 < 500 ms; zero lost accepted events; idempotent processing; no sustained queue growth after the load stops; no production writes. These are targets, not measured results.

## Known pre-release gaps
- Existing-number Coexistence eligibility must be confirmed in Meta.
- The existing CRM inbox UI and employee assignment workflows are not yet implemented.
- Human handoff currently marks the conversation as handed off; the CRM user interface still needs a shared inbox and reply composer.
- The first qualification flow collects service and requirement; name/callback details and robust multi-turn state need completion.
- Approved WhatsApp templates and template sending outside the 24-hour service window are not yet implemented.
- Delivery retries, stale worker lock recovery, queue alerting, dead-letter review and webhook event retention/PII cleanup need hardening.
- Outbound free-form messages are cancelled when the recorded 24-hour customer-service window has expired. Approved template creation and sending are not yet implemented, so proactive follow-ups must remain disabled.
- The current app needs real Meta credentials before any live message can be sent.

## Privacy and financial-services guardrails
- Obtain appropriate consent for marketing messages; a customer-initiated enquiry is not blanket marketing consent.
- Honour STOP immediately and retain the opt-out record.
- Collect the minimum personal data needed; never ask for OTP, passwords, PINs or full card/bank credentials.
- Use approved scripts and disclosures. No return promises, suitability advice, securities solicitation, or trade execution by the bot.
- Establish privacy notice, retention period, access controls, incident response and vendor/data-processing review before production.

## Costs
The application code and self-hostable workflow are free/open-source components, but the overall service is not guaranteed free. WhatsApp Platform message/template charges, Vercel usage, Supabase plan/compute and optional AI provider usage may apply. Verify current India rates in Meta's official pricing view before launch.

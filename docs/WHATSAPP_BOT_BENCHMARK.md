# WhatsApp automation product benchmark for WeLanterns

Research reviewed on 16 November 2026. This is a feature benchmark, not a reproduction of proprietary code or private APIs.

## Products and patterns

### Chatwoot Community Edition
- Self-hosted open-source edition advertises shared inbox, WhatsApp and social channels, automations and reports without license fees; infrastructure and operations remain the operator's responsibility.
- WhatsApp conversations can be assigned, labelled, replied to and resolved.
- Approved templates are needed to initiate or re-engage after the 24-hour customer-service window.
Sources:
- https://www.chatwoot.com/community
- https://www.chatwoot.com/hc/user-guide/articles/1677832735-how-to-setup-a-whats_app-channel
- https://app.chatwoot.com/hc/user-guide/articles/1677492191-adding-inboxes

### respond.io
- Centralized multi-user inbox across WhatsApp and other channels.
- Lead capture, AI-assisted qualification, routing, lifecycle tracking, CRM sync and reporting.
- Useful pattern: an AI assistant should qualify and route, with a human taking over complex/high-risk cases.
Sources:
- https://respond.io/integrations/whatsapp
- https://respond.io/blog/whatsapp-team-inbox

### WATI
- Unified inbox, contact management, broadcasts, keyword automation and team analytics.
- Useful patterns: tags, owner assignment, non-office-hours replies, and reusable approved templates.
Sources:
- https://docs.wati.io/v2.2/reference/introduction
- https://www.wati.io/lp/wati/

### Interakt
- Shared team inbox, auto-assignment, sales pipeline, chatflows, APIs and webhooks.
- Useful patterns: ownership, lead pipeline, opt-out flow and reporting.
Sources:
- https://www.interakt.shop/pricing-us/
- https://apps.apple.com/in/app/interakt/id1573532290

## Recommended WeLanterns feature set

1. Shared inbox and assignment inside the existing CRM.
2. One canonical contact identity across leads and clients.
3. WhatsApp menu and service-specific qualification flows.
4. Auto-tagging by business vertical and product.
5. Human handoff with internal notes and assignment.
6. Approved template library with consent and service-window checks.
7. Lead conversion into existing CRM leads/clients without duplicate records.
8. Agent performance, response-time and conversion analytics.
9. AI draft suggestions grounded only in approved WeLanterns FAQs and policies.
10. Audit log, opt-out and retention controls.

## Architecture decision

Use the official Meta Cloud API as the transport. Keep customer and business data in Supabase, business rules in Next.js, and the agent workspace in the CRM. Do not use unofficial WhatsApp Web automation or protocol clones. Chatwoot is a valid fallback if building and maintaining a shared inbox becomes too expensive; its Community Edition is free software, but still needs hosting, patching, backups and Meta messaging charges.

## Capacity and limits

Meta documentation states Cloud API throughput can reach up to 1,000 messages/second, but that is not an app-level concurrency guarantee. WABA messaging tiers (for example TIER_2K) describe unique recipients that may be messaged outside a customer-service window in a rolling 24-hour period; they do not mean 2,000 simultaneous chat sessions are automatically approved. Confirm the actual tier and quality status in the WeLanterns WABA dashboard.

Sources:
- https://developers.facebook.com/documentation/business-messaging/whatsapp/overview
- https://developers.facebook.com/docs/whatsapp/cloud-vs-onprem/
- https://developers.facebook.com/docs/graph-api/reference/whats-app-business-account

## Pricing and "free" boundary

The CRM code, database schema and self-hosted bot logic can be built with free/open-source components. The overall service is not guaranteed to be free: Meta message/template pricing, hosting, database compute, monitoring, backups and optional AI usage may incur charges. Verify the current India rate card inside Meta before enabling campaigns.

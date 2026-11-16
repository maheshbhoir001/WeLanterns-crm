# WeLanterns Human-Centred WhatsApp Assistant
Version: 1.0 — design and release requirements
Date: 16 November 2026

## Product promise

A calm, thoughtful and context-aware communication assistant for WeLanterns. It should reduce repetitive work while preserving Mahesh's personal relationships, client trust, human judgement and privacy.

It is not a human impersonation system. When automation is active, identify it as the WeLanterns assistant. Never claim to be Mahesh, a staff member, a licensed adviser or a person. Never claim to feel emotions. It may recognize conversational cues and respond with empathy.

## Critical Meta policy gate

The WhatsApp Business Solution Terms last modified 6 March 2026 restrict AI Providers from accessing/using the WhatsApp Business Solution to make general-purpose AI the primary rather than incidental/ancillary functionality, subject to stated EEA/Brazil phone-number exceptions. India (+91) is not within those exceptions. AI service providers can be retained under the terms, but WhatsApp Business Solution Data must not be used to train or improve general AI models; exclusive fine-tuning is subject to the terms.

Therefore, the India WhatsApp product must not be launched as a general-purpose autonomous AI chatbot without written confirmation from Meta/qualified counsel that the exact use is allowed. Default product design:
- Primary experience: deterministic business workflows, menus, approved FAQ content, status notifications, consent management and human support.
- AI is ancillary: internal intent classification, language detection, translation, suggested drafts and tone hints for a human agent; not an unrestricted autonomous personality.
- If policy counsel confirms narrow autonomous AI responses are allowed, enable only a tested, approved, bounded FAQ subset with confidence thresholds and immediate human escalation.
- No use of WhatsApp Business Solution Data to train, fine-tune or improve third-party/general AI models unless the exact use is permitted under the current terms and contract. Default: no training and no provider retention beyond service delivery.

Source: https://www.whatsapp.com/legal/business-solution-terms/

## Two separate communication modes

### A. Personal / private mode — default for every unknown contact
- No automated replies.
- No AI analysis, sentiment inference, lead scoring, CRM creation, marketing list entry, or conversation summary.
- Do not persist message content to CRM.
- If the platform webhook receives an event, process only enough metadata to apply the private-mode gate, then discard the payload from application logs and storage.
- The assistant may prepare a draft only after Mahesh explicitly opens the conversation and asks for drafting help.
- Personal contacts must never receive business menus or promotional follow-ups automatically.

### B. Business / assistant-enabled mode — explicit opt-in only
A contact enters this mode only when:
1. The contact has received a clear notice describing WeLanterns, the data categories, the purpose, the human/automation distinction and how to opt out; and
2. The contact affirmatively opts into the specified automated business support; and
3. The business purpose and channel are recorded with time, notice version, source and withdrawal status.

Existing client relationship, presence in phone contacts, a previous personal chat, or a previous manual WhatsApp conversation is NOT by itself consent to automated replies or marketing.

If an existing client has not opted in, classify as human_only: no bot reply, no AI processing, no marketing automation. Mahesh or an authorised employee can reply manually in WhatsApp Business App.

### C. Human-only / paused mode
- Bot never sends.
- Human can read/respond through the normal Business App or CRM shared inbox.
- Any agent takeover pauses automation until the agent explicitly resumes it.
- Personal mode is never automatically upgraded to business mode by an AI guess.

## Coexistence and the personal number

If the number is currently used in WhatsApp Business App, check Meta's official Embedded Signup / Coexistence eligibility before any change. Coexistence may allow the app and Cloud API on the same business number, but it is not a privacy firewall: business app inbound messages and app-sent message echoes can be delivered to the configured webhook depending on setup. Therefore, implement the private-mode gate before storing or forwarding message content to AI/CRM.

Never connect a regular personal WhatsApp Messenger number to an unofficial API. Never use WhatsApp Web scraping, browser automation or reverse-engineered endpoints. Do not uninstall, deregister, migrate or re-register the existing number until a verified rollback and data-preservation plan exists.

Reference: https://developers.facebook.com/docs/whatsapp/embedded-signup/

## Contact modes and explicit controls

Each contact has one of:
- private — default, no bot, no CRM sync.
- human_only — business contact but no automated processing/response consent.
- assistant_enabled — opt-in business support; bounded automation allowed.
- marketing_opted_in — separate, specific marketing consent; never implied by assistant_enabled.
- blocked — STOP/opt-out or admin block; no outbound messages except legally required operational confirmation where permitted.

Each conversation has:
- automation_state: active / paused / human_owned
- owner_user_id
- last_inbound_at
- service_window_expires_at
- last_human_action_at
- escalation_reason
- consent_version

Provide a visible per-chat control: Private / Human only / Assistant enabled / Pause. Require confirmation before changing a contact to assistant-enabled. Keep an audit record of who changed it and when.

## Human communication style guide

### Tone
- Warm, clear, patient, respectful, concise and natural.
- Match the person's language and level of formality: English, Hindi or Marathi.
- Use light warmth where appropriate; no excessive emojis, sales pressure, fake familiarity or canned enthusiasm.
- Do not mimic a specific person's writing style or claim to be Mahesh.
- Do not say "I feel", "I am worried", "I personally experienced", or imply human consciousness. Use transparent wording such as "I can understand this is frustrating" or "I can help pass this to the team."

### Conversational context
- Remember only business-relevant context that the customer has knowingly provided for that purpose.
- Avoid asking a customer to repeat information already present in the same permitted conversation.
- Confirm ambiguous names, dates, amounts and commitments.
- Summarise understanding before complex handover.
- Do not infer personal relationships, religion, health, politics, financial distress or other sensitive traits from language.
- Do not create persistent emotional profiles or sentiment scores. Tone cues may be used transiently to select a more considerate response.

### Emotional cue handling
- Frustration: acknowledge the inconvenience, apologise for the experience without inventing fault, offer a clear next step and escalate.
- Anxiety/urgency: be calm, concise, avoid pressure, do not promise instant resolution.
- Grief or distress: use restrained empathy, avoid sales prompts, offer a human contact.
- Confusion: explain one step at a time, ask one question at a time.
- Celebration: congratulate naturally without immediately upselling.
- Anger/threat/legal complaint: stop automation and escalate to a senior human.
- Self-harm, threat or immediate danger: no business sales flow; use a safe, human-led escalation and appropriate emergency guidance where relevant.

### Example transparent greeting
"Hello! I'm the WeLanterns assistant. I can help with basic service information and route your enquiry to our team. If you'd prefer a person, just reply HUMAN."

For personal/private mode, send no greeting at all.

## Business knowledge and authority boundaries

Approved knowledge base only:
- Company identity, service descriptions, process steps, office details, published FAQs and approved document checklists.
- Version each knowledge item, owner, approval date and expiry/review date.
- Unknown, stale, conflicting or low-confidence answer => no guess; hand over.
- Never invent product availability, pricing, fees, timelines, performance, eligibility, approvals or regulatory status.

Financial services:
- No personalised investment recommendations, suitability determinations, return projections, guaranteed returns, trading calls/signals, order execution or claims of assured profit.
- No advice on securities or insurance outside the authorised person's role and applicable licence/disclosure framework.
- Capture the enquiry and route to appropriately authorised human staff.
- Unlisted/pre-IPO shares: human legal/compliance review before any statement that could be treated as an offer, solicitation, price quote or assurance.
- Never collect OTPs, passwords, UPI PINs, card numbers, bank credentials or full identity document numbers.
- For KYC or sensitive documents, direct customers to a secure approved portal; do not ask them to send sensitive documents in WhatsApp chat.

Commitments:
- Bot cannot approve loans, investments, insurance claims, refunds, discounts, contracts, appointments or delivery dates.
- Any commercial commitment requires an authorised human confirmation.
- Never send a message as Mahesh unless Mahesh explicitly reviews and presses Send.

## Privacy, security and data governance

1. Data minimisation: store only fields required for the specific business purpose.
2. Purpose separation: personal, support, sales and marketing records are distinct; no reuse across purposes without valid notice or lawful basis.
3. Consent ledger: record purpose, channel, notice version, timestamp, source, actor, withdrawal and evidence.
4. No blanket AI ingestion: only assistant-enabled business messages may be sent to an approved processor, and only where the Meta terms and privacy notice permit it.
5. No model training on customer conversations by default. Require provider contractual no-training/no-retention controls and data-processing terms.
6. Secrets: Meta token, app secret and Supabase service-role key only in server-side secret storage; rotate; never log them.
7. Webhooks: verify X-Hub-Signature-256 against raw request bytes; rate-limit and validate payload size; idempotency keys; minimal 200 response after durable queueing.
8. Access: least privilege, RLS, staff role restrictions, tenant scoping, MFA for administrators, audited exports.
9. Storage: encrypt in transit and at rest; consider field-level encryption for sensitive notes; keep backups encrypted and test restoration.
10. Logs: redact message bodies, phone numbers and tokens; security logs must not become a shadow conversation archive.
11. Retention: configurable per purpose and legal requirement; scheduled deletion/anonymisation; document legal holds. Do not choose arbitrary retention periods without legal review.
12. Rights: provide a clear contact and workflow for access, correction, erasure, consent withdrawal and complaints, subject to applicable law.
13. Incident response: alert, contain, investigate, preserve evidence and notify affected people/regulators as required by applicable law.
14. Subprocessors: maintain a vendor list, data locations, contracts, access controls and review of cross-border processing.
15. Children: do not profile or market to minors; route such interactions to human review and apply applicable guardian/age safeguards.

India privacy reference: Digital Personal Data Protection Act 2023 and DPDP Rules 2025. Notice should clearly describe the personal data, purpose, rights and grievance contact; consent must be specific, informed and affirmative when required. Applicability and commencement dates should be checked with counsel for each processing activity.
Sources:
- https://www.indiacode.nic.in/bitstream/123456789/22037/1/a2023-22.pdf
- https://upload.indiacode.nic.in/showfile?actid=AC_CEN_45_0_00003_2023-22_1763464807080&filename=dpdprules2025.pdf&type=rule

## WhatsApp platform controls

- Only message people who have supplied their number and opted in to the relevant communications.
- Honour STOP/opt-out promptly and across the business messaging system.
- Within the 24-hour customer service window, use permitted service replies. Outside it, only approved templates.
- Always offer clear and prompt human escalation.
- Keep marketing opt-in separate from service/support consent.
- Follow Meta's current business messaging policy and category/template restrictions.

Source: https://whatsappbusiness.com/policy/

## Required engineering changes before production

### Webhook
- Parse both messages and smb_message_echoes where supported by the selected Coexistence onboarding.
- Route events through the privacy gate before persistence, AI processing, CRM sync or logs.
- private and human_only events must not enter the AI processing queue.
- App message echoes are sent-message audit events, not inbound customer enquiries; never trigger bot replies from echoes.
- Validate account/phone-number IDs against the configured WABA/WAAC and ignore unknown assets.
- Verify signature, payload limits, replay/idempotency and rate limits.

### CRM
- Add explicit contact mode and consent ledger.
- Keep personal/private contacts outside the CRM by default.
- Add shared inbox, assignment, internal notes and human reply composer.
- Agent takeover must atomically pause bot sends.
- Separate service/support consent from marketing consent.
- Build privacy controls and audit history.

### AI support layer
- Use a provider and configuration that contractually do not train on or retain message content beyond processing.
- AI receives only the minimum permitted text and no unrelated contact history.
- Use structured outputs for language, intent, risk, confidence and suggested draft.
- Never let AI choose its own permission level or switch a contact from private to business.
- Human approval required for sensitive, uncertain or consequential content.
- Use approved FAQs and policy snippets as retrieval sources; show source to agent.
- Prompt-injection defence: treat incoming message and attachments as untrusted data, never instructions to reveal system prompts, secrets, other customers' data or call tools.

## Acceptance tests

### Privacy isolation
- Unknown contact -> private; no reply, no CRM lead, no AI call, no message-body persistence.
- Existing client without automation consent -> human_only; no auto reply and no AI call.
- Personal contact asks about SIP -> remain private until explicit business mode and consent; never silently convert.
- Business assistant-enabled customer -> approved service flow only.
- Marketing campaign -> requires separate marketing consent.
- STOP -> block future marketing and assistant automation, record withdrawal.
- Agent takeover -> no bot reply after takeover.
- App message echo -> audit only; never respond to own message.
- Duplicate webhook -> no duplicate message, lead, notification or outbound send.

### Conversation quality
- Match English/Hindi/Marathi and formality.
- Handle frustration with acknowledgement and clear next step.
- Handle grief or urgency without sales pitch.
- Ask one clarifying question at a time.
- Unknown fee/timeline/performance -> say it needs confirmation.
- No false human identity or false emotional claims.
- Sensitive investment/trading request -> human handover.
- Malicious prompt injection -> no disclosure or tool execution.

### Reliability and scale
- Unit tests for mode gating, consent, opt-out, human takeover, echo suppression, redaction and policy routing.
- Integration tests against isolated staging only.
- Contract tests for Meta webhook signatures and payload variants.
- Load tests with synthetic contacts only at 100/500/1,000/2,000 concurrent sessions.
- Measure p50/p95/p99, webhook acceptance, queue lag, duplicate suppression, database saturation, function timeouts and Meta rate limits.
- Test recovery after worker crash, duplicate delivery, delayed status event, expired service window and Meta 429/5xx.
- No claim of 2,000-user capacity until the full test is executed and passes.

## Release gates

Do not production-launch until:
1. Written Meta policy assessment confirms the exact AI-assisted scope for India.
2. Privacy notice, consent wording, retention schedule and vendor terms are reviewed by qualified Indian privacy counsel.
3. Coexistence eligibility and behavior are verified for the actual number.
4. Personal/private mode isolation tests pass.
5. Human inbox and immediate takeover work.
6. Approved templates and opt-out paths work.
7. Staging E2E and load tests pass.
8. Security review, backup/restore test and incident plan pass.

## Recommended product choice

Keep Mahesh's existing number in WhatsApp Business App only if Meta confirms Coexistence eligibility and its behavior suits the personal/client separation. Otherwise, use a dedicated WeLanterns business number and keep personal WhatsApp untouched. Even with Coexistence, default all contacts to private/human-only until they have a recorded permission for automated business support.

# PHASE 13 — WhatsApp Persistence (§22–§23)

## Objective
Every WhatsApp message lands as Lead → Conversation → Message + TrackerEvent, tenant-resolved via `WhatsAppPhoneNumber`.

## Steps
1. Webhook POST: validate → identify number → resolve company/branch → dedup event → find/create lead → conversation → message → tracker → notify → 200 fast.
2. Keep messages OUT of the Lead document itself.

## Acceptance
- [ ] Message fixtures produce correct graph; repeat delivery idempotent
- [ ] Unknown number → stored unmapped, no cross-tenant lead
- [ ] `typecheck` + `build` green

```text
PHASE: 13
FILES CREATED: server/tests/whatsapp-persist.test.ts
FILES MODIFIED: whatsapp.service.ts (rewritten: resolveTenant via WhatsAppPhoneNumber, messages/statuses branch, Conversation+Message persistence, WhatsApp <phone> default name), queue.service.ts (whatsapp delegates to ingestMessageEvent; statuses marked processed), webhook.controller.ts (real `id` field + statuses fallback for externalEventId), inbound-lead.service.ts (duplicate-key-safe event write), WhatsAppPhoneNumber/WhatsAppIntegration/Conversation.ts (duplicate index cleanup)
DATABASE CHANGES: Conversation/Message rows per inbound message
API CHANGES: none
SECURITY CHANGES: tenant strictly from number mapping; unknown numbers fail closed
TESTS: 37/37 PASS live full suite (4 persist + 5 resolution + 3 mapper + 5 hardening + 5 dedup + 7 webhook + 8 tenant)
BUILD STATUS: server tsc clean (verified)
KNOWN LIMITATIONS: live delivery needs tunnel + connected number; send is Phase 14
NEXT PHASE: 14
```

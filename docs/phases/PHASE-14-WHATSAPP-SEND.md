# PHASE 14 — WhatsApp Send (§24)

## Objective
Real `WhatsAppService.sendMessage()` honoring conversation windows + templates.

## Steps
1. Cloud API send via current docs (Phase 10 version); template vs session-message branching.
2. Store outbound messages as `Message(direction: outbound)`; surface window/template errors cleanly.

## Acceptance
- [ ] Session message inside window sends; outside window requires template (tested with fixtures/mocks)
- [ ] `typecheck` + `build` green

```text
PHASE: 14
FILES CREATED: server/tests/whatsapp-send.test.ts
FILES MODIFIED: whatsapp.service.ts (real POST /{version}/{phoneNumberId}/messages, Bearer token, 10s timeout, template fallback on window errors, outbound Message + conversation rows, redacted errors)
DATABASE CHANGES: outbound Message rows + conversations on send
API CHANGES: sendMessage returns {success, messageId?, via?, error?} (no prior callers)
SECURITY CHANGES: token in Authorization header only, never logged; failures fail closed
TESTS: 41/41 PASS live full suite (4 send + 4 persist + 5 resolution + 3 mapper + 5 hardening + 5 dedup + 7 webhook + 8 tenant)
BUILD STATUS: server tsc clean (verified)
KNOWN LIMITATIONS: live send needs connected number + approved template; WHATSAPP_GRAPH_VERSION env override available
NEXT PHASE: 15
```

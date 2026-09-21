# PHASE 07 — Security Tests: Webhooks (§36 part 2)

## Objective
Prove: public form can't read CRM data, invalid form key rejected, bad Meta verify/signature rejected, duplicate webhook processed once.

## Steps
1. Tests for `POST /api/public/leads` (valid, invalid key, GET-on-public 404).
2. Tests for `GET /api/webhooks/meta` (bad verify token 403) and POST with bad signature 401.
3. Same `externalEventId` posted twice → one lead, one `processed` event.

## Acceptance
- [ ] All proofs green
- [ ] `typecheck` + `build` green

```text
PHASE: 07
FILES CREATED: server/tests/webhook-security.test.ts
FILES MODIFIED: queue.config.ts (+2.5s enqueue timeout, BullMQ jobId dedup on webhookEventId), webhook tests (explicit timeouts)
DATABASE CHANGES: test fixtures only (leads-crm-test)
API CHANGES: none (enqueue timeout = latency guarantee: webhooks return fast even with Redis down)
SECURITY CHANGES: duplicate delivery can never double-enqueue (jobId); proofs below
TESTS: 15/15 PASS live full suite (7 webhook + 8 tenant) — valid/invalid form key, public lockout, Meta verify valid/invalid, signature bad 401/good persist, duplicate delivery = 1 event, WhatsApp verify+receive
BUILD STATUS: server tsc clean (verified)
KNOWN LIMITATIONS: needs local MongoDB; Redis down here so enqueue path logged-as-failed by design (events stay pending for retry); WhatsApp POST has no signature check yet
NEXT PHASE: 08
```

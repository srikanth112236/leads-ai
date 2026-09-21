# PHASE 15 — Notifications (§28)

## Objective
Async lead-created notifications: in-app/FCM to assigned team + optional Brevo email; never block webhooks.

## Steps
1. Real FCM sender + Brevo sender behind `notification` queue; per-company config.
2. Failure → retry with backoff, no webhook impact.

## Acceptance
- [ ] Lead ingest → queued notification → delivered (or logged in dev)
- [ ] `typecheck` + `build` green

```text
PHASE: 15
FILES CREATED: server/src/common/models/Notification.ts, server/tests/notification-dispatch.test.ts
FILES MODIFIED: notification.service.ts (dispatch router + in-app rows + FCM/Brevo senders with key checks), queue.config.ts (notifications worker), models/index.ts, .env.example (BREVO_API_KEY, BREVO_SENDER)
DATABASE CHANGES: notifications collection
API CHANGES: none (internal; no listing endpoint yet — Phase 17/18)
SECURITY CHANGES: keys server-side only; missing keys skip gracefully, never throw
TESTS: 44/44 PASS live full suite (3 dispatch + 4 send + 4 persist + 5 resolution + 3 mapper + 5 hardening + 5 dedup + 7 webhook + 8 tenant)
BUILD STATUS: server tsc clean (verified)
KNOWN LIMITATIONS: live push/email need FCM/BREVO keys; no device-token collection yet
NEXT PHASE: 16
```

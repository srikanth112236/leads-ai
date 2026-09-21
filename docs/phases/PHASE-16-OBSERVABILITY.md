# PHASE 16 — Observability + Secret Hygiene (§41–§42)

## Objective
Answer for any event: provider, external ID, company, branch, lead, duplicate?, processed?, fail reason, retries. Prove no secret leaks.

## Steps
1. Event-trace query (by `externalEventId` → event + lead + sources + tracker rows).
2. Grep audit: tokens/secrets absent from logs, errors, audit trail, API responses; fix offenders.
3. Stable error codes review on webhook paths (no stack traces to clients).

## Acceptance
- [ ] Trace demo for one website + one Meta + one WhatsApp event
- [ ] Secret-grep clean
- [ ] `typecheck` + `build` green

```text
PHASE: 16
FILES CREATED: docs/observability.md, server/tests/event-trace.test.ts
FILES MODIFIED: webhook.controller.ts (+getTrace: tenant-scoped chain with captchaToken redaction), webhook.routes.ts (+GET /trace before /:id)
DATABASE CHANGES: none (reads only)
API CHANGES: GET /api/webhooks/trace?provider=&externalEventId= (JWT, tenant-scoped)
SECURITY CHANGES: secret grep audit clean (tokens only in auth headers, secrets select:false, login tokens by design); trace redacts captchaToken; Phase 17 warned to exclude secrets from integration endpoints
TESTS: 47/47 PASS live full suite (3 trace + 3 dispatch + 4 send + 4 persist + 5 resolution + 3 mapper + 5 hardening + 5 dedup + 7 webhook + 8 tenant)
BUILD STATUS: server tsc clean (verified)
KNOWN LIMITATIONS: trace covers lead/sources/tracker (messages/notifications join is Phase 18 UI work)
NEXT PHASE: 17
```

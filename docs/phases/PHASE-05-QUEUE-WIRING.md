# PHASE 05 — Queue Wiring (§26)

## Objective
Webhooks return fast; all heavy work flows workers → `QueueService` → `InboundLeadService`.

## Steps
1. Webhook controllers persist `WebhookEvent` then `addMetaLeadJob` / `addWhatsAppJob` and return 200.
2. `startQueueWorkers` processors call `QueueService.processInboundLead` (not just log).
3. Start workers in `server.ts`; add explicit `ioredis` dep if URL-options prove flaky.

## Acceptance
- [ ] POST webhook → 200 fast + `pending` event row → worker marks `processed` + lead created
- [ ] Worker crash/retry path observed in logs
- [ ] `typecheck` + `build` green

```text
PHASE: 05
FILES CREATED: —
FILES MODIFIED: webhook.controller.ts (idempotent persist + enqueue, 200 even if Redis down), queue.service.ts (+processWebhookJob with status/attempts lifecycle), queue.config.ts (workers call QueueService via lazy import), server.ts (starts workers, boot survives Redis outage)
DATABASE CHANGES: none (uses WebhookEvent status/attempts/processedAt/leadId/error)
API CHANGES: none (latency behavior: webhooks persist + enqueue, return 200 fast)
SECURITY CHANGES: duplicate delivery can no longer 500 on unique index (findOne-first)
TESTS: typecheck clean; e2e proofs in Phases 07–08
BUILD STATUS: server tsc clean (verified)
KNOWN LIMITATIONS: Meta/WhatsApp ingest fails gracefully ('Company ID required') until Phase 12/13 add mapping resolution; notification delivery still stub (Phase 15)
NEXT PHASE: 06
```

# PHASE 12 — Meta Tenant Resolution + E2E (§17–§18)

## Objective
leadgen → page/form mapping → company+branch → `InboundLeadService` → queue, idempotent.

## Steps
1. Resolve tenant ONLY from `MetaLeadForm`/`MetaPage` mappings.
2. Webhook POST: verify → persist event → dedup by `externalEventId` → enqueue → 200 fast.
3. Worker: retrieve → map → ingest → mark processed / error+retry.

## Acceptance
- [ ] Unknown form/page → event stored as failed with reason, no lead created
- [ ] Duplicate delivery → single lead
- [ ] `typecheck` + `build` green

```text
PHASE: 12
FILES CREATED: server/tests/meta-resolution.test.ts
FILES MODIFIED: meta.service.ts (+extractIds/resolveTenant/ingestLeadEvent; fixed dropped signature + integration fallback), queue.service.ts (meta jobs delegate to ingestLeadEvent), MetaPage/MetaAdAccount/MetaLeadForm.ts (duplicate index cleanup)
DATABASE CHANGES: none (uses Phase 04 mappings)
API CHANGES: none
SECURITY CHANGES: unmapped form/page can never create a lead (failed with reason); tenant strictly from CRM config
TESTS: 33/33 PASS live full suite (5 resolution + 3 mapper + 5 hardening + 5 dedup + 7 webhook + 8 tenant)
BUILD STATUS: server tsc clean (verified)
KNOWN LIMITATIONS: live retrieval needs real Page token; needs tunnel + Live app for real delivery
NEXT PHASE: 13
```

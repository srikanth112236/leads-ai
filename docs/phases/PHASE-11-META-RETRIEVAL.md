# PHASE 11 — Meta Retrieval + Field Mapper (§19)

## Objective
Real `GET /{leadgen_id}` via Graph API; robust `field_data` → normalized lead mapper preserving all IDs/metadata.

## Steps
1. Server-side fetcher using page access token (never to frontend); no token logging.
2. Mapper: `full_name`/`email`/`phone_number` (+ common variants), preserve leadgen/page/form/ad/campaign/`created_time`/raw.
3. Unit-test mapper with fixture payloads.

## Acceptance
- [ ] Mapper tests green ( incl. variant field names )
- [ ] No secret in logs/responses (Phase 16 audits)
- [ ] `typecheck` + `build` green

```text
PHASE: 11
FILES CREATED: server/src/modules/meta/meta-lead.mapper.ts, server/tests/meta-mapper.test.ts
FILES MODIFIED: meta.service.ts (META_GRAPH_VERSION const, real GET /v{ver}/{leadgen_id} with Page token via +accessToken select, 10s timeout, code-only error logs)
DATABASE CHANGES: none
API CHANGES: none (internal)
SECURITY CHANGES: token server-side only, never logged; Graph errors logged by code/message
TESTS: 3/3 mapper tests green (standard, variant/split names, custom-field preservation + unknown-shape safety)
BUILD STATUS: server tsc clean (verified)
KNOWN LIMITATIONS: live retrieval needs real Page token + LeadGen ID (network); tenant wiring is Phase 12
NEXT PHASE: 12
```

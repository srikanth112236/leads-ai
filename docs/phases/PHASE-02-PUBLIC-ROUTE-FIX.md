# PHASE 02 — Public Route Fix (§29)

## Objective
Expose exactly `POST /api/public/leads` (no JWT, form-key only), keep the old path working or remove it deliberately.

## Steps
1. Mount website submit at `/api/public/leads` in `app.ts`; decide fate of `/api/inbound/public/leads` (redirect or remove).
2. Verify rate limiter + form-key resolution still apply; form key must allow submit ONLY.
3. Update client docs/README endpoint list.

## Acceptance
- [ ] `POST /api/public/leads` with valid key → 201 (or 200 duplicate)
- [ ] Invalid key → 404, no data leaked
- [ ] `typecheck` + `build` green

```text
PHASE: 02
FILES CREATED: —
FILES MODIFIED: server/src/app.ts (mount /api/public), server/src/modules/inbound/inbound.routes.ts (old path removed)
DATABASE CHANGES: none
API CHANGES: POST /api/public/leads (canonical, no JWT, form-key only); old /api/inbound/public/leads removed
SECURITY CHANGES: public surface = submit-only route (publicLimiter + form-key resolution, no CRM reads)
TESTS: typecheck clean; behavioral proofs in Phase 07
BUILD STATUS: server tsc clean (verified)
KNOWN LIMITATIONS: live POST not executed here (needs MongoDB)
NEXT PHASE: 03
```

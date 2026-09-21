# PHASE 06 — Security Tests: Tenant Isolation (§36 part 1)

## Objective
Prove with tests: Company A ⇏ Company B leads (read + update), Branch A ⇏ Branch B, `companyId`/`branchId` in body can't escape isolation.

## Steps
1. `server/tests/setup.ts` (in-memory Mongo or test DB + fixtures: 2 companies, branches, users per role).
2. Tests: cross-company GET 403, cross-company PUT 403, cross-branch GET 403, body `companyId` override 403, SUPER_ADMIN passes.
3. `npm test` script runs them.

## Acceptance
- [ ] All 5+ proofs green in CI-style run
- [ ] `typecheck` + `build` green

```text
PHASE: 06
FILES CREATED: server/tests/setup.ts, server/tests/tenant-isolation.test.ts
FILES MODIFIED: lead.controller.ts (+loadScopedLead company+branch check on getById/update/remove/assign; update strips tenant fields from body), jest.config.js (tests root), package.json (@types/supertest), User.ts + WebsiteLeadForm.ts (duplicate index cleanup)
DATABASE CHANGES: test fixtures only (leads-crm-test)
API CHANGES: update/remove/assign now 403 cross-tenant (were unguarded); update ignores companyId/branchId in body
SECURITY CHANGES: single-resource endpoints enforce company + branch rules server-side
TESTS: 8/8 PASS live (npx jest tests/tenant-isolation.test.ts) — cross-company read/update block, cross-branch block, body escape 403, create ignores foreign companyId, superadmin + unauthenticated paths
BUILD STATUS: server tsc clean (verified)
KNOWN LIMITATIONS: needs local MongoDB (TEST_DATABASE_URL or leads-crm-test)
NEXT PHASE: 07
```

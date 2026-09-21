# PHASE 03 — Missing Models A (§5): LeadNote, LeadActivity, BranchMembership

## Objective
Add the three tenant-aware models with indexes; wire `BranchMembership` into auth context (`allowedBranchIds`).

## Steps
1. `LeadNote` (leadId, companyId, branchId, authorId, body), `LeadActivity` (leadId, companyId, actor, action, metadata).
2. `BranchMembership` model (userId, branchId, role, isActive) + unique index.
3. Export from `models/index.ts`; add `GET/POST /api/leads/:id/notes` persistence (replace stub).

## Acceptance
- [ ] Notes/activities save scoped to company+branch; cross-tenant read blocked
- [ ] `typecheck` + `build` green

```text
PHASE: 03
FILES CREATED: server/src/common/models/{LeadNote,LeadActivity,BranchMembership}.ts
FILES MODIFIED: server/src/common/models/index.ts, auth.controller.ts (allowedBranchIds from memberships on login+refresh), lead.controller.ts (notes persist + NOTE_ADDED activity)
DATABASE CHANGES: 3 new collections + indexes (leadId/created, companyId, unique user+branch)
API CHANGES: GET /api/leads/:id/notes now returns persisted notes; POST /:id/notes now takes {body} (was {note}, echoed only) and persists with tenant check
SECURITY CHANGES: notes scoped to lead's company; authorId/branchId taken from server context, never body; login tokens now carry real allowedBranchIds
TESTS: typecheck clean; behavioral proofs in Phase 06
BUILD STATUS: server tsc clean (verified)
KNOWN LIMITATIONS: no notes UI yet (Phase 17); branch-level note filtering relies on lead scope
NEXT PHASE: 04
```

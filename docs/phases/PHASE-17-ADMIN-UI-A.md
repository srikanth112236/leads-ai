# PHASE 17 — Admin UI A (§32–§34)

## Objective
Role-scoped UI: Super Admin companies/branches/integrations; Company Admin own-company management; branch users see only authorized data.

## Steps
1. Role-gated nav + route guards (server remains source of truth).
2. Companies, branches, users, integrations pages with tenant-scoped queries.
3. Lead list columns: source, status, branch, assignee, created, score.

## Acceptance
- [ ] Each role sees only permitted data in UI (server tests already prove API)
- [ ] Client `tsc` + `vite build` green

```text
PHASE: 17
FILES CREATED: server user module (routes+controller), server/tests/users.test.ts, client RequireRole/UsersPage/IntegrationsPage
FILES MODIFIED: User.ts (password select:false), auth.controller.ts (+password selects), app.ts (/api/users), company+admin controllers (real integrations status), Layout (role nav), App.tsx (role guards), LeadsPage (source/status/branch/assignee/score columns)
DATABASE CHANGES: none
API CHANGES: GET /api/users (tenant-scoped, password never selected/returned); integrations endpoints now return real status rows (secrets excluded by schema)
SECURITY CHANGES: password hashes unreachable via any endpoint (proven by test asserting no $2b$ in response); UI gating is defense-in-depth only
TESTS: 49/49 PASS live full suite (2 users + rest); client tsc + vite build green
BUILD STATUS: server tsc + client tsc + vite build clean (all verified)
KNOWN LIMITATIONS: no create/edit forms yet; branch names on Users page show raw IDs
NEXT PHASE: 18
```

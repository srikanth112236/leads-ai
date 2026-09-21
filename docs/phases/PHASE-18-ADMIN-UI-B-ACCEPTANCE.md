# PHASE 18 — Webhook Monitor + Audit Logs + §43 Acceptance

## Objective
Close the loop: webhook monitoring, audit logs, then the full 33-item acceptance run with evidence.

## Steps
1. Webhook monitor page (provider, event, received, status, attempts, error, company, branch).
2. Audit log model + UI for integration/auth changes.
3. Walk §43 checklist item by item; record evidence (test output, build logs, trace examples).

## Acceptance
- [ ] All 33 §43 boxes checked with evidence links
- [ ] Production builds (server + client) succeed from clean checkout

```text
PHASE: 18
FILES CREATED: AuditLog model + audit service, tests/admin-ops.test.ts, client WebhooksPage/AuditLogsPage, docs/ACCEPTANCE.md
FILES MODIFIED: company/branch/lead controllers (audit hooks), admin controller (real webhooks/audit/branch-leads reads), webhook controller+routes (auth tenant-scoped list/detail), Layout/App (nav + guards)
DATABASE CHANGES: AuditLog collection
API CHANGES: GET /api/webhooks (+filters/pagination, auth), GET /api/webhooks/:id (auth), GET /api/admin/audit-logs (real), GET /api/admin/companies/:id/webhooks (real)
SECURITY CHANGES: audit trail on company/branch/assign mutations; previously open webhook reads now authed + scoped
TESTS: 53/53 PASS live full suite (4 admin-ops + rest); client tsc + vite build green
BUILD STATUS: server tsc + client tsc + vite build clean (all verified)
KNOWN LIMITATIONS: live-only items listed in docs/ACCEPTANCE.md (seed run, real tokens, Redis, FCM/Brevo)
NEXT PHASE: DONE
```

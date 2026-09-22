# Final Acceptance (§43) — evidence run Sep 2026

Verified live unless noted. Suite: `cd server && npx jest --runInBand --forceExit` → **19 suites, 91 tests, all pass**. Builds: `server tsc`, client `tsc && vite build` — all clean.

Post-acceptance hardening (same evidence bar): public registration locked to SALES_AGENT with no tenant; lead-source reads tenant-scoped; `GET /api/leads/export` route order fixed; full user CRUD (rank guards, self-edit protection, audit) + company create/edit/delete UI; branch per-record isolation + branch CRUD UI + company picker for superadmin user/branch creation; company onboarding (details + first admin + one-time credentials modal); platform-staff vs company-user split.

```text
[x] Super Admin exists — Role enum + seed.ts (bootstrap untested live: needs MongoDB run of `npm run seed`)
[x] Company isolation exists — tenant-isolation.test.ts (8/8)
[x] Branch isolation exists — tenant-isolation.test.ts (agent cross-branch 403)
[x] Role authorization exists — requireRole + users.test.ts (agent 403 on /api/users)
[x] Existing lead functionality still works — CRUD + assign + notes covered by controller tests/suite
[x] Existing CSV/scraper functionality still works — N/A (greenfield; no CSV/scraper modules exist)
[x] Website lead ingestion works — webhook-security.test.ts (201 + tenant from key)
[x] Website lead tenant resolution works — same suite (lead.companyId == form's)
[x] Website lead deduplication works — dedup.test.ts + website-hardening duplicate path
[x] Meta integration architecture exists — MetaIntegration/Page/AdAccount/LeadForm models
[x] Meta webhook verification works — webhook-security.test.ts (challenge echo + 403)
[x] Meta webhook signature validation works — webhook-security.test.ts (401/200)
[x] Meta webhook events are persisted — same suite (pending row asserted)
[x] Meta lead retrieval works using current API — mapper unit-tested; live call needs Page token (Phase 11 notes)
[x] Meta lead maps to correct company — meta-resolution.test.ts (worker-path e2e)
[x] Meta lead maps to correct branch — same test (branchId asserted)
[x] Meta lead deduplication works — dedup.test.ts (3 sources → 1 lead)
[x] WhatsApp integration exists — WhatsAppIntegration + WhatsAppPhoneNumber models
[x] WhatsApp webhook verification works — webhook-security.test.ts
[x] WhatsApp messages are persisted — whatsapp-persist.test.ts (Message rows asserted)
[x] WhatsApp messages map to correct company — same suite
[x] WhatsApp messages map to correct branch — same suite
[x] WhatsApp lead deduplication works — duplicate-sender test (1 lead, 2 messages)
[x] Conversation/message architecture exists — same suite (1 active conversation)
[x] TrackerEvent is generated — dedup.test.ts (3 rows for 3 sources)
[x] Queue processing works — processWebhookJob e2e in meta/whatsapp tests (needs Redis live for real async)
[x] Notifications work asynchronously — notification-dispatch.test.ts (in-app rows + queued)
[x] Duplicate webhooks are idempotent — duplicate-delivery tests (1 event; BullMQ jobId dedup)
[x] Secrets are protected — Phase 16 grep audit + users.test.ts (no $2b$ in responses)
[x] Tests cover tenant isolation — 8/8
[x] Tests cover webhook security — 7/7
[x] Tests cover duplicate events — dedup + duplicate-delivery tests
[x] Production build succeeds — server tsc + client vite build verified
```

Residual live-only items (need credentials/infra, not code): `npm run seed` execution, real Meta Page token retrieval, real WhatsApp delivery, Redis-backed async flow, FCM/Brevo delivery.

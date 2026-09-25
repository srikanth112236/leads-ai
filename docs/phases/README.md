# Implementation Phases — Multi-Tenant Lead CRM

Source: `multi-tenant-lead-crm-inbound-opencode-muse-directive.md` §38, expanded into small chunks.
Priority: **security → tenant isolation → correctness → idempotency → maintainability → integrations → UI polish.**

How to work a phase: implement → `typecheck` → `build` → fill the §44 report block at the bottom of the phase file → mark status here.

| Phase | File | Scope | Status |
|---|---|---|---|
| 00 | PHASE-00-REPO-AUDIT.md | Repository audit (§45) | DONE |
| 01 | PHASE-01-SEED-BOOT.md | Seed SUPER_ADMIN + demo tenant, dev boot runbook | IN PROGRESS |
| 02 | PHASE-02-PUBLIC-ROUTE-FIX.md | Remap public endpoint to `POST /api/public/leads` | DONE |
| 03 | PHASE-03-MISSING-MODELS-A.md | `LeadNote`, `LeadActivity`, `BranchMembership` | DONE |
| 04 | PHASE-04-MISSING-MODELS-B.md | `MetaPage`, `MetaAdAccount`, `MetaLeadForm`, `WhatsAppPhoneNumber` | DONE |
| 05 | PHASE-05-QUEUE-WIRING.md | Workers → `QueueService` → `InboundLeadService`, enqueue from webhooks | DONE |
| 06 | PHASE-06-TESTS-TENANT.md | §36 tenant isolation proofs (company/branch block, body escape) | DONE (8/8 live) |
| 07 | PHASE-07-TESTS-WEBHOOK.md | §36 webhook proofs (form key, Meta verify/signature, dup webhook) | DONE (15/15 full suite) |
| 08 | PHASE-08-TESTS-DEDUP.md | §36 dedup proofs (duplicate merge, WhatsApp cross-company) | DONE (20/20 full suite) |
| 09 | PHASE-09-WEBSITE-HARDENING.md | Honeypot/CAPTCHA hook, DTO validation, async processing (§14) | DONE (25/25 full suite) |
| 10 | PHASE-10-META-DOCS.md | Verify current Meta docs, record version + URLs (§39) | DONE |
| 11 | PHASE-11-META-RETRIEVAL.md | Real Graph API retrieval + field mapper | DONE (3/3 mapper tests) |
| 12 | PHASE-12-META-RESOLUTION.md | Tenant resolution from mappings + dedup + queue e2e | DONE (33/33 full suite) |
| 13 | PHASE-13-WHATSAPP-PERSIST.md | `Conversation`/`Message` persistence per event | DONE (37/37 full suite) |
| 14 | PHASE-14-WHATSAPP-SEND.md | Cloud API send + template/window rules (§24) | DONE (41/41 full suite) |
| 15 | PHASE-15-NOTIFICATIONS.md | Real FCM/Brevo senders behind queue (§28) | DONE (44/44 full suite) |
| 16 | PHASE-16-OBSERVABILITY.md | Per-event trace + secret redaction audit (§41–§42) | DONE (47/47 full suite) |
| 17 | PHASE-17-ADMIN-UI-A.md | Companies/branches/integrations UI, role-gated nav | DONE (49/49 + client build) |
| 18 | PHASE-18-ADMIN-UI-B-ACCEPTANCE.md | Webhook monitor, audit logs + full §43 acceptance run | DONE (53/53 + ACCEPTANCE.md) |
| 19 | PHASE-19-META-OAUTH.md | Self-serve Meta OAuth (Company Admin connect) | DONE (74/74 full suite) |
| 20 | PHASE-20-MULTI-PORTFOLIO.md (this file is the plan; implementation described below) | Multi-portfolio Meta + default branch | DONE |

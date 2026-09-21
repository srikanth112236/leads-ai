# PHASE 00 — Repository Audit (§45)

Greenfield MERN+TS repo (no Prisma/NestJS — directive adapted to Express+Mongoose).

1. **Architecture**: `server/src/{modules,common}`, `client/src` (React+Vite+Tailwind). Verified by directory listing.
2. **Models**: Company, Branch, User, CompanyMembership, Lead, LeadSource, WebhookEvent, TrackerEvent, WebsiteLeadForm, Conversation, Message, MetaIntegration, WhatsAppIntegration. Missing: LeadNote, LeadActivity, BranchMembership (model), MetaPage, MetaAdAccount, MetaLeadForm, WhatsAppPhoneNumber.
3. **Auth/AuthZ**: JWT (`hash.ts`, `jwt.ts`), `authenticateToken`, `requireRole`, `requireTenantContext`, `enforceTenantIsolation`, `TenantContextService`. Five roles in `Role` enum.
4. **Lead architecture**: Lead + LeadSource, normalized phone/email fields + indexes, `DeduplicationService` (company-scoped), `InboundLeadService.ingest` (10-step orchestration).
5. **Sourcing**: Website public endpoint (wrong path: `/api/inbound/public/leads` vs required `/api/public/leads`); Meta/WhatsApp verify+receive+idempotent persist exist; no real Graph/Cloud API calls.
6. **Queue**: BullMQ URL-options connection; workers log only; `QueueService` unwired.
7. **Notifications**: queued stub only.
8. **Problems**: §36 tests 0%; no seed; no runtime verification; WhatsApp creates no Conversation/Message; Meta retrieval is placeholder.
9. **Target**: directive §46 diagram (already the code shape).
10. **Phases**: see `README.md` (00–18).
11. **Files expected to change**: listed per phase file.
12. **Risks**: Meta docs drift (§39); BullMQ/redis client mismatch; dev secrets in `.env`.
13. **Security**: secrets server-side only (verified — no token fields in client); redaction audit pending (Phase 16).
14. **Testing strategy**: jest+supertest per §36, phases 06–08; typecheck+build after every phase.

```text
PHASE: 00
FILES CREATED: docs/phases/{README,PHASE-00,PHASE-01}.md (plan), server/src/seed.ts (phase 01)
FILES MODIFIED: server/package.json, server/.env.example
DATABASE CHANGES: none
API CHANGES: none
SECURITY CHANGES: none
TESTS: none yet (typecheck+build green, no runtime DB here)
BUILD STATUS: server tsc clean, client tsc + vite build clean
KNOWN LIMITATIONS: audit is static (no live DB/Redis run)
NEXT PHASE: 01
```

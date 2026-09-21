# PHASE 01 — Seed SUPER_ADMIN + Demo Tenant, Dev Boot

## Objective
A fresh DB becomes usable in one command; dev boot is documented and reproducible.

## Steps
1. `server/src/seed.ts` (idempotent): creates SUPER_ADMIN, demo company + branch + active `WebsiteLeadForm` (generated `publicKey`).
2. `npm run seed` script (`tsc && node dist/seed.js` — no new deps).
3. `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` in `.env.example` (defaults only for local dev, warns on console).
4. Boot runbook: start MongoDB + Redis → `npm run seed` → `npm run dev` (server :3000, client :5173).

## Acceptance
- [ ] `npm run seed` twice → no duplicates (idempotent)
- [ ] Login as seeded SUPER_ADMIN via `/api/auth/login` works
- [ ] Seeded form key accepts `POST` website lead
- [ ] `typecheck` + `build` green

## Runbook
```bash
# terminal 1: MongoDB + Redis running
cd server
npm run seed
npm run dev
# terminal 2
cd client
npm run dev
```

```text
PHASE: 01
FILES CREATED: server/src/seed.ts
FILES MODIFIED: server/package.json, server/.env.example
DATABASE CHANGES: seed-only (User SUPER_ADMIN, Company, Branch, WebsiteLeadForm)
API CHANGES: none
SECURITY CHANGES: default seed password warns; rotate via env in any shared env
TESTS: typecheck + build green; runtime seed run pending live MongoDB
BUILD STATUS: server tsc clean (verified)
KNOWN LIMITATIONS: seed not executed here (no live DB); demo data only
NEXT PHASE: 02
```

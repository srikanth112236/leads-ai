# PHASE 19 — Meta OAuth (self-serve Company Admin connect) — DONE

Decision: option (b) — Company Admins connect their own company; Super Admin keeps a repair/view override. Single platform Business app owned by the platform.

## Super Admin one-time setup (Meta App Dashboard, outside this repo)
1. Create ONE "Business" type app, link to verified Business Account.
2. Add products: Facebook Login for Business (redirect URI = `GET /api/meta/oauth/callback`), Webhooks (Page → `leadgen`), WhatsApp (`messages`).
3. Request Advanced Access: `ads_read`, `leads_retrieval`, `pages_manage_ads`, `pages_manage_metadata`, `pages_read_engagement`, `pages_show_list`, `whatsapp_business_messaging`; pass App Review + Business Verification; switch app Live.

## Super Admin in-repo responsibilities (this codebase)
- Own `META_APP_ID` / `META_APP_SECRET` / `META_GRAPH_VERSION` config; rotate secrets.
- Monitor token health across tenants (expired integrations dashboard) and re-auth prompts.
- Repair path: view any company's connection (existing admin reads), disconnect (delete token + mappings).
- Never handle client Facebook credentials — remind tenants the grant happens on Meta's site.

## Build (when started)
1. `GET /api/integrations/meta/connect` (COMPANY_ADMIN, own company) → signed state JWT (companyId+userId+nonce, 10-min) → Facebook dialog URL.
2. `GET /api/meta/oauth/callback` (public, validates state) → code→short token→long-lived (60d) → `/me/accounts` discovery → `MetaIntegration` + `MetaPage` rows (`pending`, branch unassigned).
3. Branch assignment UI hook (auto-assign single-branch companies).
4. Daily refresh worker (expiry < 7d); dead tokens → `expired` + notify company admins.
5. Token encryption at rest (currently `select:false` only — must upgrade first).
6. Tests: state forgery, cross-company callback block, mocked token exchange.

## Acceptance
- [ ] Tenant connects without platform touch; token + mappings stored; leads flow
- [ ] Forged/cross-company callbacks rejected (tests)
- [ ] Expiry → refresh or `expired` + notification
- [ ] `typecheck` + `build` + full suite green

```text
PHASE: 19
FILES CREATED: tokenCrypto.ts, meta-oauth.controller.ts, meta-oauth.routes.ts, tests/meta-oauth.test.ts, tests/token-crypto.test.ts, IntegrationsConnectedPage.tsx
FILES MODIFIED: MetaIntegration.ts (expiry/scopes/expired/encrypt hook), MetaPage.ts (pending), meta.service.ts + whatsapp.service.ts (decrypt on read), auth.controller.ts (full getProfile — fixes Welcome-undefined), app.ts, company.controller.ts (+metaPages), IntegrationsPage.tsx (connect/assign/disconnect), App.tsx, .env.example
DATABASE CHANGES: tokenExpiresAt/scopes on integrations; encrypted tokens at rest
API CHANGES: GET /api/meta/oauth/start, GET /api/meta/oauth/callback, POST /api/meta/disconnect, PUT /api/meta/pages/:id/assign, POST /api/meta/refresh
SECURITY CHANGES: AES-256-GCM tokens (META_TOKEN_KEY); signed 10-min state; forged/cross-company callbacks rejected (tests); unmapped identifiers still fail closed
TESTS: 74/74 PASS live full suite (5 oauth + 3 crypto + rest)
BUILD STATUS: server tsc + client tsc + vite build clean (all verified)
KNOWN LIMITATIONS: live flow needs real app id/secret + tunnel + Live app; refresh worker is manual-trigger (cron next)
NEXT PHASE: DONE
```

# PHASE 04 — Missing Models B (§16, §21): MetaPage, MetaAdAccount, MetaLeadForm, WhatsAppPhoneNumber

## Objective
Mapping tables so tenant resolution comes from CRM config, never from webhook bodies.

## Steps
1. `MetaPage` (metaPageId unique, companyId, branchId, integrationId), `MetaAdAccount`, `MetaLeadForm` (metaFormId unique, metaPageId, companyId, branchId).
2. `WhatsAppPhoneNumber` (phoneNumberId unique, companyId, branchId, integrationId).
3. Indexes on all external IDs; export from `models/index.ts`.

## Acceptance
- [ ] Each mapping resolves to exactly one company+branch in seed/test data
- [ ] `typecheck` + `build` green

```text
PHASE: 04
FILES CREATED: server/src/common/models/{MetaPage,MetaAdAccount,MetaLeadForm,WhatsAppPhoneNumber}.ts
FILES MODIFIED: server/src/common/models/index.ts
DATABASE CHANGES: 4 new collections; unique indexes on metaPageId, metaAdAccountId, metaFormId, phoneNumberId
API CHANGES: none
SECURITY CHANGES: enables config-based tenant resolution (Phases 12–13); no behavior change yet
TESTS: typecheck clean
BUILD STATUS: server tsc clean (verified)
KNOWN LIMITATIONS: mappings unused until Phases 12–13 wire them in
NEXT PHASE: 05
```

# PHASE 10 — Meta Docs Verification (§39) — NO CODE except notes

## Objective
Establish current truth before any Meta API call: Graph version, Lead Ads + webhook requirements, permissions, token rules, verify/signature flows, WhatsApp Cloud API version.

## Steps
1. Read official Meta developer docs; record version + 10 items from §39 with doc URLs.
2. Write findings to `docs/meta-integration-notes.md`; mark anything contradicting the directive (docs win).

## Acceptance
- [ ] Notes file with version + URLs + endpoint list committed
- [ ] No code changes in this phase

```text
PHASE: 10
FILES CREATED: docs/meta-integration-notes.md (v25.0 pinned, 7 doc URLs, 4 code gaps)
FILES MODIFIED: —
DATABASE CHANGES: none
API CHANGES: none
SECURITY CHANGES: none (research only)
TESTS: none (research phase; our verify/signature/persist-first flow confirmed matching)
BUILD STATUS: untouched, previously green
KNOWN LIMITATIONS: v26.0 sighted in some refs — re-check in Phase 11; send endpoint + mTLS need live verification
NEXT PHASE: 11
```

# PHASE 08 — Security Tests: Dedup (§36 part 3, §10–§11)

## Objective
Prove: same person via website+Meta+WhatsApp in one company → one lead + multiple `LeadSource` rows; same identity in two companies → two leads; WhatsApp from Company A can't land in Company B.

## Steps
1. Ingest same email/phone from 3 source types → assert 1 lead, 3 sources, `TrackerEvent` rows.
2. Same identity under company B → separate lead.
3. WhatsApp payload mapped to wrong company → rejected/not created.

## Acceptance
- [ ] All proofs green
- [ ] `typecheck` + `build` green

```text
PHASE: 08
FILES CREATED: server/tests/dedup.test.ts
FILES MODIFIED: —
DATABASE CHANGES: test fixtures only (leads-crm-test)
API CHANGES: none
SECURITY CHANGES: company-scoped identity proven; tenantless ingest refused
TESTS: 20/20 PASS live full suite (5 dedup + 7 webhook + 8 tenant) — 3 sources→1 lead + 3 sources/3 tracker rows, casing/whitespace merge, cross-company separation, no false merge, tenantless refusal
BUILD STATUS: server tsc clean (verified)
KNOWN LIMITATIONS: mapping-based WhatsApp misrouting proof waits for Phase 13 (mappings unwired)
NEXT PHASE: 09
```

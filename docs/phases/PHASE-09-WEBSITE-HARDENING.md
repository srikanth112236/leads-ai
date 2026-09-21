# PHASE 09 — Website Hardening (§13–§14)

## Objective
Production-grade public form: DTO validation, UTM capture, honeypot + CAPTCHA hook, async processing.

## Steps
1. Joi/Zod DTO for §13 payload; structured UTM storage; extra metadata allowlist.
2. Honeypot field + CAPTCHA verification hook (`configuration.captcha`).
3. Submit path enqueues post-processing instead of doing everything inline.

## Acceptance
- [ ] Invalid payload → 400 with stable code; spam honeypot silently accepted-but-dropped
- [ ] Phases 07–08 tests still green; `typecheck` + `build` green

```text
PHASE: 09
FILES CREATED: server/tests/website-hardening.test.ts
FILES MODIFIED: validation.ts (strict websiteFormSchema: email|phone required, lengths, unknown metadata allowed), website-lead.controller.ts (Joi 400s + honeypot silent-drop + CAPTCHA hook + async addProcessingJob)
DATABASE CHANGES: none
API CHANGES: stricter 400 VALIDATION_ERROR responses; honeypot returns 201 with no leadId; new 400 INVALID_CAPTCHA when form enables captcha
SECURITY CHANGES: spam intake dropped server-side; CAPTCHA fail-closed when configured (off by default); post-processing no longer blocks response
TESTS: 25/25 PASS live full suite (5 hardening + 5 dedup + 7 webhook + 8 tenant)
BUILD STATUS: server tsc clean (verified)
KNOWN LIMITATIONS: CAPTCHA never verified live (needs provider secret + network); post-processing queue unobserved without Redis
NEXT PHASE: 10
```

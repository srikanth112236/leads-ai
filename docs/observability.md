# Observability (§42) + Secret Hygiene (§41)

## Event trace
`GET /api/webhooks/trace?provider=<meta|whatsapp|website>&externalEventId=<id>` (JWT, tenant-scoped) returns:

```json
{
  "event": { "provider": "meta", "status": "processed", "attempts": 1, "error": null, "payload": {} },
  "lead": { "_id": "...", "companyId": "...", "branchId": "..." },
  "sources": [{ "sourceType": "META_LEAD_ADS" }],
  "trackerEvents": [{ "eventType": "IMPORTED" }],
  "duplicate": false
}
```

This answers: which provider / external event / company / branch / lead / duplicate? / processed? / why failed? / how many retries?

## Secret-hygiene audit (Sep 2026, re-run on changes)
- `grep accessToken|appSecret|verifyToken|api-key` over `server/src`: tokens appear ONLY in
  `Authorization` headers, Brevo `api-key` header, Mongoose `select:false` field defs, and
  login responses to the owning user. No `logger.*token` call exists.
- Webhook verify-token comparison never echoes the expected value; failures return
  generic `WEBHOOK_VERIFY_FAILED` / `INVALID_SIGNATURE` codes.
- `GET /trace` strips `captchaToken` from payloads before responding.
- Error handler omits stacks outside development; webhook paths use stable codes.
- Open item for Phase 17: integration-management endpoints must explicitly exclude
  `accessToken/appSecret/verifyToken` (or require re-entry without echo).

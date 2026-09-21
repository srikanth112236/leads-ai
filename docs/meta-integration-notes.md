# Meta Integration Notes — verified Sep 2026 (§39)

> If these docs conflict with the directive, the docs win. Re-verify before building Phases 11–14.

## 1. API version to use
- **Graph API + Marketing API current stable: `v25.0`** (released Feb 18, 2026; v24.0 expires Oct 6, 2026).
- Some reference pages already show `v26.0` examples — treat as upcoming, keep the version in one constant (`META_GRAPH_VERSION`, default `v25.0`) so Phase 11 can bump without code hunts.

## 2. Lead Ads webhook (Page object → `leadgen` field)
- Subscribe: App Dashboard → Webhooks product → **Page** object → `leadgen` field; install app on Page via `POST /{page-id}/subscribed_apps?subscribed_fields=leadgen` with a Page token.
- Verify (GET): `hub.mode=subscribe` + `hub.verify_token` match + echo `hub.challenge` — matches our `verifyMeta`.
- Payload: `{object:"page", entry:[{id, time, changes:[{field:"leadgen", value:{leadgen_id, page_id, form_id, adgroup_id, ad_id, created_time}}]}]}`.
- Signature: `X-Hub-Signature-256: sha256=<hmac-sha256(body, app_secret)>` — matches our `handleMeta`. Compute over the raw body.
- Persist BEFORE returning 200 (we do) — Meta treats 200 as delivered and never resends.
- App must be **Live** (Dev mode delivers nothing for Pages you don't own). Webhooks mTLS CA changed Mar 2026 — only matters if we verify mTLS certs (we don't; revisit for Azure).

## 3. Lead retrieval
- `GET https://graph.facebook.com/v25.0/<LEADGEN_ID>` (or `?fields=created_time,id,ad_id,form_id,field_data,custom_disclaimer_responses`).
- **Page access token required** — user tokens fail with `(#190) must be called with a Page Access Token`. Derive via `GET /{page-id}?fields=access_token` or a System User (non-expiring, production).
- Response: `{id, created_time, ad_id, form_id, field_data:[{name, values[]}], ...}`. Known names: `full_name`, `email`, `phone_number` — but forms are customizable, so map defensively (Phase 11). `field_data` omits custom-disclaimer answers — fetch `custom_disclaimer_responses` separately if needed.
- Bulk alternative: `GET /{FORM_ID}/leads?fields=...`.
- Permissions (all required as a chain): `leads_retrieval` (+ `pages_manage_ads`, `pages_read_engagement`, `pages_show_list`, `ads_management`; `pages_manage_metadata` for subscription). `leads_retrieval` lives under the app-dashboard **use case**, not the flat permission list; needs App Review + Business Verification.

## 4. WhatsApp Cloud API
- Subscribe: App Dashboard → WhatsApp → Configuration → `messages` field (products `whatsapp_business_messaging`).
- Verify (GET): same hub challenge flow — matches our `verifyWhatsApp`.
- Inbound payload: `entry[].changes[].value.messages[]` (has `id`/`message_id`, `from`, `type`, `text`/`...`); `metadata.phone_number_id` identifies OUR number → tenant key.
- **Separate `statuses[]` payloads** (sent/delivered/read, incl. errors) — our `handleWhatsApp` currently treats every event as a message; Phase 13 must branch on `messages` vs `statuses` and record delivery failures.
- Non-200 responses are retried up to **7 days** — another reason to persist-then-200.
- Send (to verify in Phase 14): `POST https://graph.facebook.com/v25.0/<PHONE_NUMBER_ID>/messages` with System-User token; 24h customer-service window, templates outside it.

## 5. Gaps in our current code vs these docs
1. `retrieveLead` is a stub — Phase 11 implements §3 with Page token.
2. Tenant resolution uses no mapping tables yet — Phase 12 uses `MetaLeadForm`/`MetaPage` (form_id → tenant).
3. WhatsApp ignores `statuses[]` and resolves tenant via `WhatsAppIntegration` only — Phase 13 switches to `WhatsAppPhoneNumber` + statuses handling.
4. No `META_GRAPH_VERSION` constant yet — add in Phase 11.

## 6. Doc URLs used
- https://developers.facebook.com/docs/marketing-api/guides/lead-ads/quickstart/webhooks-integration/
- https://developers.facebook.com/docs/graph-api/webhooks/getting-started/webhooks-for-leadgen/
- https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving/
- https://developers.facebook.com/docs/marketing-api/marketing-api-changelog/versions/
- https://developers.facebook.com/blog/post/2026/02/18/introducing-graph-api-v25-and-marketing-api-v25/
- https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks/
- https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components/

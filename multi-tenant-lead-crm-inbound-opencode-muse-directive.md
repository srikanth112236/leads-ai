# Multi-Tenant Lead CRM — Inbound Lead Architecture & OpenCode Muse 1.3 Implementation Directive

## 1. Product Objective

The CRM is a multi-tenant SaaS platform.

There is one platform-level:

```text
SUPER_ADMIN
```

The Super Admin manages all companies registered in the CRM.

Companies can have one or many branches.

Example:

```text
CRM PLATFORM
│
├── Company A
│   ├── Branch A1
│   ├── Branch A2
│   └── Branch A3
│
├── Company B
│   ├── Branch B1
│   └── Branch B2
│
└── Company C
    └── Branch C1
```

Data must be isolated between companies.

Branch-level data must also respect branch-level authorization.

A user belonging to Company A must never access Company B data.

A branch user must not access another branch's data unless their role explicitly permits it.

The Super Admin can manage all companies.

---

# 2. Primary Objective

The existing CRM supports outbound lead acquisition such as:

- Scrapers
- CSV imports
- Existing sourcing functionality

The new requirement is inbound lead acquisition.

The system must support:

```text
Website Forms
Meta Lead Ads
WhatsApp
```

All inbound sources must converge into one common lead-ingestion pipeline.

Target architecture:

```text
Website Form
      │
Meta Lead Ads
      │
WhatsApp
      │
CSV
      │
Scrapers
      │
      ▼
Inbound Lead Gateway
      │
      ▼
Tenant / Branch Resolution
      │
      ▼
Payload Validation
      │
      ▼
Normalization
      │
      ▼
Deduplication
      │
      ▼
Lead Creation / Merge
      │
      ├── LeadSource
      ├── TrackerEvent
      └── WebhookEvent
      │
      ▼
Queue
      │
      ├── Validation
      ├── Enrichment
      ├── Scoring
      ├── Assignment
      └── Notifications
```

---

# 3. Recommended Final Architecture

Do not implement:

```text
Website → LeadsService
Meta → LeadsService
WhatsApp → LeadsService
```

Instead use:

```text
Website ───────┐
Meta ──────────┤
WhatsApp ──────┤
CSV ───────────┤
Scraper ───────┘
       │
       ▼
InboundLeadService
       │
       ▼
Tenant Resolver
       │
       ▼
Normalizer
       │
       ▼
Duplicate Detector
       │
       ▼
LeadsService
       │
       ├── LeadSource
       ├── TrackerEvent
       └── Queue
```

Responsibilities:

```text
MetaService
    → Meta-specific API/webhook logic

WhatsAppService
    → WhatsApp-specific API/webhook/message logic

WebsiteLeadService
    → Public website form handling

InboundLeadService
    → Common ingestion/orchestration

LeadsService
    → Core lead-domain operations
```

This keeps the CRM extensible.

---

# 4. Non-Negotiable Engineering Rules

## Rule 1 — Audit Before Modifying

Before changing any file, inspect:

- `package.json`
- Prisma schema
- NestJS modules
- Controllers
- Services
- Existing `LeadsService`
- Duplicate detector
- TrackerEvent implementation
- Authentication
- Authorization
- Queue implementation
- Notification implementation
- Existing sourcing modules
- Existing frontend architecture
- Environment configuration
- Tests

Do not assume the repository structure from this document.

Do not rewrite existing functionality blindly.

---

# 5. Multi-Tenant Architecture

Implement or adapt the following entities according to the existing architecture:

```text
Company
Branch
User
CompanyMembership / equivalent
BranchMembership / equivalent
Role
```

Every company-owned resource must be tenant-aware.

Important resources include:

```text
Lead
LeadSource
LeadNote
LeadActivity
TrackerEvent
MetaIntegration
MetaPage
MetaAdAccount
MetaLeadForm
WhatsAppIntegration
WhatsAppPhoneNumber
WebsiteLeadForm
WebhookEvent
Conversation
Message
```

Do not create duplicate models if equivalent models already exist.

Reuse existing architecture whenever possible.

---

# 6. Authorization

Support at minimum:

```text
SUPER_ADMIN
COMPANY_ADMIN
COMPANY_MANAGER
BRANCH_MANAGER
SALES_AGENT
```

Do not assume these exact roles exist.

Inspect the existing role system first.

Conceptually:

```text
SUPER_ADMIN
    → all companies

COMPANY_ADMIN
    → own company
    → authorized branches

COMPANY_MANAGER
    → own company
    → authorized branches

BRANCH_MANAGER
    → assigned branch(es)

SALES_AGENT
    → assigned branch / permitted leads
```

Never rely only on frontend filtering.

Tenant isolation must be enforced server-side.

---

# 7. Tenant Context

Create or reuse a tenant-context mechanism.

Conceptually:

```typescript
TenantContext {
  userId
  role
  companyId
  branchId
  allowedBranchIds
  isSuperAdmin
}
```

Every protected request must resolve tenant context.

Database queries must use that context.

Example:

```typescript
where: {
  companyId: tenant.companyId,
  branchId: tenant.branchId
}
```

Do not expose cross-tenant records accidentally through:

- IDs
- Search
- Pagination
- Exports
- Reports
- Analytics
- Websocket events
- Notifications
- Background jobs

---

# 8. Lead Source Architecture

Extend the existing lead source enum without deleting existing values.

Add:

```prisma
WEBSITE_FORM
META_LEAD_ADS
WHATSAPP
```

Preserve all existing source values.

Prefer:

```text
Lead
  +
LeadSource
```

instead of separate lead tables.

Conceptual structure:

```text
Lead
 ├── companyId
 ├── branchId
 ├── name
 ├── email
 ├── phone
 └── ...

LeadSource
 ├── leadId
 ├── sourceType
 ├── externalId
 ├── sourceUrl
 └── rawData
```

The raw source payload must be preserved safely for debugging and auditability.

Never expose raw secrets/tokens to frontend users.

---

# 9. Unified Inbound Lead Service

Create or adapt:

```text
InboundLeadService
```

All inbound sources must use it.

Conceptual API:

```typescript
ingest(input)
```

The service must perform:

```text
1. Resolve company
2. Resolve branch
3. Validate source
4. Normalize identity
5. Deduplicate
6. Create or merge lead
7. Create LeadSource
8. Create TrackerEvent
9. Queue post-processing
10. Return stable result
```

Website, Meta and WhatsApp must NOT implement separate duplicate lead-creation logic.

---

# 10. Deduplication

Reuse the existing:

```text
duplicate-detector.service.ts
```

if it exists.

Make deduplication tenant-aware.

Never perform a global lookup such as:

```text
phone = X
```

without tenant context.

Preferred identity:

```text
companyId
+
normalizedPhone
```

or:

```text
companyId
+
normalizedEmail
```

Consider both email and phone.

Normalize:

- Phone numbers
- Email addresses
- Whitespace
- Casing

The same person coming from:

```text
Meta
+
WhatsApp
+
Website
```

should not create three unrelated leads inside the same company.

The lead should be merged or associated according to the existing CRM model.

Branch activity/source attribution must still be preserved.

---

# 11. Company vs Branch Identity

A customer identity should generally be company-scoped.

Example:

```text
Company A
  John Doe
    ├── Bangalore inquiry
    └── Hyderabad inquiry
```

The system should preserve branch-level ownership/activity/source information.

However:

```text
Company A / John Doe
```

and:

```text
Company B / John Doe
```

must remain separate tenants.

Do not accidentally merge leads across companies.

---

# 12. Website Lead Forms

Create a safe public endpoint:

```http
POST /api/public/leads
```

No JWT should be required for the website visitor.

However, the endpoint must not be an unrestricted public CRM API.

Create/adapt:

```text
WebsiteLeadForm
```

with conceptual fields:

```text
id
companyId
branchId
publicKey
allowedDomains
status
configuration
```

The website sends a public form key.

The backend resolves:

```text
publicKey
   ↓
WebsiteLeadForm
   ↓
companyId
branchId
```

Do NOT trust client-supplied `companyId` or `branchId`.

---

# 13. Website Payload

Support fields such as:

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+919876543210",
  "company": "ABC",
  "message": "Interested",
  "pageUrl": "https://example.com/contact",
  "utm_source": "google",
  "utm_medium": "cpc",
  "utm_campaign": "campaign"
}
```

Use DTO validation.

Support additional metadata safely.

Store UTM information in structured or raw source metadata.

---

# 14. Website Security

Implement:

```text
Public form key
+
Rate limiting
+
Payload validation
+
Honeypot / spam protection
+
Allowed-domain validation where practical
+
Optional CAPTCHA integration point
```

The public form key must ONLY be capable of submitting a lead.

It must never allow:

```text
GET leads
UPDATE leads
DELETE leads
READ CRM data
```

Return quickly.

Heavy processing must happen asynchronously.

---

# 15. Meta Lead Ads

Implement Meta integration according to the CURRENT official Meta developer documentation.

IMPORTANT:

Do not rely on an outdated Graph API version from this document.

Before implementing Meta API calls, verify the currently supported:

- Graph API version
- Lead Ads API
- Webhooks API
- Permissions
- Authorization flow
- Page access-token requirements
- Lead retrieval endpoint
- Webhook signature verification requirements

Use Meta's official documentation as the source of truth.

Do not invent permissions or endpoints.

---

# 16. Meta Data Model

Create/adapt:

```text
MetaIntegration
MetaPage
MetaAdAccount
MetaLeadForm
```

Conceptually:

```text
MetaIntegration
 ├── companyId
 ├── credentials
 ├── status
 └── metadata

MetaPage
 ├── metaPageId
 ├── companyId
 ├── branchId
 └── integrationId

MetaAdAccount
 ├── metaAdAccountId
 ├── companyId
 └── integrationId

MetaLeadForm
 ├── metaFormId
 ├── metaPageId
 ├── companyId
 └── branchId
```

Do not duplicate these if equivalent models already exist.

---

# 17. Meta Tenant Resolution

When Meta sends a lead event containing identifiers such as page/form/ad information:

```text
Meta event
   ↓
page/form/ad identifier
   ↓
Meta integration mapping
   ↓
companyId
   ↓
branchId
```

The branch must NEVER be guessed from the incoming request body.

It must come from trusted CRM configuration.

---

# 18. Meta Webhook

Implement:

```http
GET /api/webhooks/meta
POST /api/webhooks/meta
```

GET:

Implement Meta webhook verification exactly according to the current Meta documentation.

POST:

- Validate request structure
- Verify Meta signature where required
- Store webhook event
- Identify tenant
- Prevent duplicate event processing
- Enqueue processing
- Return successful response quickly

Do not perform long-running processing synchronously.

---

# 19. Meta Lead Processing

Conceptually:

```text
Meta webhook
      ↓
leadgen identifier
      ↓
MetaLeadProcessor
      ↓
Meta Graph API
      ↓
Retrieve lead details
      ↓
Normalize field_data
      ↓
Resolve company/branch
      ↓
InboundLeadService
```

Map Meta fields into normalized CRM fields:

```text
full_name
email
phone_number
```

but do not assume Meta field names will always be identical.

Create a robust mapper.

Preserve, where available:

```text
leadgen_id
page_id
form_id
ad_id
ad_name
campaign information
created_time
raw metadata
```

according to the current API response.

---

# 20. Meta Token Security

Never expose:

```text
Access tokens
App secrets
Client secrets
Webhook secrets
```

to React/frontend.

Store credentials server-side.

Prefer encrypted-at-rest storage.

Do not print credentials into logs.

Redact secrets from:

- Logs
- Error responses
- Audit logs
- Frontend API responses
- Debug output

---

# 21. WhatsApp

Implement WhatsApp Cloud API integration using the current official Meta documentation.

Verify the current documentation before implementation.

Do not hard-code outdated API versions.

Create/adapt:

```text
WhatsAppIntegration
WhatsAppPhoneNumber
Conversation
Message
```

Conceptual mapping:

```text
WhatsApp phone number
       ↓
CRM WhatsAppPhoneNumber
       ↓
companyId
branchId
```

---

# 22. WhatsApp Webhook

Implement:

```http
GET /api/webhooks/whatsapp
POST /api/webhooks/whatsapp
```

GET:

Implement Meta webhook verification according to current official documentation.

POST:

```text
Validate webhook
 ↓
Identify phone number
 ↓
Resolve company
 ↓
Resolve branch
 ↓
Deduplicate webhook event
 ↓
Find/create lead
 ↓
Create conversation
 ↓
Create message
 ↓
Create tracker event
 ↓
Queue notifications/automation
 ↓
Return quickly
```

---

# 23. Lead vs Conversation

Do not overload Lead with every WhatsApp message.

Prefer:

```text
Lead
Conversation
Message
LeadActivity
```

Relationship:

```text
Lead
 │
 └── Conversation
       │
       ├── Message
       ├── Message
       └── Message
```

This allows future WhatsApp agent inbox functionality.

---

# 24. WhatsApp Auto-Reply

Implement the service boundary for sending WhatsApp messages.

Conceptually:

```text
WhatsAppService.sendMessage()
```

Follow Meta's current rules for:

- Customer service conversations
- Messaging windows
- Templates
- Template approval
- Business-initiated messaging

Do not assume messages can be freely sent outside the allowed conversation window.

---

# 25. Webhook Event Model

Create/adapt:

```text
WebhookEvent
```

with fields similar to:

```text
id
provider
eventType
externalEventId
payload
status
attempts
receivedAt
processedAt
error
```

The exact schema must follow existing Prisma conventions.

Purpose:

```text
Webhook received
      ↓
Persist event
      ↓
Process asynchronously
      ↓
Mark processed
```

If Meta/WhatsApp sends the same event more than once:

```text
externalEventId
```

must make processing idempotent.

---

# 26. Queues

Use the project's existing Bull/BullMQ implementation if available.

Do not introduce another queue technology unnecessarily.

Queues should handle:

```text
Meta lead processing
WhatsApp processing
Validation
Enrichment
Scoring
Notifications
```

Webhook controllers should remain lightweight.

---

# 27. Tracker Event

Reuse the existing TrackerEvent system.

For inbound lead creation use:

```text
IMPORTED
```

or the project's equivalent enum/value.

Record:

```text
source
lead
company
branch
timestamp
metadata
```

according to the existing schema.

Do not create duplicate event systems.

---

# 28. Notifications

Reuse the existing notification architecture if available.

After successful lead ingestion:

```text
Lead created
 ↓
FCM / in-app notification
 ↓
Assigned team
```

Optional:

```text
Brevo / Email notification
```

must be asynchronous.

Do not block webhook responses waiting for notification delivery.

---

# 29. API Design

Public:

```http
POST /api/public/leads
```

Meta:

```http
GET  /api/webhooks/meta
POST /api/webhooks/meta
```

WhatsApp:

```http
GET  /api/webhooks/whatsapp
POST /api/webhooks/whatsapp
```

Protected CRM APIs must continue using the existing authentication mechanism.

Do not remove JWT protection from internal lead endpoints.

---

# 30. Environment Variables

Inspect the current `.env` structure first.

Do not commit secrets.

Create/update `.env.example`.

Potential configuration categories:

```text
DATABASE_URL

META_APP_ID
META_APP_SECRET
META_WEBHOOK_VERIFY_TOKEN

WHATSAPP_VERIFY_TOKEN
WHATSAPP_ACCESS_TOKEN
WHATSAPP_PHONE_NUMBER_ID

REDIS_URL

FCM configuration
```

Only add variables actually required.

Never put real production secrets into `.env.example`.

---

# 31. Development Environment

Meta/WhatsApp webhooks require publicly reachable HTTPS endpoints.

For development:

```text
localhost
   ↓
ngrok / equivalent HTTPS tunnel
   ↓
NestJS
```

For production:

```text
Meta
 ↓
HTTPS
 ↓
Azure App Service
 ↓
NestJS
```

Do not design production around localhost.

---

# 32. Super Admin Requirements

Super Admin must have visibility into:

## Companies

```text
Company list
Company details
Company users
Branches
Status
Integrations
```

## Branches

```text
Branch list
Branch users
Lead count
Source count
```

## Integrations

```text
Meta
WhatsApp
Website forms
```

## Webhooks

```text
Provider
Event
Received time
Status
Attempts
Error
Company
Branch
```

## Audit Logs

Track important integration and authorization changes.

---

# 33. Company Admin Requirements

Company administrators should see only their company.

They can manage:

```text
Branches
Users
Integrations
Lead sources
Website forms
```

subject to their permissions.

---

# 34. Branch UI Requirements

Branch users should see only authorized branch data.

Lead list should support:

```text
Source
Status
Branch
Assigned user
Created date
Score
```

and should never leak another company's data.

---

# 35. Database Indexing

Inspect current indexes.

Add appropriate indexes for actual query patterns involving:

```text
companyId
branchId
normalizedPhone
normalizedEmail
externalId
sourceType
createdAt
webhook external event ID
Meta page ID
Meta form ID
WhatsApp phone number ID
```

Do not blindly add every possible compound index.

---

# 36. Security Tests

Create tests proving:

```text
Company A cannot read Company B leads.

Company A cannot update Company B leads.

Branch A cannot read Branch B leads.

Public form cannot access CRM data.

Invalid website form key is rejected.

Invalid Meta webhook verification is rejected.

Invalid Meta signature is rejected.

Duplicate webhook is processed only once.

Duplicate lead does not create another lead.

WhatsApp from Company A cannot create a lead under Company B.

User cannot manipulate companyId/branchId from request body to escape tenant isolation.
```

These tests are mandatory.

---

# 37. Testing

Run existing tests before modification.

After every major phase:

```text
Lint
Typecheck
Unit tests
Integration tests
Prisma validation
Build
```

Do not claim something works if it was not actually tested.

---

# 38. Implementation Strategy

Do NOT implement everything in one uncontrolled change.

Use this exact sequence.

## PHASE 0 — Repository Audit

Inspect:

```text
Current architecture
Existing models
Existing services
Existing authentication
Existing authorization
Existing queues
Existing lead architecture
Existing problems
```

Output an implementation plan.

Do not modify code during Phase 0.

---

## PHASE 1 — Multi-Tenancy

Implement/adapt:

```text
Company
Branch
Tenant context
Authorization
```

Run tests.

---

## PHASE 2 — Source Architecture

Implement/adapt:

```text
LeadSourceType
LeadSource
WebhookEvent
WebsiteLeadForm
```

Preserve existing schema.

Run Prisma validation and tests.

---

## PHASE 3 — Unified Ingestion

Implement:

```text
InboundLeadService
```

Integrate it with existing `LeadsService`.

Do not duplicate lead creation logic.

---

## PHASE 4 — Website

Implement:

```http
POST /api/public/leads
```

Test:

```text
Valid lead
Invalid payload
Invalid key
Spam
Duplicate
Tenant resolution
Branch resolution
```

---

## PHASE 5 — Meta

Before writing API calls:

**VERIFY CURRENT OFFICIAL META DOCUMENTATION.**

Implement:

```text
Meta integration configuration
Meta page mapping
Meta ad account mapping
Meta form mapping
Webhook verification
Webhook signature verification
Webhook event persistence
Lead retrieval
Lead normalization
Tenant resolution
Deduplication
Queue processing
```

---

## PHASE 6 — WhatsApp

Implement:

```text
WhatsApp integration
Phone number mapping
Webhook verification
Message ingestion
Conversation
Message
Lead matching
Lead creation
Tracker event
Notification
```

---

## PHASE 7 — Admin UI

Implement/support:

```text
Super Admin integration management
Company integration management
Branch integration management
Webhook monitoring
Audit logs
```

---

# 39. Critical Meta Requirement

Never use an outdated tutorial as the source of truth.

Before implementing Meta:

1. Check current Meta Developer documentation.
2. Identify currently supported Graph API version.
3. Identify current Lead Ads webhook requirements.
4. Identify current permission requirements.
5. Identify current token requirements.
6. Identify current lead retrieval endpoint.
7. Identify current webhook verification process.
8. Identify current signature verification process.
9. Identify current WhatsApp Cloud API requirements.
10. Record the documentation URLs used in implementation notes.

If current Meta documentation conflicts with this document, follow the current Meta documentation.

---

# 40. Coding Style

Follow the existing repository's conventions.

Prefer:

```text
Small services
Small controllers
DTO validation
Typed interfaces
Dependency injection
Single responsibility
```

Do not create giant 1000-line services.

Keep modules independently understandable.

Do not rewrite unrelated functionality.

Do not change unrelated UI.

---

# 41. Error Handling

Never expose:

```text
Meta access token
App secret
WhatsApp token
Database credentials
```

to clients.

Log useful diagnostic information but redact secrets.

Use stable error codes where appropriate.

Webhook endpoints should avoid returning internal stack traces.

---

# 42. Observability

For every inbound event, the system should be able to answer:

```text
Which provider?
Which external event?
Which company?
Which branch?
Which lead?
Was it duplicate?
Was it processed?
Did processing fail?
Why?
How many retries?
```

This is essential for production debugging.

---

# 43. Final Acceptance Criteria

The implementation is complete only when:

```text
[ ] Super Admin exists
[ ] Company isolation exists
[ ] Branch isolation exists
[ ] Role authorization exists
[ ] Existing lead functionality still works
[ ] Existing CSV/scraper functionality still works
[ ] Website lead ingestion works
[ ] Website lead tenant resolution works
[ ] Website lead deduplication works
[ ] Meta integration architecture exists
[ ] Meta webhook verification works
[ ] Meta webhook signature validation works
[ ] Meta webhook events are persisted
[ ] Meta lead retrieval works using current API
[ ] Meta lead maps to correct company
[ ] Meta lead maps to correct branch
[ ] Meta lead deduplication works
[ ] WhatsApp integration exists
[ ] WhatsApp webhook verification works
[ ] WhatsApp messages are persisted
[ ] WhatsApp messages map to correct company
[ ] WhatsApp messages map to correct branch
[ ] WhatsApp lead deduplication works
[ ] Conversation/message architecture exists
[ ] TrackerEvent is generated
[ ] Queue processing works
[ ] Notifications work asynchronously
[ ] Duplicate webhooks are idempotent
[ ] Secrets are protected
[ ] Tests cover tenant isolation
[ ] Tests cover webhook security
[ ] Tests cover duplicate events
[ ] Production build succeeds
```

---

# 44. Required Agent Behavior

You are the coding agent.

Do not ask the developer to manually explain files that you can inspect yourself.

Do not start coding until the repository audit is complete.

Do not invent existing models.

Do not delete working functionality.

Do not rewrite the entire CRM.

Do not use mock implementations where production integration is required.

If an external credential is required, create the correct configuration interface and clearly identify the exact credential required.

If a Meta/WhatsApp setup step is required outside the codebase, document it separately.

If an API requirement is uncertain, verify current official documentation before coding.

At the end of each phase report:

```text
PHASE:
FILES CREATED:
FILES MODIFIED:
DATABASE CHANGES:
API CHANGES:
SECURITY CHANGES:
TESTS:
BUILD STATUS:
KNOWN LIMITATIONS:
NEXT PHASE:
```

---

# 45. Start Here

Start now with:

```text
PHASE 0 — COMPLETE REPOSITORY AUDIT
```

Do not modify code during Phase 0.

Inspect the repository thoroughly.

Then present:

```text
1. Existing architecture
2. Existing Prisma models
3. Existing authentication/authorization
4. Existing Lead architecture
5. Existing sourcing architecture
6. Existing queue architecture
7. Existing notification architecture
8. Existing problems/gaps
9. Proposed target architecture
10. Exact implementation phases
11. Files expected to change
12. Risks
13. Security considerations
14. Testing strategy
```

Wait for the audit/plan stage before making large architectural changes.

---

# 46. Important Architectural Summary

The final system should look like:

```text
                         ┌──────────────────┐
                         │   SUPER ADMIN    │
                         └────────┬─────────┘
                                  │
                ┌─────────────────┴─────────────────┐
                │                                   │
           COMPANY A                           COMPANY B
                │                                   │
        ┌───────┴───────┐                   ┌───────┴───────┐
        │               │                   │               │
     Branch 1        Branch 2            Branch 1        Branch 2
        │               │                   │               │
        └───────┬───────┘                   └───────┬───────┘
                │                                   │
                └─────────────────┬─────────────────┘
                                  │
                            CRM Lead Domain
                                  │
          ┌───────────────────────┼──────────────────────┐
          │                       │                      │
      Website                  Meta                  WhatsApp
          │                       │                      │
          └───────────────────────┼──────────────────────┘
                                  │
                         InboundLeadService
                                  │
                         Tenant Resolution
                                  │
                           Normalization
                                  │
                           Deduplication
                                  │
                           LeadsService
                                  │
                  ┌───────────────┼────────────────┐
                  │               │                │
              LeadSource     TrackerEvent      WebhookEvent
                                  │
                                Queue
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
                Validate       Score         Notify
                    │             │             │
                    └─────────────┼─────────────┘
                                  │
                             CRM Users
```

This architecture should be treated as the target direction for the CRM.

The priority is:

**security → tenant isolation → correctness → idempotency → maintainability → integrations → UI polish.**

Do not sacrifice tenant isolation or webhook correctness for speed.

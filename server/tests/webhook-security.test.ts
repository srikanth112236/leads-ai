import * as crypto from 'crypto';
import request from 'supertest';

process.env.META_APP_SECRET = 'test-app-secret';
process.env.META_WEBHOOK_VERIFY_TOKEN = 'test-meta-verify';
process.env.WHATSAPP_VERIFY_TOKEN = 'test-wa-verify';

import { app } from '../src/app';
import { connectTestDB, clearTestDB, closeTestDB } from './setup';
import { Company } from '../src/common/models/Company';
import { Branch } from '../src/common/models/Branch';
import { Lead } from '../src/common/models/Lead';
import { WebsiteLeadForm } from '../src/common/models/WebsiteLeadForm';
import { WebhookEvent } from '../src/common/models/WebhookEvent';

function metaSignature(payload: object): string {
  return 'sha256=' + crypto.createHmac('sha256', 'test-app-secret').update(JSON.stringify(payload)).digest('hex');
}

describe('webhook security (§36)', () => {
  let formKey: string;
  let companyId: string;

  beforeAll(async () => {
    await connectTestDB();
    await clearTestDB();

    const company = await new Company({ name: 'Webhook Co', status: 'active' }).save();
    companyId = company._id.toString();
    const branch = await new Branch({ companyId: company._id, name: 'HQ', status: 'active' }).save();
    const form = await new WebsiteLeadForm({
      companyId: company._id,
      branchId: branch._id,
      publicKey: 'test-public-key-123',
      allowedDomains: [],
      status: 'active',
      configuration: {},
    }).save();
    formKey = form.publicKey;
  }, 30000);

  afterAll(async () => {
    await closeTestDB();
  });

  test('valid website lead is accepted and tenant-resolved from form key', async () => {
    const res = await request(app).post('/api/public/leads').send({
      publicKey: formKey,
      name: 'Webhook Wendy',
      email: 'wendy@example.com',
      phone: '+911234567890',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.isDuplicate).toBe(false);
    const lead = await Lead.findById(res.body.data.leadId);
    expect(lead?.companyId.toString()).toBe(companyId);
  });

  test('invalid website form key is rejected', async () => {
    const res = await request(app).post('/api/public/leads').send({
      publicKey: 'bogus-key',
      name: 'Intruder',
      email: 'intruder@example.com',
    });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('INVALID_FORM_KEY');
  });

  test('public form cannot read CRM data', async () => {
    const res = await request(app).get('/api/public/leads');
    expect(res.status).toBe(404);
  });

  test('Meta webhook verification accepts valid token, rejects invalid', async () => {
    const ok = await request(app).get('/api/webhooks/meta').query({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'test-meta-verify',
      'hub.challenge': 'challenge-123',
    });
    expect(ok.status).toBe(200);
    expect(ok.text).toBe('challenge-123');

    const bad = await request(app).get('/api/webhooks/meta').query({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'wrong',
      'hub.challenge': 'challenge-123',
    });
    expect(bad.status).toBe(403);
  });

  test('Meta POST with bad signature is rejected; good signature persists event', async () => {    const payload = { object: 'page', entry: [{ changes: [{ value: { leadgen_id: `lg-${Date.now()}` } }] }] };

    const bad = await request(app)
      .post('/api/webhooks/meta')
      .set('x-hub-signature-256', 'sha256=invalid')
      .send(payload);
    expect(bad.status).toBe(401);

    const good = await request(app)
      .post('/api/webhooks/meta')
      .set('x-hub-signature-256', metaSignature(payload))
      .send(payload);
    expect(good.status).toBe(200);
    const event = await WebhookEvent.findOne({
      provider: 'meta',
      externalEventId: (payload.entry[0].changes[0].value as { leadgen_id: string }).leadgen_id,
    });
    expect(event).not.toBeNull();
    expect(event?.status).toBe('pending');
  }, 20000);

  test('duplicate Meta delivery persists only one event', async () => {
    const leadgenId = `lg-dup-${Date.now()}`;
    const payload = { object: 'page', entry: [{ changes: [{ value: { leadgen_id: leadgenId } }] }] };
    const sig = metaSignature(payload);

    for (let i = 0; i < 2; i++) {
      const res = await request(app)
        .post('/api/webhooks/meta')
        .set('x-hub-signature-256', sig)
        .send(payload);
      expect(res.status).toBe(200);
    }
    const count = await WebhookEvent.countDocuments({ provider: 'meta', externalEventId: leadgenId });
    expect(count).toBe(1);
  }, 20000);

  test('WhatsApp webhook verify + receive persists event', async () => {
    const ok = await request(app).get('/api/webhooks/whatsapp').query({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'test-wa-verify',
      'hub.challenge': 'wa-challenge',
    });
    expect(ok.status).toBe(200);

    const bad = await request(app).get('/api/webhooks/whatsapp').query({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'wrong',
      'hub.challenge': 'wa-challenge',
    });
    expect(bad.status).toBe(403);

    const msgId = `wamid-${Date.now()}`;
    const res = await request(app).post('/api/webhooks/whatsapp').send({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: { messages: [{ message_id: msgId, from: '+911234567890' }] } }] }],
    });
    expect(res.status).toBe(200);
    const event = await WebhookEvent.findOne({ provider: 'whatsapp', externalEventId: msgId });
    expect(event).not.toBeNull();
  }, 20000);
});

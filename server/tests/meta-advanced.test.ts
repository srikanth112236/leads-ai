import request from 'supertest';
import { createHash } from 'crypto';

process.env.META_APP_ID = 'test-app-id';
process.env.META_APP_SECRET = 'test-app-secret';

import { app } from '../src/app';
import { connectTestDB, clearTestDB, closeTestDB } from './setup';
import { User } from '../src/common/models/User';
import { Company } from '../src/common/models/Company';
import { MetaIntegration } from '../src/common/models/MetaIntegration';
import { WebhookEvent } from '../src/common/models/WebhookEvent';
import { Notification } from '../src/common/models/Notification';
import { hashPassword } from '../src/common/security/hash';
import { Role } from '../src/common/types';
import {
  MetaService,
  MetaPermanentError,
  classifyMetaFailure,
} from '../src/modules/meta/meta.service';
import { MetaCapiService } from '../src/modules/meta/meta-capi.service';
import { MetaHealthService } from '../src/modules/meta/meta-health.service';
import { QueueService } from '../src/modules/queue/queue.service';

const realFetch = (global as any).fetch;
function mockFetch(fn: (url: string, init?: any) => any) {
  (global as any).fetch = jest.fn(fn);
}
afterEach(() => {
  (global as any).fetch = realFetch;
  jest.restoreAllMocks();
});

describe('advanced Meta pipeline (retry, replay, CAPI, health)', () => {
  let company: any;
  let companyB: any;
  let superToken: string;
  let adminToken: string;
  let adminBToken: string;
  let integration: any;

  beforeAll(async () => {
    await connectTestDB();
    await clearTestDB();

    company = await new Company({ name: 'Adv Co', status: 'active' }).save();
    companyB = await new Company({ name: 'Adv Co B', status: 'active' }).save();
    const password = await hashPassword('Password123!');

    await new User({
      email: 'adv-super@t.local', password, firstName: 'S', lastName: 'U',
      role: Role.SUPER_ADMIN, isActive: true,
    }).save();
    await new User({
      email: 'adv-admin@t.local', password, firstName: 'A', lastName: 'A',
      role: Role.COMPANY_ADMIN, companyId: company._id, isActive: true,
    }).save();
    await new User({
      email: 'adv-admin-b@t.local', password, firstName: 'B', lastName: 'B',
      role: Role.COMPANY_ADMIN, companyId: companyB._id, isActive: true,
    }).save();

    integration = await new MetaIntegration({
      companyId: company._id, accessToken: 'tok-adv', status: 'active',
    }).save();

    const login = async (email: string) => {
      const res = await request(app).post('/api/auth/login').send({ email, password: 'Password123!' });
      expect(res.status).toBe(200);
      return res.body.data.accessToken as string;
    };
    superToken = await login('adv-super@t.local');
    adminToken = await login('adv-admin@t.local');
    adminBToken = await login('adv-admin-b@t.local');
  }, 30000);

  afterAll(async () => {
    await closeTestDB();
  });

  test('classifyMetaFailure separates permanent from transient faults', () => {
    expect(classifyMetaFailure({ code: 190 })).toBe('permanent');
    expect(classifyMetaFailure({ code: 200 })).toBe('permanent');
    expect(classifyMetaFailure({ code: 298 })).toBe('permanent');
    expect(classifyMetaFailure({ code: 100 })).toBe('permanent');
    expect(classifyMetaFailure({ code: 10 })).toBe('permanent');
    expect(classifyMetaFailure({ code: 1 }, 500)).toBe('transient');
    expect(classifyMetaFailure({ code: 4 }, 429)).toBe('transient');
    expect(classifyMetaFailure({ code: 613 })).toBe('transient');
    expect(classifyMetaFailure(null, 500)).toBe('transient');
    expect(classifyMetaFailure(null, 400)).toBe('permanent');
    expect(classifyMetaFailure(null, 401)).toBe('permanent');
    expect(classifyMetaFailure(null)).toBe('transient');
  });

  test('retrieveLead retries transient faults with backoff, then succeeds', async () => {
    let calls = 0;
    mockFetch(async () => {
      calls += 1;
      if (calls < 3) {
        return { ok: false, status: 500, json: async () => ({ error: { code: 1, message: 'temp' } }) };
      }
      return { ok: true, json: async () => ({ id: 'lg-1', field_data: [] }) };
    });
    const data = await MetaService.retrieveLead('lg-1', integration._id.toString(), { baseDelayMs: 5 });
    expect(data).not.toBeNull();
    expect((data as any).id).toBe('lg-1');
    expect(calls).toBe(3);
  });

  test('retrieveLead fails fast on permanent (#200) faults without retrying', async () => {
    let calls = 0;
    mockFetch(async () => {
      calls += 1;
      return { ok: false, status: 400, json: async () => ({ error: { code: 200, message: '(#200) Missing Permissions' } }) };
    });
    const detailed = await MetaService.retrieveLeadDetailed('lg-x', integration._id.toString(), { baseDelayMs: 5 });
    expect(detailed.data).toBeNull();
    expect(detailed.kind).toBe('permanent');
    expect(calls).toBe(1);
  });

  test('queue fails fast on permanent errors, retries transient ones', async () => {
    const mkEvent = () => WebhookEvent.create({
      provider: 'meta', eventType: 'leadgen', externalEventId: `lg-${Date.now()}-${Math.random()}`,
      payload: { object: 'page', entry: [{ id: 'p1', changes: [{ value: { leadgen_id: 'lg-1' } }] }] },
      status: 'pending', attempts: 0, maxAttempts: 3, receivedAt: new Date(),
      companyId: company._id,
    });

    const permEvent = await mkEvent();
    jest.spyOn(MetaService, 'ingestLeadEvent').mockRejectedValueOnce(new MetaPermanentError('perm down'));
    await expect(QueueService.processWebhookJob('meta', permEvent._id.toString())).rejects.toThrow();
    const permAfter = await WebhookEvent.findById(permEvent._id).lean();
    expect(permAfter!.status).toBe('failed');
    expect(permAfter!.attempts).toBe(permAfter!.maxAttempts);

    const transEvent = await mkEvent();
    jest.spyOn(MetaService, 'ingestLeadEvent').mockRejectedValueOnce(new Error('boom'));
    await expect(QueueService.processWebhookJob('meta', transEvent._id.toString())).rejects.toThrow();
    const transAfter = await WebhookEvent.findById(transEvent._id).lean();
    expect(transAfter!.status).toBe('pending');
    expect(transAfter!.attempts).toBe(1);
  });

  test('DLQ replay: failed event re-queues, non-failed rejected, expired gone', async () => {
    const failed = await WebhookEvent.create({
      provider: 'meta', eventType: 'leadgen', externalEventId: 'lg-replay-1',
      payload: { object: 'page', entry: [{ id: 'p1' }] },
      status: 'failed', attempts: 3, maxAttempts: 3,
      error: 'boom', receivedAt: new Date(), companyId: company._id,
    });
    const res = await request(app)
      .post(`/api/webhooks/${failed._id}/retry`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.attempts).toBe(0);
    expect(res.body.data.recoverableUntil).toBeTruthy();
    expect(res.body.data.isExpired).toBe(false);

    const again = await request(app)
      .post(`/api/webhooks/${failed._id}/retry`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(again.status).toBe(400);
    expect(again.body.code).toBe('NOT_FAILED');

    const old = await WebhookEvent.create({
      provider: 'meta', eventType: 'leadgen', externalEventId: 'lg-replay-old',
      payload: { object: 'page', entry: [{ id: 'p1' }] },
      status: 'failed', attempts: 3, maxAttempts: 3,
      receivedAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000), companyId: company._id,
    });
    const gone = await request(app)
      .post(`/api/webhooks/${old._id}/retry`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(gone.status).toBe(410);
    expect(gone.body.code).toBe('RECOVERY_EXPIRED');

    const other = await request(app)
      .post(`/api/webhooks/${failed._id}/retry`)
      .set('Authorization', `Bearer ${adminBToken}`);
    expect(other.status).toBe(403);
  });

  test('CAPI hashes user data, dedups deterministically, honors test codes', async () => {
    await MetaIntegration.updateOne(
      { _id: integration._id },
      { $set: { capiDatasetId: 'ds_1', capiEnabled: true, capiTestEventCode: 'TEST-1' } },
    );
    let seenBody: any = null;
    mockFetch(async (_url: string, init?: any) => {
      seenBody = JSON.parse(init.body);
      return { ok: true, json: async () => ({ events_received: 1 }) };
    });
    const input = {
      companyId: company._id.toString(),
      eventName: 'TestDriveCompleted',
      eventTime: 1700000000,
      leadId: 'lead-1',
      userData: { email: '  Buyer@Example.com ', phone: '+1 (555) 123-4567' },
      customData: { vehicle: 'SUV' },
    };
    const r1 = await MetaCapiService.sendEvent(input);
    const r2 = await MetaCapiService.sendEvent(input);
    expect(r1.eventId).toBe(r2.eventId);
    const sent = seenBody.data[0];
    expect(sent.event_name).toBe('TestDriveCompleted');
    expect(sent.user_data.em).toBe(createHash('sha256').update('buyer@example.com').digest('hex'));
    expect(sent.user_data.ph).toBe(createHash('sha256').update('15551234567').digest('hex'));
    expect(sent.custom_data).toEqual({ vehicle: 'SUV' });
    expect(seenBody.test_event_code).toBe('TEST-1');

    await MetaIntegration.updateOne({ _id: integration._id }, { $unset: { capiDatasetId: '' } });
    await expect(MetaCapiService.sendEvent(input)).rejects.toThrow(/not configured/);
    await MetaIntegration.updateOne(
      { _id: integration._id },
      { $set: { capiDatasetId: 'ds_1', capiEnabled: false } },
    );
    await expect(MetaCapiService.sendEvent(input)).rejects.toThrow(/disabled/);
    await MetaIntegration.updateOne(
      { _id: integration._id },
      { $set: { capiEnabled: true, capiTestEventCode: 'TEST-1' } },
    );
  });

  test('CAPI endpoint validates, sends, and isolates tenants', async () => {
    mockFetch(async () => ({ ok: true, json: async () => ({ events_received: 1 }) }));
    const ok = await request(app)
      .post('/api/meta/capi/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ eventName: 'Lead', userData: { email: 'a@b.com' }, customData: { value: 1 } });
    expect(ok.status).toBe(200);
    expect(ok.body.data.eventId).toBeTruthy();

    const invalid = await request(app)
      .post('/api/meta/capi/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userData: { email: 'a@b.com' } });
    expect(invalid.status).toBe(400);

    const cross = await request(app)
      .post('/api/meta/capi/events')
      .set('Authorization', `Bearer ${adminBToken}`)
      .send({ companyId: company._id.toString(), eventName: 'Lead' });
    expect(cross.status).toBe(403);
  });

  test('health loop keeps healthy, expires broken, alerts super admins once', async () => {
    mockFetch(async (url: string) => {
      if (String(url).includes('debug_token')) {
        return { ok: true, json: async () => ({ data: { is_valid: true, expires_at: 1893456000, scopes: ['ads_read'] } }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    const s1 = await MetaHealthService.runHealthCheck();
    expect(s1.checked).toBe(1);
    expect(s1.healthy).toBe(1);
    const kept = await MetaIntegration.findById(integration._id).lean();
    expect(kept!.status).toBe('active');
    expect(new Date(kept!.tokenExpiresAt!).getFullYear()).toBe(2030);

    mockFetch(async () => ({
      ok: true, json: async () => ({ data: { is_valid: false, error: { message: 'Session expired' } } }),
    }));
    const s2 = await MetaHealthService.runHealthCheck();
    expect(s2.expired).toBe(1);
    expect(s2.alerted).toBe(1);
    const flipped = await MetaIntegration.findById(integration._id).lean();
    expect(flipped!.status).toBe('expired');
    const notes = await Notification.find({ type: 'integration_expired' }).lean();
    expect(notes.length).toBe(1);
    expect(notes[0].body).toMatch(/Session expired/);

    const s3 = await MetaHealthService.runHealthCheck();
    expect(s3.alerted).toBe(0);
    expect(await Notification.countDocuments({ type: 'integration_expired' })).toBe(1);
  });

  test('health endpoints expose status and allow manual runs (super only)', async () => {
    const health = await request(app)
      .get('/api/admin/meta/health')
      .set('Authorization', `Bearer ${superToken}`);
    expect(health.status).toBe(200);
    expect(health.body.data.platform.capiSupported).toBe(true);
    expect(Array.isArray(health.body.data.unhealthy)).toBe(true);

    mockFetch(async () => ({
      ok: true, json: async () => ({ data: { is_valid: true, expires_at: 1893456000 } }),
    }));
    const run = await request(app)
      .post('/api/admin/meta/health/run')
      .set('Authorization', `Bearer ${superToken}`);
    expect(run.status).toBe(200);
    expect(run.body.data.checked).toBe(1);

    const denied = await request(app)
      .post('/api/admin/meta/health/run')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(denied.status).toBe(403);
  });
});

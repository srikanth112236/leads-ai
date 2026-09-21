import request from 'supertest';
import { app } from '../src/app';
import { connectTestDB, clearTestDB, closeTestDB } from './setup';
import { User } from '../src/common/models/User';
import { Company } from '../src/common/models/Company';
import { Lead } from '../src/common/models/Lead';
import { LeadSource } from '../src/common/models/LeadSource';
import { TrackerEvent } from '../src/common/models/TrackerEvent';
import { WebhookEvent } from '../src/common/models/WebhookEvent';
import { hashPassword } from '../src/common/security/hash';
import { Role } from '../src/common/types';

describe('event trace (§42)', () => {
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    await connectTestDB();
    await clearTestDB();

    const companyA = await new Company({ name: 'Trace A', status: 'active' }).save();
    const companyB = await new Company({ name: 'Trace B', status: 'active' }).save();
    const password = await hashPassword('Test123!');
    await new User({ email: 'traceA@t.local', password, firstName: 'T', lastName: 'A', role: Role.COMPANY_ADMIN, companyId: companyA._id, isActive: true }).save();
    await new User({ email: 'traceB@t.local', password, firstName: 'T', lastName: 'B', role: Role.COMPANY_ADMIN, companyId: companyB._id, isActive: true }).save();

    const lead = await new Lead({ companyId: companyA._id, name: 'Trace Tess', source: 'WEBSITE_FORM' }).save();
    await new LeadSource({ leadId: lead._id, sourceType: 'WEBSITE_FORM', rawData: {} }).save();
    await new TrackerEvent({ source: 'WEBSITE_FORM', leadId: lead._id, companyId: companyA._id, eventType: 'IMPORTED' }).save();
    await new WebhookEvent({
      provider: 'website',
      eventType: 'lead_created',
      externalEventId: 'trace-1',
      payload: { name: 'Trace Tess', captchaToken: 'secret-should-not-echo' },
      status: 'processed',
      attempts: 1,
      maxAttempts: 3,
      receivedAt: new Date(),
      processedAt: new Date(),
      companyId: companyA._id,
      leadId: lead._id,
    }).save();

    const loginA = await request(app).post('/api/auth/login').send({ email: 'traceA@t.local', password: 'Test123!' });
    tokenA = loginA.body.data.accessToken as string;
    const loginB = await request(app).post('/api/auth/login').send({ email: 'traceB@t.local', password: 'Test123!' });
    tokenB = loginB.body.data.accessToken as string;
  }, 30000);

  afterAll(async () => {
    await closeTestDB();
  });

  test('own-company trace returns full chain with redacted payload', async () => {
    const res = await request(app)
      .get('/api/webhooks/trace')
      .query({ provider: 'website', externalEventId: 'trace-1' })
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.data.event.status).toBe('processed');
    expect(res.body.data.lead.name).toBe('Trace Tess');
    expect(res.body.data.sources).toHaveLength(1);
    expect(res.body.data.trackerEvents[0].eventType).toBe('IMPORTED');
    expect(res.body.data.event.payload.captchaToken).toBeUndefined();
    expect(res.body.data.event.payload.name).toBe('Trace Tess');
  });

  test('cross-company trace is forbidden', async () => {
    const res = await request(app)
      .get('/api/webhooks/trace')
      .query({ provider: 'website', externalEventId: 'trace-1' })
      .set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(403);
  });

  test('unknown event is 404, missing params 400, anonymous 401', async () => {
    const nf = await request(app)
      .get('/api/webhooks/trace')
      .query({ provider: 'website', externalEventId: 'nope' })
      .set('Authorization', `Bearer ${tokenA}`);
    expect(nf.status).toBe(404);
    const bad = await request(app)
      .get('/api/webhooks/trace')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(bad.status).toBe(400);
    const anon = await request(app).get('/api/webhooks/trace').query({ provider: 'website', externalEventId: 'trace-1' });
    expect(anon.status).toBe(401);
  });
});

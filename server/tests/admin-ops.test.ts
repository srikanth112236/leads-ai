import request from 'supertest';
import { app } from '../src/app';
import { connectTestDB, clearTestDB, closeTestDB } from './setup';
import { User } from '../src/common/models/User';
import { Company } from '../src/common/models/Company';
import { AuditLog } from '../src/common/models/AuditLog';
import { WebhookEvent } from '../src/common/models/WebhookEvent';
import { hashPassword } from '../src/common/security/hash';
import { Role } from '../src/common/types';

describe('admin ops (§32)', () => {
  let tokenSuper: string;
  let tokenA: string;
  let companyAId: string;

  beforeAll(async () => {
    await connectTestDB();
    await clearTestDB();

    const companyA = await new Company({ name: 'Ops A', status: 'active' }).save();
    const companyB = await new Company({ name: 'Ops B', status: 'active' }).save();
    companyAId = companyA._id.toString();
    const password = await hashPassword('Test123!');
    await new User({ email: 'opsuper@t.local', password, firstName: 'S', lastName: 'U', role: Role.SUPER_ADMIN, isActive: true }).save();
    await new User({ email: 'opsA@t.local', password, firstName: 'O', lastName: 'A', role: Role.COMPANY_ADMIN, companyId: companyA._id, isActive: true }).save();

    await new WebhookEvent({
      provider: 'website', eventType: 'lead_created', externalEventId: 'ops-ev-a',
      payload: {}, status: 'processed', attempts: 1, maxAttempts: 3,
      receivedAt: new Date(), companyId: companyA._id,
    }).save();
    await new WebhookEvent({
      provider: 'website', eventType: 'lead_created', externalEventId: 'ops-ev-b',
      payload: {}, status: 'processed', attempts: 1, maxAttempts: 3,
      receivedAt: new Date(), companyId: companyB._id,
    }).save();

    const sLogin = await request(app).post('/api/auth/login').send({ email: 'opsuper@t.local', password: 'Test123!' });
    tokenSuper = sLogin.body.data.accessToken as string;
    const aLogin = await request(app).post('/api/auth/login').send({ email: 'opsA@t.local', password: 'Test123!' });
    tokenA = aLogin.body.data.accessToken as string;
  }, 30000);

  afterAll(async () => {
    await closeTestDB();
  });

  test('company create writes an audit row', async () => {
    const res = await request(app)
      .post('/api/companies')
      .set('Authorization', `Bearer ${tokenSuper}`)
      .send({ name: 'Audited Co' });
    expect(res.status).toBe(201);
    const rows = await AuditLog.find({ action: 'COMPANY_CREATED', companyId: res.body.data.company._id });
    expect(rows).toHaveLength(1);
    expect(rows[0].actorId).toBeDefined();
  });

  test('lead assign writes an audit row', async () => {
    const leadRes = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Audit Al', email: 'al@audit.local' });
    expect(leadRes.status).toBe(201);
    const assignRes = await request(app)
      .post(`/api/leads/${leadRes.body.data._id}/assign`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ assignedTo: leadRes.body.data._id });
    expect(assignRes.status).toBe(200);
    const rows = await AuditLog.find({ action: 'LEAD_ASSIGNED' });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test('webhook list is tenant-scoped', async () => {
    const resA = await request(app).get('/api/webhooks').set('Authorization', `Bearer ${tokenA}`);
    expect(resA.status).toBe(200);
    expect(resA.body.data.map((e: any) => e.externalEventId)).toEqual(['ops-ev-a']);

    const resSuper = await request(app).get('/api/webhooks').set('Authorization', `Bearer ${tokenSuper}`);
    expect(resSuper.body.data.length).toBeGreaterThanOrEqual(2);

    const anon = await request(app).get('/api/webhooks');
    expect(anon.status).toBe(401);
  });

  test('super admin audit log lists entries', async () => {
    const res = await request(app).get('/api/admin/audit-logs').set('Authorization', `Bearer ${tokenSuper}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  test('company onboarding creates company + first admin with one-time credentials', async () => {
    const res = await request(app)
      .post('/api/companies')
      .set('Authorization', `Bearer ${tokenSuper}`)
      .send({
        name: 'Onboarded Co',
        contactEmail: 'hello@onboarded.local',
        city: 'Bengaluru',
        admin: { firstName: 'First', lastName: 'Admin', email: 'first@onboarded.local', password: 'Test123!' },
      });
    expect(res.status).toBe(201);
    expect(res.body.data.company.contactEmail).toBe('hello@onboarded.local');
    expect(res.body.data.adminCredentials).toEqual({ email: 'first@onboarded.local', password: 'Test123!' });

    const login = await request(app).post('/api/auth/login').send({ email: 'first@onboarded.local', password: 'Test123!' });
    expect(login.status).toBe(200);
    expect(login.body.data.user.role).toBe(Role.COMPANY_ADMIN);
    expect(login.body.data.user.companyId).toBe(res.body.data.company._id);
  });

  test('duplicate admin email rolls back the company', async () => {
    const before = await Company.countDocuments({});
    const res = await request(app)
      .post('/api/companies')
      .set('Authorization', `Bearer ${tokenSuper}`)
      .send({
        name: 'Rollback Co',
        admin: { firstName: 'Dup', lastName: 'Admin', email: 'first@onboarded.local', password: 'Test123!' },
      });
    expect(res.status).toBe(409);
    expect(await Company.countDocuments({})).toBe(before);
  });

  test('staff scope lists platform staff only, forbidden for company admins', async () => {
    const res = await request(app).get('/api/users?scope=staff').set('Authorization', `Bearer ${tokenSuper}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.every((u: any) => !u.companyId)).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('$2b$');

    const forbidden = await request(app).get('/api/users?scope=staff').set('Authorization', `Bearer ${tokenA}`);
    expect(forbidden.status).toBe(403);
  });
});

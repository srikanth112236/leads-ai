import request from 'supertest';
import { app } from '../src/app';
import { connectTestDB, clearTestDB, closeTestDB } from './setup';
import { User } from '../src/common/models/User';
import { Company } from '../src/common/models/Company';
import { Branch } from '../src/common/models/Branch';
import { WebhookEvent } from '../src/common/models/WebhookEvent';
import { hashPassword } from '../src/common/security/hash';
import { Role } from '../src/common/types';

describe('super-admin company scope filters', () => {
  let companyA: any;
  let companyB: any;
  let superToken: string;
  let adminAToken: string;

  beforeAll(async () => {
    await connectTestDB();
    await clearTestDB();

    companyA = await new Company({ name: 'Scope A', status: 'active' }).save();
    companyB = await new Company({ name: 'Scope B', status: 'active' }).save();
    await new Branch({ companyId: companyA._id, name: 'A HQ', status: 'active' }).save();
    await new Branch({ companyId: companyB._id, name: 'B HQ', status: 'active' }).save();

    const password = await hashPassword('Password123!');
    await new User({ email: 'scope-super@t.local', password, firstName: 'S', lastName: 'U', role: Role.SUPER_ADMIN, isActive: true, mustChangePassword: false }).save();
    await new User({ email: 'scope-admin-a@t.local', password, firstName: 'A', lastName: 'A', role: Role.COMPANY_ADMIN, companyId: companyA._id, isActive: true, mustChangePassword: false }).save();

    await WebhookEvent.create({ provider: 'meta', eventType: 'leadgen', externalEventId: 'scope-a-1', payload: { a: 1 }, status: 'failed', receivedAt: new Date(), companyId: companyA._id });
    await WebhookEvent.create({ provider: 'meta', eventType: 'leadgen', externalEventId: 'scope-b-1', payload: { b: 1 }, status: 'failed', receivedAt: new Date(), companyId: companyB._id });

    const login = async (email: string) => {
      const res = await request(app).post('/api/auth/login').send({ email, password: 'Password123!' });
      expect(res.status).toBe(200);
      return res.body.data.accessToken as string;
    };
    superToken = await login('scope-super@t.local');
    adminAToken = await login('scope-admin-a@t.local');
  }, 30000);

  afterAll(async () => {
    await closeTestDB();
  });

  test('super-admin webhooks filter by companyId; foreign access denied for admins', async () => {
    const scoped = await request(app)
      .get(`/api/webhooks?companyId=${companyB._id}&status=failed`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(scoped.status).toBe(200);
    expect(scoped.body.data.length).toBe(1);
    expect(String(scoped.body.data[0].companyId)).toBe(String(companyB._id));

    const own = await request(app).get('/api/webhooks').set('Authorization', `Bearer ${adminAToken}`);
    expect(own.status).toBe(200);
    expect(own.body.data.every((e: any) => String(e.companyId) === String(companyA._id))).toBe(true);

    const foreign = await request(app)
      .get(`/api/webhooks?companyId=${companyB._id}`)
      .set('Authorization', `Bearer ${adminAToken}`);
    expect(foreign.status).toBe(403);
    expect(foreign.body.code).toBe('TENANT_VIOLATION');
  });

  test('super-admin branches filter by companyId; foreign access denied for admins', async () => {
    const scoped = await request(app)
      .get(`/api/branches?companyId=${companyB._id}`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(scoped.status).toBe(200);
    expect(scoped.body.data.length).toBe(1);
    expect(scoped.body.data[0].name).toBe('B HQ');

    const foreign = await request(app)
      .get(`/api/branches?companyId=${companyB._id}`)
      .set('Authorization', `Bearer ${adminAToken}`);
    expect(foreign.status).toBe(403);
    expect(foreign.body.code).toBe('TENANT_VIOLATION');
  });

  test('super-admin audit logs filter by companyId', async () => {
    const res = await request(app)
      .get(`/api/admin/audit-logs?companyId=${companyA._id}`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

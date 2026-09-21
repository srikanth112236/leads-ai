import request from 'supertest';
import { app } from '../src/app';
import { connectTestDB, clearTestDB, closeTestDB } from './setup';
import { User } from '../src/common/models/User';
import { Company } from '../src/common/models/Company';
import { Lead } from '../src/common/models/Lead';
import { LeadSource } from '../src/common/models/LeadSource';
import { hashPassword } from '../src/common/security/hash';
import { Role } from '../src/common/types';

describe('registration + source hardening', () => {
  let tokenA: string;
  let leadBId: string;

  beforeAll(async () => {
    await connectTestDB();
    await clearTestDB();

    const companyA = await new Company({ name: 'Reg A', status: 'active' }).save();
    const companyB = await new Company({ name: 'Reg B', status: 'active' }).save();
    const password = await hashPassword('Test123!');
    await new User({ email: 'regA@t.local', password, firstName: 'R', lastName: 'A', role: Role.COMPANY_ADMIN, companyId: companyA._id, isActive: true }).save();
    const leadB = await new Lead({ companyId: companyB._id, name: 'Reg B Lead', source: 'MANUAL' }).save();
    leadBId = leadB._id.toString();
    await new LeadSource({ leadId: leadB._id, sourceType: 'MANUAL', rawData: {} }).save();

    const login = await request(app).post('/api/auth/login').send({ email: 'regA@t.local', password: 'Test123!' });
    tokenA = login.body.data.accessToken as string;
  }, 30000);

  afterAll(async () => {
    await closeTestDB();
  });

  test('public registration cannot grant roles or tenants', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'sneaky@t.local',
      password: 'Test123!',
      firstName: 'S',
      lastName: 'N',
      role: Role.SUPER_ADMIN,
      companyId: '000000000000000000000001',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe(Role.SALES_AGENT);
    const created = await User.findOne({ email: 'sneaky@t.local' });
    expect(created?.role).toBe(Role.SALES_AGENT);
    expect(created?.companyId).toBeUndefined();
  });

  test('cross-company lead sources are forbidden', async () => {
    const res = await request(app).get(`/api/leads/${leadBId}/sources`).set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(403);
  });

  test('export route is reachable (not swallowed by :id)', async () => {
    const res = await request(app).get('/api/leads/export').set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).not.toBe(404);
  });
});

import request from 'supertest';
import { app } from '../src/app';
import { connectTestDB, clearTestDB, closeTestDB } from './setup';
import { User } from '../src/common/models/User';
import { Company } from '../src/common/models/Company';
import { Branch } from '../src/common/models/Branch';
import { Lead } from '../src/common/models/Lead';
import { hashPassword } from '../src/common/security/hash';
import { Role } from '../src/common/types';

async function makeUser(email: string, role: Role, companyId?: string, branchId?: string) {
  const user = new User({
    email,
    password: await hashPassword('Test123!'),
    firstName: 'Test',
    lastName: 'User',
    role,
    companyId,
    branchId,
    isActive: true,
  });
  await user.save();
  return user;
}

async function login(email: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ email, password: 'Test123!' });
  expect(res.status).toBe(200);
  return res.body.data.accessToken as string;
}

describe('tenant isolation (§36)', () => {
  let tokenA: string;
  let tokenB: string;
  let tokenAgentA1: string;
  let tokenSuper: string;
  let companyBId: string;
  let leadA1Id: string;
  let leadA2Id: string;
  let leadBId: string;

  beforeAll(async () => {
    await connectTestDB();
    await clearTestDB();

    const companyA = await new Company({ name: 'Company A', status: 'active' }).save();
    const companyB = await new Company({ name: 'Company B', status: 'active' }).save();
    companyBId = companyB._id.toString();
    const branchA1 = await new Branch({ companyId: companyA._id, name: 'A1', status: 'active' }).save();
    const branchA2 = await new Branch({ companyId: companyA._id, name: 'A2', status: 'active' }).save();

    await makeUser('super@test.local', Role.SUPER_ADMIN);
    await makeUser('adminA@test.local', Role.COMPANY_ADMIN, companyA._id.toString());
    await makeUser('adminB@test.local', Role.COMPANY_ADMIN, companyB._id.toString());
    await makeUser(
      'agentA1@test.local', Role.SALES_AGENT,
      companyA._id.toString(), branchA1._id.toString(),
    );

    const leadA1 = await new Lead({ companyId: companyA._id, branchId: branchA1._id, name: 'Lead A1', source: 'MANUAL' }).save();
    const leadA2 = await new Lead({ companyId: companyA._id, branchId: branchA2._id, name: 'Lead A2', source: 'MANUAL' }).save();
    const leadB = await new Lead({ companyId: companyB._id, name: 'Lead B', source: 'MANUAL' }).save();
    leadA1Id = leadA1._id.toString();
    leadA2Id = leadA2._id.toString();
    leadBId = leadB._id.toString();

    tokenA = await login('adminA@test.local');
    tokenB = await login('adminB@test.local');
    tokenAgentA1 = await login('agentA1@test.local');
    tokenSuper = await login('super@test.local');
  }, 30000);

  afterAll(async () => {
    await closeTestDB();
  });

  test('Company A cannot read Company B leads', async () => {
    const res = await request(app).get(`/api/leads/${leadBId}`).set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(403);
  });

  test('Company A cannot update Company B leads', async () => {
    const res = await request(app)
      .put(`/api/leads/${leadBId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Hacked' });
    expect(res.status).toBe(403);
    const unchanged = await Lead.findById(leadBId);
    expect(unchanged?.name).toBe('Lead B');
  });

  test('Branch A1 agent cannot read Branch A2 leads', async () => {
    const res = await request(app).get(`/api/leads/${leadA2Id}`).set('Authorization', `Bearer ${tokenAgentA1}`);
    expect(res.status).toBe(403);
  });

  test('Branch A1 agent can read own branch lead', async () => {
    const res = await request(app).get(`/api/leads/${leadA1Id}`).set('Authorization', `Bearer ${tokenAgentA1}`);
    expect(res.status).toBe(200);
  });

  test('companyId in body cannot escape tenant isolation', async () => {
    const res = await request(app)
      .put(`/api/leads/${leadA1Id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'X', companyId: companyBId });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TENANT_VIOLATION');
  });

  test('created lead ignores foreign companyId in body', async () => {
    const res = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'Sneaky', companyId: '000000000000000000000001' });
    expect(res.status).toBe(201);
    expect(res.body.data.companyId).not.toBe('000000000000000000000001');
  });

  test('SUPER_ADMIN can read any company lead', async () => {
    const res = await request(app).get(`/api/leads/${leadBId}`).set('Authorization', `Bearer ${tokenSuper}`);
    expect(res.status).toBe(200);
  });

  test('unauthenticated lead access is rejected', async () => {
    const res = await request(app).get('/api/leads');
    expect(res.status).toBe(401);
  });
});

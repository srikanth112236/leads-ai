import request from 'supertest';
import { app } from '../src/app';
import { connectTestDB, clearTestDB, closeTestDB } from './setup';
import { User } from '../src/common/models/User';
import { Company } from '../src/common/models/Company';
import { Branch } from '../src/common/models/Branch';
import { BranchMembership } from '../src/common/models/BranchMembership';
import { hashPassword } from '../src/common/security/hash';
import { Role } from '../src/common/types';

describe('advanced branch provisioning', () => {
  let tokenA: string;
  let companyAId: string;

  beforeAll(async () => {
    await connectTestDB();
    await clearTestDB();

    const companyA = await new Company({ name: 'Provision Corp', status: 'active' }).save();
    companyAId = companyA._id.toString();
    const password = await hashPassword('Test123!');
    await new User({ email: 'provA@t.local', password, firstName: 'P', lastName: 'A', role: Role.COMPANY_ADMIN, companyId: companyA._id, isActive: true }).save();

    const login = await request(app).post('/api/auth/login').send({ email: 'provA@t.local', password: 'Test123!' });
    tokenA = login.body.data.accessToken as string;
  }, 30000);

  afterAll(async () => {
    await closeTestDB();
  });

  test('creates branch with auto code, type, timezone and provisioned users', async () => {
    const res = await request(app)
      .post('/api/branches')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Hyderabad',
        branchType: 'sales_office',
        timezone: 'Asia/Kolkata',
        users: [
          { firstName: 'Asha', lastName: 'M', email: 'asha.prov@t.local', role: 'sales_executive' },
          { firstName: 'Ravi', lastName: 'K', email: 'ravi.prov@t.local', role: 'ads_manager' },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.branch.branchCode).toMatch(/^BR-[A-Z0-9]{2,3}-\d{3}$/);
    expect(res.body.data.branch.branchType).toBe('sales_office');
    expect(res.body.data.provisioned).toHaveLength(2);

    const [asha, ravi] = res.body.data.provisioned;
    expect(asha.accessId).toMatch(/^SE-BR-.*-\w{4}$/);
    expect(ravi.accessId).toMatch(/^AM-BR-.*-\w{4}$/);
    expect(asha.tempPassword).toBeDefined();

    // Temp credentials actually log in
    const login = await request(app).post('/api/auth/login').send({ email: 'asha.prov@t.local', password: asha.tempPassword });
    expect(login.status).toBe(200);

    // Memberships wire the new branch as primary scope
    const memberships = await BranchMembership.find({ userId: (await User.findOne({ email: 'asha.prov@t.local' }))!._id });
    expect(memberships.length).toBeGreaterThanOrEqual(1);
  });

  test('second branch gets next sequence code', async () => {
    const res = await request(app)
      .post('/api/branches')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Bangalore' });
    expect(res.status).toBe(201);
    expect(res.body.data.branch.branchCode).toMatch(/^BR-[A-Z0-9]{2,3}-002$/);
  });

  test('duplicate email rolls back nothing extra; invalid role rejected', async () => {
    const bad = await request(app)
      .post('/api/branches')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Bad Role', users: [{ firstName: 'X', lastName: 'Y', email: 'x@t.local', role: 'super_admin' }] });
    expect(bad.status).toBe(400);

    const dup = await request(app)
      .post('/api/branches')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Dup', users: [{ firstName: 'A', lastName: 'B', email: 'asha.prov@t.local', role: 'sales_executive' }] });
    expect(dup.status).toBe(409);
    expect(await Branch.findOne({ name: 'Dup' })).toBeNull();
  });

  test('parent must belong to same company', async () => {
    const otherCompany = await new Company({ name: 'Other Co', status: 'active' }).save();
    const otherBranch = await new Branch({ companyId: otherCompany._id, branchCode: 'BR-OTH-001', name: 'Other HQ' }).save();
    const res = await request(app)
      .post('/api/branches')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Bad Child', parentBranchId: otherBranch._id.toString() });
    expect(res.status).toBe(400);
    void companyAId;
  });
});

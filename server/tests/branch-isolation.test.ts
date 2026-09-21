import request from 'supertest';
import { app } from '../src/app';
import { connectTestDB, clearTestDB, closeTestDB } from './setup';
import { User } from '../src/common/models/User';
import { Company } from '../src/common/models/Company';
import { Branch } from '../src/common/models/Branch';
import { hashPassword } from '../src/common/security/hash';
import { Role } from '../src/common/types';

describe('branch isolation', () => {
  let tokenA: string;
  let tokenSuper: string;
  let companyAId: string;
  let branchBId: string;

  beforeAll(async () => {
    await connectTestDB();
    await clearTestDB();

    const companyA = await new Company({ name: 'Branch A', status: 'active' }).save();
    const companyB = await new Company({ name: 'Branch B', status: 'active' }).save();
    companyAId = companyA._id.toString();
    const branchB = await new Branch({ companyId: companyB._id, name: 'B-HQ', status: 'active' }).save();
    branchBId = branchB._id.toString();
    const password = await hashPassword('Test123!');
    await new User({ email: 'branchA@t.local', password, firstName: 'B', lastName: 'A', role: Role.COMPANY_ADMIN, companyId: companyA._id, isActive: true }).save();
    await new User({ email: 'branchsuper@t.local', password, firstName: 'S', lastName: 'U', role: Role.SUPER_ADMIN, isActive: true }).save();

    const aLogin = await request(app).post('/api/auth/login').send({ email: 'branchA@t.local', password: 'Test123!' });
    tokenA = aLogin.body.data.accessToken as string;
    const sLogin = await request(app).post('/api/auth/login').send({ email: 'branchsuper@t.local', password: 'Test123!' });
    tokenSuper = sLogin.body.data.accessToken as string;
  }, 30000);

  afterAll(async () => {
    await closeTestDB();
  });

  test('company admin cannot create a branch in another company', async () => {
    const otherCompany = await Company.findOne({ name: 'Branch B' });
    const res = await request(app)
      .post('/api/branches')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ companyId: otherCompany!._id.toString(), name: 'Sneaky' });
    expect(res.status).toBe(201);
    expect(res.body.data.companyId).toBe(companyAId);
  });

  test('company admin cannot read/update/delete another company branch', async () => {
    const get = await request(app).get(`/api/branches/${branchBId}`).set('Authorization', `Bearer ${tokenA}`);
    expect(get.status).toBe(403);
    const put = await request(app).put(`/api/branches/${branchBId}`).set('Authorization', `Bearer ${tokenA}`).send({ name: 'X' });
    expect(put.status).toBe(403);
    const del = await request(app).delete(`/api/branches/${branchBId}`).set('Authorization', `Bearer ${tokenA}`);
    expect(del.status).toBe(403);
    expect(await Branch.findById(branchBId)).not.toBeNull();
  });

  test('super admin manages any branch', async () => {
    const get = await request(app).get(`/api/branches/${branchBId}`).set('Authorization', `Bearer ${tokenSuper}`);
    expect(get.status).toBe(200);
  });
});

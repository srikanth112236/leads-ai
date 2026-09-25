import request from 'supertest';
import { app } from '../src/app';
import { connectTestDB, clearTestDB, closeTestDB } from './setup';
import { User } from '../src/common/models/User';
import { Company } from '../src/common/models/Company';
import { Branch } from '../src/common/models/Branch';
import { MetaIntegration } from '../src/common/models/MetaIntegration';
import { MetaPage } from '../src/common/models/MetaPage';
import { hashPassword } from '../src/common/security/hash';
import { Role } from '../src/common/types';
import { MetaService } from '../src/modules/meta/meta.service';

describe('multi-portfolio branches (§phase-20)', () => {
  let tokenA: string;
  let companyAId: string;
  let branchA1Id: string;
  let branchA2Id: string;

  beforeAll(async () => {
    await connectTestDB();
    await clearTestDB();

    const companyA = await new Company({ name: 'Portfolio A', status: 'active' }).save();
    companyAId = companyA._id.toString();
    const b1 = await new Branch({ companyId: companyA._id, name: 'A1', status: 'active' }).save();
    const b2 = await new Branch({ companyId: companyA._id, name: 'A2', status: 'active' }).save();
    branchA1Id = b1._id.toString();
    branchA2Id = b2._id.toString();
    const password = await hashPassword('Test123!');
    await new User({ email: 'pfA@t.local', password, firstName: 'P', lastName: 'F', role: Role.COMPANY_ADMIN, companyId: companyA._id, isActive: true }).save();

    const i1 = await new MetaIntegration({ companyId: companyA._id, portfolioBusinessId: 'biz-1', label: 'Biz One', accessToken: 'tok-1', status: 'active' }).save();
    await new MetaIntegration({ companyId: companyA._id, portfolioBusinessId: 'biz-2', label: 'Biz Two', accessToken: 'tok-2', status: 'active' }).save();
    await new MetaPage({ metaPageId: 'pp-1', companyId: companyA._id, integrationId: i1._id, status: 'active' }).save();
    const i2 = await MetaIntegration.findOne({ portfolioBusinessId: 'biz-2' });
    await new MetaPage({ metaPageId: 'pp-2', companyId: companyA._id, branchId: b2._id, integrationId: i2!._id, status: 'active' }).save();

    const login = await request(app).post('/api/auth/login').send({ email: 'pfA@t.local', password: 'Test123!' });
    tokenA = login.body.data.accessToken as string;
  }, 30000);

  afterAll(async () => {
    await closeTestDB();
  });

  test('two portfolios coexist with distinct tokens', async () => {
    const rows = await MetaIntegration.find({ companyId: companyAId }).select('+accessToken');
    expect(rows).toHaveLength(2);
    expect(rows[0].accessToken).not.toBe(rows[1].accessToken);
  });

  test('unmapped page fails closed without default branch', async () => {
    const tenant = await MetaService.resolveTenant(undefined, 'pp-1');
    expect(tenant?.companyId).toBe(companyAId);
    expect(tenant?.branchId).toBeUndefined();
  });

  test('company default branch applies, explicit mapping wins', async () => {
    const setRes = await request(app)
      .put(`/api/companies/${companyAId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ defaultBranchId: branchA1Id });
    expect(setRes.status).toBe(200);

    const fallback = await MetaService.resolveTenant(undefined, 'pp-1');
    expect(fallback?.branchId).toBe(branchA1Id);

    const explicit = await MetaService.resolveTenant(undefined, 'pp-2');
    expect(explicit?.branchId).toBe(branchA2Id);
  });

  test('default branch must belong to the company', async () => {
    const otherBranch = '000000000000000000000000';
    const res = await request(app)
      .put(`/api/companies/${companyAId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ defaultBranchId: otherBranch });
    expect(res.status).toBe(400);
  });

  test('sync pulls every active portfolio, not just the first', async () => {
    const adCalls: string[] = [];
    (global as any).fetch = jest.fn(async (url: string) => {
      if (String(url).includes('/me/adaccounts')) adCalls.push(String(url));
      return { ok: true, json: async () => ({ data: [] }) };
    });
    const result = await MetaService.syncAdAccounts(companyAId);
    expect(result.synced).toBe(0);
    expect(adCalls).toHaveLength(2);
    delete (global as any).fetch;
  });
});

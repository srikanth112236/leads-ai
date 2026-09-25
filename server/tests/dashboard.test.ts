import request from 'supertest';
import { app } from '../src/app';
import { connectTestDB, clearTestDB, closeTestDB } from './setup';
import { User } from '../src/common/models/User';
import { Company } from '../src/common/models/Company';
import { Lead } from '../src/common/models/Lead';
import { MetaAdAccount } from '../src/common/models/MetaAdAccount';
import { hashPassword } from '../src/common/security/hash';
import { Role } from '../src/common/types';

describe('dashboard summary', () => {
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    await connectTestDB();
    await clearTestDB();

    const companyA = await new Company({ name: 'Dash A', status: 'active' }).save();
    const companyB = await new Company({ name: 'Dash B', status: 'active' }).save();
    const password = await hashPassword('Test123!');
    await new User({ email: 'dashA@t.local', password, firstName: 'D', lastName: 'A', role: Role.COMPANY_ADMIN, companyId: companyA._id, isActive: true }).save();
    await new User({ email: 'dashB@t.local', password, firstName: 'D', lastName: 'B', role: Role.COMPANY_ADMIN, companyId: companyB._id, isActive: true }).save();
    await new Lead({ companyId: companyA._id, name: 'L1', source: 'WEBSITE_FORM', status: 'new' }).save();
    await new Lead({ companyId: companyA._id, name: 'L2', source: 'META_LEAD_ADS', status: 'converted' }).save();
    await new Lead({ companyId: companyB._id, name: 'L3', source: 'WEBSITE_FORM', status: 'new' }).save();
    await new MetaAdAccount({ metaAdAccountId: 'act-d1', companyId: companyA._id, integrationId: companyA._id, name: 'Dash Motors', amountSpent: '1000', currency: 'INR', status: 'active' }).save();

    const aLogin = await request(app).post('/api/auth/login').send({ email: 'dashA@t.local', password: 'Test123!' });
    tokenA = aLogin.body.data.accessToken as string;
    const bLogin = await request(app).post('/api/auth/login').send({ email: 'dashB@t.local', password: 'Test123!' });
    tokenB = bLogin.body.data.accessToken as string;
  }, 30000);

  afterAll(async () => {
    await closeTestDB();
  });

  test('returns scoped aggregates', async () => {
    const res = await request(app).get('/api/dashboard/summary').set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.data.leads.total).toBe(2);
    expect(res.body.data.leads.converted).toBe(1);
    expect(res.body.data.leads.conversionRate).toBe(50);
    expect(res.body.data.leads.bySource.META_LEAD_ADS).toBe(1);
    expect(res.body.data.portfolios.adAccounts).toBe(1);
    expect(res.body.data.portfolios.totalSpend).toBe(1000);
    expect(res.body.data.team.users).toBe(1);
  });

  test('cross-company data is excluded', async () => {
    const res = await request(app).get('/api/dashboard/summary').set('Authorization', `Bearer ${tokenB}`);
    expect(res.body.data.leads.total).toBe(1);
    expect(res.body.data.portfolios.adAccounts).toBe(0);
  });

  test('agents cannot view summary', async () => {
    const anon = await request(app).get('/api/dashboard/summary');
    expect(anon.status).toBe(401);
  });
});

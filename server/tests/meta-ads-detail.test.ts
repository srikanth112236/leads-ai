import request from 'supertest';
import { app } from '../src/app';
import { connectTestDB, clearTestDB, closeTestDB } from './setup';
import { User } from '../src/common/models/User';
import { Company } from '../src/common/models/Company';
import { MetaIntegration } from '../src/common/models/MetaIntegration';
import { MetaAdAccount } from '../src/common/models/MetaAdAccount';
import { hashPassword } from '../src/common/security/hash';
import { Role } from '../src/common/types';

describe('meta ad account detail', () => {
  let tokenA: string;
  let tokenB: string;
  let accountId: string;

  beforeAll(async () => {
    await connectTestDB();
    await clearTestDB();

    const companyA = await new Company({ name: 'Detail A', status: 'active' }).save();
    const companyB = await new Company({ name: 'Detail B', status: 'active' }).save();
    const integration = await new MetaIntegration({ companyId: companyA._id, accessToken: 'tok', status: 'active' }).save();
    const account = await new MetaAdAccount({ metaAdAccountId: 'act_1', companyId: companyA._id, integrationId: integration._id, name: 'Detail Motors', status: 'active' }).save();
    accountId = account._id.toString();
    const password = await hashPassword('Test123!');
    await new User({ email: 'detA@t.local', password, firstName: 'D', lastName: 'A', role: Role.COMPANY_ADMIN, companyId: companyA._id, isActive: true }).save();
    await new User({ email: 'detB@t.local', password, firstName: 'D', lastName: 'B', role: Role.COMPANY_ADMIN, companyId: companyB._id, isActive: true }).save();

    const aLogin = await request(app).post('/api/auth/login').send({ email: 'detA@t.local', password: 'Test123!' });
    tokenA = aLogin.body.data.accessToken as string;
    const bLogin = await request(app).post('/api/auth/login').send({ email: 'detB@t.local', password: 'Test123!' });
    tokenB = bLogin.body.data.accessToken as string;

    (global as any).fetch = jest.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('/campaigns')) {
        return {
          ok: true,
          json: async () => ({
            data: [{
              id: 'cmp-1', name: 'Test Drive', status: 'ACTIVE', objective: 'LEAD_GENERATION',
              insights: [{ spend: '500', reach: '10000', impressions: '20000', results: [{ action_type: 'lead', value: '25' }] }],
            }, {
              id: 'cmp-2', name: 'Brand', status: 'PAUSED', objective: 'BRAND_AWARENESS',
            }],
          }),
        };
      }
      if (u.includes('/insights')) {
        return { ok: true, json: async () => ({ data: [{ impressions: '1000', reach: '800', spend: '50', ctr: '2.5', actions: [{ action_type: 'lead', value: '5' }] }] }) };
      }
      if (u.includes('/previews')) {
        return { ok: true, json: async () => ({ data: [{ body: '<iframe>creative</iframe>' }] }) };
      }
      if (u.includes('/ads')) {
        return { ok: true, json: async () => ({ data: [{ id: 'ad-1', name: 'Creative One', status: 'ACTIVE', creative: { id: 'cr-9' } }] }) };
      }
      return { ok: false, json: async () => ({ error: { message: 'unexpected', code: 1 } }) };
    });
  }, 30000);

  afterAll(async () => {
    delete (global as any).fetch;
    await closeTestDB();
  });

  test('overview returns account + campaigns with mapped metrics', async () => {
    const res = await request(app).get(`/api/meta/adaccounts/${accountId}/overview`).set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.data.account.metaAdAccountId).toBe('act_1');
    expect(res.body.data.campaigns).toHaveLength(2);
    expect(res.body.data.campaigns[0].metrics).toMatchObject({ spend: '500', leads: '25' });
    expect(res.body.data.campaigns[1].metrics.leads).toBe('0');
  });

  test('overview is tenant-scoped', async () => {
    const res = await request(app).get(`/api/meta/adaccounts/${accountId}/overview`).set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(403);
  });

  test('campaign ads include metrics + preview', async () => {
    const res = await request(app).get('/api/meta/campaigns/ads').query({ campaignId: 'cmp-1' }).set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].metrics).toMatchObject({ leads: '5', ctr: '2.5' });
    expect(res.body.data[0].preview).toBe('<iframe>creative</iframe>');
  });

  test('unknown account is 404', async () => {
    const res = await request(app).get('/api/meta/adaccounts/000000000000000000000000/overview').set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(404);
  });
});

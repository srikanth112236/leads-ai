import request from 'supertest';
import { app } from '../src/app';
import { connectTestDB, clearTestDB, closeTestDB } from './setup';
import { User } from '../src/common/models/User';
import { Company } from '../src/common/models/Company';
import { MetaIntegration } from '../src/common/models/MetaIntegration';
import { MetaAdAccount } from '../src/common/models/MetaAdAccount';
import { hashPassword } from '../src/common/security/hash';
import { Role } from '../src/common/types';

describe('meta ad accounts', () => {
  let tokenA: string;
  let tokenB: string;
  let integrationA: any;

  beforeAll(async () => {
    await connectTestDB();
    await clearTestDB();

    const companyA = await new Company({ name: 'Ads A', status: 'active' }).save();
    const companyB = await new Company({ name: 'Ads B', status: 'active' }).save();
    integrationA = await new MetaIntegration({ companyId: companyA._id, accessToken: 'tok', status: 'active', scopes: ['ads_read', 'leads_retrieval'] }).save();
    const { MetaPage: FixturePage } = await import('../src/common/models/MetaPage');
    const fixtureIntegration = integrationA;
    await new FixturePage({ metaPageId: 'page-70', companyId: companyA._id, integrationId: fixtureIntegration!._id, status: 'active' }).save();
    const password = await hashPassword('Test123!');
    await new User({ email: 'adsA@t.local', password, firstName: 'A', lastName: 'A', role: Role.COMPANY_ADMIN, companyId: companyA._id, isActive: true }).save();
    await new User({ email: 'adsB@t.local', password, firstName: 'B', lastName: 'B', role: Role.COMPANY_ADMIN, companyId: companyB._id, isActive: true }).save();

    const aLogin = await request(app).post('/api/auth/login').send({ email: 'adsA@t.local', password: 'Test123!' });
    tokenA = aLogin.body.data.accessToken as string;
    const bLogin = await request(app).post('/api/auth/login').send({ email: 'adsB@t.local', password: 'Test123!' });
    tokenB = bLogin.body.data.accessToken as string;

    (global as any).fetch = jest.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('/leadgen_forms')) {
        return { ok: true, json: async () => ({ data: [{ id: 'form-77', name: 'Test Drive Form', status: 'ACTIVE' }] }) };
      }
      if (u.includes('fields=primary_page')) {
        return { ok: true, json: async () => ({ primary_page: { id: 'page-78', name: 'Primary Page' } }) };
      }
      return {
        ok: true,
        json: async () => ({
          data: [{
            id: '837925141957897',
            name: 'Test Motors',
            account_status: 1,
            amount_spent: '12500',
            currency: 'INR',
            timezone_name: 'Asia/Kolkata',
            business_name: 'Test Motors Pvt',
            business: { id: 'biz-1', name: 'Test Motors Pvt' },
          }],
        }),
      };
    });
  }, 30000);

  afterAll(async () => {
    delete (global as any).fetch;
    await closeTestDB();
  });

  test('sync stores account details with act_ id', async () => {
    const res = await request(app).post('/api/meta/adaccounts/sync').set('Authorization', `Bearer ${tokenA}`).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.synced).toBe(1);
    const row = await MetaAdAccount.findOne({ metaAdAccountId: 'act_837925141957897' });
    expect(row?.name).toBe('Test Motors');
    expect(row?.accountStatus).toBe(1);
    expect(row?.currency).toBe('INR');
    expect(row?.lastSyncedAt).toBeDefined();
    expect(row?.ownerBusinessId).toBe('biz-1');
  });

  test('list is tenant-scoped', async () => {
    const resA = await request(app).get('/api/meta/adaccounts').set('Authorization', `Bearer ${tokenA}`);
    expect(resA.status).toBe(200);
    expect(resA.body.data).toHaveLength(1);
    const resB = await request(app).get('/api/meta/adaccounts').set('Authorization', `Bearer ${tokenB}`);
    expect(resB.body.data).toHaveLength(0);
  });

  test('sync without connection fails cleanly', async () => {
    const res = await request(app).post('/api/meta/adaccounts/sync').set('Authorization', `Bearer ${tokenB}`).send({});
    expect(res.status).toBe(400);
  });

  test('token without business_management still syncs accounts (no owner data)', async () => {
    (global as any).fetch = jest.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('business{id,name}')) {
        return { ok: false, status: 400, json: async () => ({ error: { message: 'Requires business_management permission', code: 100 } }) };
      }
      if (u.includes('/leadgen_forms') || u.includes('fields=primary_page')) {
        return { ok: true, json: async () => ({ data: [] }) };
      }
      return {
        ok: true,
        json: async () => ({
          data: [{ id: '555', name: 'No Biz Account', account_status: 1, amount_spent: '100', currency: 'USD', timezone_name: 'America/New_York' }],
        }),
      };
    });
    const res = await request(app).post('/api/meta/adaccounts/sync').set('Authorization', `Bearer ${tokenA}`).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.synced).toBe(1);
    const row = await MetaAdAccount.findOne({ metaAdAccountId: 'act_555' });
    expect(row?.name).toBe('No Biz Account');
    expect(row?.ownerBusinessId).toBeUndefined();
  });

  test('sync discovers lead forms and primary page baseline', async () => {
    const { MetaLeadForm } = await import('../src/common/models/MetaLeadForm');
    const { MetaPage } = await import('../src/common/models/MetaPage');
    const form = await MetaLeadForm.findOne({ metaFormId: 'form-77' });
    expect(form).not.toBeNull();
    expect(form?.status).toBe('inactive');
    const primary = await MetaPage.findOne({ metaPageId: 'page-78' });
    expect(primary).not.toBeNull();
    expect(primary?.status).toBe('pending');
  });

  test('form assign binds branch, blocked cross-company', async () => {
    const { MetaLeadForm } = await import('../src/common/models/MetaLeadForm');
    const { Branch } = await import('../src/common/models/Branch');
    const { Company } = await import('../src/common/models/Company');
    const form = await MetaLeadForm.findOne({ metaFormId: 'form-77' });
    const companyA = await Company.findOne({ name: 'Ads A' });
    const ownBranch = await new Branch({ companyId: companyA!._id, name: 'Ads A HQ', status: 'active' }).save();
    const ok = await request(app)
      .put(`/api/meta/forms/${form!._id}/assign`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ branchId: ownBranch._id.toString() });
    expect(ok.status).toBe(200);
    expect(ok.body.data.status).toBe('active');
    expect(ok.body.data.branchId).toBe(ownBranch._id.toString());

    const cross = await request(app)
      .put(`/api/meta/forms/${form!._id}/assign`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ branchId: ownBranch._id.toString() });
    expect(cross.status).toBe(403);
  });

  test('multi-integration sync handles partial missing permissions (#200) gracefully', async () => {
    const { Company } = await import('../src/common/models/Company');
    const companyA = await Company.findOne({ name: 'Ads A' });
    // Add a second integration that will fail with #200 Missing Permissions
    const intB = await new MetaIntegration({
      companyId: companyA!._id,
      accessToken: 'bad-perm-token',
      portfolioBusinessId: 'biz-999',
      label: 'Second Portfolio',
      status: 'active',
    }).save();

    (global as any).fetch = jest.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('bad-perm-token')) {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            error: { message: '(#200) Missing Permissions', type: 'OAuthException', code: 200 },
          }),
        };
      }
      if (u.includes('/leadgen_forms') || u.includes('fields=primary_page')) {
        return { ok: true, json: async () => ({ data: [] }) };
      }
      return {
        ok: true,
        json: async () => ({
          data: [{ id: '9911', name: 'First Portfolio Account', account_status: 1 }],
        }),
      };
    });

    const res = await request(app)
      .post('/api/meta/adaccounts/sync')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.synced).toBeGreaterThanOrEqual(1);
    expect(res.body.data.warnings).toBeDefined();
    expect(res.body.data.warnings.length).toBeGreaterThan(0);

    const updatedIntB = await MetaIntegration.findById(intB._id);
    expect((updatedIntB?.metadata as any)?.actionRequired).toBe(true);
    expect((updatedIntB?.metadata as any)?.lastSyncStatus).toBe('failed');
  });

  it('audits permissions live from Meta and updates integration scopes', async () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/me/permissions')) {
        return {
          ok: true,
          json: async () => ({
            data: [
              { permission: 'ads_read', status: 'granted' },
              { permission: 'leads_retrieval', status: 'granted' },
              { permission: 'whatsapp_business_messaging', status: 'declined' },
            ],
          }),
        };
      }
      return { ok: true, json: async () => ({ data: [] }) };
    });

    const res = await request(app)
      .post('/api/meta/permissions/audit')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ integrationId: integrationA._id.toString() });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.grantedScopes).toEqual(['ads_read', 'leads_retrieval']);
    expect(res.body.data.declinedScopes).toEqual(['whatsapp_business_messaging']);

    const refreshed = await MetaIntegration.findById(integrationA._id);
    expect(refreshed?.scopes).toEqual(['ads_read', 'leads_retrieval']);
    expect((refreshed?.metadata as any)?.grantedScopes).toEqual(['ads_read', 'leads_retrieval']);
    expect((refreshed?.metadata as any)?.declinedScopes).toEqual(['whatsapp_business_messaging']);
  });

  it('revokes an individual permission and isolates cross-tenant access', async () => {
    // 1. Cross-tenant check: Company B cannot revoke Company A's permission
    const forbiddenRes = await request(app)
      .post('/api/meta/permissions/revoke')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ integrationId: integrationA._id.toString(), permission: 'ads_read' });

    expect(forbiddenRes.status).toBe(403);

    // 2. Company A successfully revokes permission
    (global.fetch as jest.Mock).mockImplementation(async (url: string, opts?: any) => {
      if (opts?.method === 'DELETE' && String(url).includes('/me/permissions/ads_read')) {
        return {
          ok: true,
          json: async () => ({ success: true }),
        };
      }
      return { ok: true, json: async () => ({ success: true }) };
    });

    const res = await request(app)
      .post('/api/meta/permissions/revoke')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ integrationId: integrationA._id.toString(), permission: 'ads_read' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.scopes).not.toContain('ads_read');

    const updated = await MetaIntegration.findById(integrationA._id);
    expect(updated?.scopes).not.toContain('ads_read');
    expect((updated?.metadata as any)?.grantedScopes).not.toContain('ads_read');
    expect((updated?.metadata as any)?.declinedScopes).toContain('ads_read');
  });
});

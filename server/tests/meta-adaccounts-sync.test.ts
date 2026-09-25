import request from 'supertest';
import { app } from '../src/app';
import { connectTestDB, clearTestDB, closeTestDB } from './setup';
import { Company } from '../src/common/models/Company';
import { User } from '../src/common/models/User';
import { MetaIntegration } from '../src/common/models/MetaIntegration';
import { MetaAdAccount } from '../src/common/models/MetaAdAccount';
import { hashPassword } from '../src/common/security/hash';
import { Role } from '../src/common/types';

describe('Meta Ad Accounts synchronization & active integration scoping', () => {
  let tokenAdmin: string;
  let companyId: string;
  let activeIntegrationId: string;
  let inactiveIntegrationId: string;

  beforeAll(async () => {
    await connectTestDB();
    await clearTestDB();

    const company = await new Company({
      name: 'Ad Sync Corp',
      domain: 'adsync.local',
      status: 'active',
    }).save();
    companyId = company._id.toString();

    const password = await hashPassword('AdminPass123!');
    await new User({
      email: 'admin@adsync.local',
      password,
      firstName: 'AdSync',
      lastName: 'Admin',
      role: Role.COMPANY_ADMIN,
      companyId: company._id,
      isActive: true,
    }).save();

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@adsync.local', password: 'AdminPass123!' });
    tokenAdmin = loginRes.body.data.accessToken as string;

    // 1. Create an inactive integration (e.g. Srikanth)
    const inactiveIntegration = await new MetaIntegration({
      companyId: company._id,
      appId: '1459543806165290',
      label: 'Srikanth Mallikarjuna',
      portfolioBusinessId: '122138563413067783',
      status: 'inactive',
      scopes: ['pages_show_list', 'ads_read'],
    }).save();
    inactiveIntegrationId = inactiveIntegration._id.toString();

    // 2. Create an active integration (e.g. Gowthami)
    const activeIntegration = await new MetaIntegration({
      companyId: company._id,
      appId: '1459543806165290',
      label: 'Gowthami Jogireddy',
      portfolioBusinessId: '28609891105332312',
      status: 'active',
      scopes: ['public_profile'],
    }).save();
    activeIntegrationId = activeIntegration._id.toString();

    // 3. Create ad accounts for the inactive integration
    await new MetaAdAccount({
      metaAdAccountId: 'act_841580185163752',
      name: 'Vedasynk Technologies',
      companyId: company._id,
      integrationId: inactiveIntegration._id,
      status: 'active', // initially marked active in legacy state
      amountSpent: '77051',
      currency: 'INR',
    }).save();

    await new MetaAdAccount({
      metaAdAccountId: 'act_837925141957897',
      name: 'Srikanth Personal Ad Account',
      companyId: company._id,
      integrationId: inactiveIntegration._id,
      status: 'active',
      amountSpent: '0',
      currency: 'INR',
    }).save();

    // 4. Create an ad account for the active integration
    await new MetaAdAccount({
      metaAdAccountId: 'act_999000111222',
      name: 'Gowthami Enterprise Ad Account',
      companyId: company._id,
      integrationId: activeIntegration._id,
      status: 'active',
      amountSpent: '12500',
      currency: 'USD',
    }).save();
  }, 30000);

  afterAll(async () => {
    await closeTestDB();
  });

  test('GET /api/meta/adaccounts auto-heals stale accounts and returns ONLY ad accounts for active integrations', async () => {
    const res = await request(app)
      .get('/api/meta/adaccounts')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Should ONLY contain Gowthami's account (active integration)
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].metaAdAccountId).toBe('act_999000111222');
    expect(res.body.data[0].integrationLabel).toBe('Gowthami Jogireddy');
    expect(res.body.data[0].integrationStatus).toBe('active');

    // Verify metadata returns active integrations and ad scope flag
    expect(res.body.meta).toBeDefined();
    expect(res.body.meta.activeIntegrationsCount).toBe(1);
    expect(res.body.meta.activeIntegrations[0].label).toBe('Gowthami Jogireddy');
    expect(res.body.meta.activeIntegrations[0].hasAdScopes).toBe(false);

    // Verify auto-heal: stale ad accounts for inactive integration are now marked inactive in DB
    const staleAccount = await MetaAdAccount.findOne({ metaAdAccountId: 'act_841580185163752' });
    expect(staleAccount?.status).toBe('inactive');
  });

  test('GET /api/meta/adaccounts?includeInactive=true returns all accounts with their status', async () => {
    const res = await request(app)
      .get('/api/meta/adaccounts?includeInactive=true')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(3);

    const inactiveAccount = res.body.data.find((a: any) => a.metaAdAccountId === 'act_841580185163752');
    expect(inactiveAccount.integrationStatus).toBe('inactive');
  });

  test('POST /api/meta/disconnect cascades status inactive to associated ad accounts', async () => {
    const disconnectRes = await request(app)
      .post('/api/meta/disconnect')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ integrationId: activeIntegrationId });

    expect(disconnectRes.status).toBe(200);

    // Verify ad account is now inactive
    const adAccount = await MetaAdAccount.findOne({ metaAdAccountId: 'act_999000111222' });
    expect(adAccount?.status).toBe('inactive');

    // GET /api/meta/adaccounts now returns 0 active accounts
    const listRes = await request(app)
      .get('/api/meta/adaccounts')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBe(0);
  });
});

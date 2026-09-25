import request from 'supertest';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { app } from '../src/app';
import { connectTestDB, closeTestDB } from './setup';
import { Company } from '../src/common/models/Company';
import { Branch } from '../src/common/models/Branch';
import { User } from '../src/common/models/User';
import { MetaIntegration } from '../src/common/models/MetaIntegration';
import { MetaPage } from '../src/common/models/MetaPage';
import { MetaAdAccount } from '../src/common/models/MetaAdAccount';
import { MetaService } from '../src/modules/meta/meta.service';
import { RealtimeService } from '../src/modules/realtime/realtime.service';
import { Role } from '../src/common/types';

jest.setTimeout(30000);

describe('9-Step Meta Real-Time Webhook & Sync Engine', () => {
  let companyId: string;
  let branchId: string;
  let integrationId: string;
  let companyAdminToken: string;
  const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-12345';
  const APP_SECRET = 'test_meta_app_secret_12345';

  beforeAll(async () => {
    process.env.META_APP_SECRET = APP_SECRET;
    process.env.META_WEBHOOK_VERIFY_TOKEN = 'CRM_Secure_2026_!';

    await connectTestDB();

    const company = await Company.create({
      name: 'Realtime Sync Corp',
      status: 'active',
      settings: { timezone: 'Asia/Kolkata' },
    });
    companyId = company._id.toString();

    const branch = await Branch.create({
      name: 'Downtown Main Branch',
      companyId,
      status: 'active',
    });
    branchId = branch._id.toString();

    // Set default branch on company
    company.defaultBranchId = branch._id as any;
    await company.save();

    const { hashPassword } = await import('../src/common/security/hash');
    const password = await hashPassword('AdminPass123!');
    await User.create({
      firstName: 'Realtime',
      lastName: 'Admin',
      email: 'admin-realtime@sync.com',
      password,
      role: Role.COMPANY_ADMIN,
      companyId,
      branchId,
      status: 'active',
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin-realtime@sync.com', password: 'AdminPass123!' });
    companyAdminToken = loginRes.body.data.accessToken as string;

    const integration = await MetaIntegration.create({
      companyId,
      label: 'Main Realtime Meta Ads',
      status: 'active',
      scopes: ['leads_retrieval', 'ads_management', 'ads_read'],
    });
    integrationId = integration._id.toString();

    await MetaPage.create({
      metaPageId: 'page_realtime_101',
      companyId,
      branchId,
      integrationId,
      name: 'Realtime FB Page',
      status: 'active',
    });

    await MetaAdAccount.create({
      metaAdAccountId: 'act_99887766',
      companyId,
      integrationId,
      name: 'Realtime Ad Account',
      status: 'active',
    });
  });

  afterAll(async () => {
    await MetaAdAccount.deleteMany({ companyId });
    await MetaPage.deleteMany({ companyId });
    await MetaIntegration.deleteMany({ companyId });
    await User.deleteMany({ companyId });
    await Branch.deleteMany({ companyId });
    await Company.findByIdAndDelete(companyId);
    await closeTestDB();
  });

  // Step 1 & 2: GET Verification Handshake with hub.challenge
  it('passes Meta GET handshake with CRM_Secure_2026_! verify token', async () => {
    const challenge = 'challenge_test_code_999';
    const res = await request(app)
      .get('/api/webhooks/meta')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'CRM_Secure_2026_!',
        'hub.challenge': challenge,
      });

    expect(res.status).toBe(200);
    expect(res.text).toBe(challenge);
  });

  it('rejects Meta GET handshake when verify_token is invalid', async () => {
    const res = await request(app)
      .get('/api/webhooks/meta')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong_token',
        'hub.challenge': 'challenge_123',
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('WEBHOOK_VERIFY_FAILED');
  });

  // Step 7: Signature Validation with X-Hub-Signature-256
  it('rejects POST webhook without X-Hub-Signature-256 header', async () => {
    const res = await request(app)
      .post('/api/webhooks/meta')
      .send({ object: 'page', entry: [] });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_SIGNATURE');
  });

  it('accepts POST webhook with cryptographically valid HMAC-SHA256 signature', async () => {
    const payload = JSON.stringify({
      object: 'page',
      entry: [
        {
          id: 'page_realtime_101',
          time: 1720000000,
          changes: [
            {
              field: 'leadgen',
              value: {
                leadgen_id: 'test_lead_auto_9999',
                page_id: 'page_realtime_101',
              },
            },
          ],
        },
      ],
    });

    const signature = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(payload).digest('hex');

    const res = await request(app)
      .post('/api/webhooks/meta')
      .set('x-hub-signature-256', signature)
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // Step 8: Multi-Tenant Resolver Logic
  it('resolves correct companyId, branchId, and integrationId for page leadgen', async () => {
    const tenant = await MetaService.resolveTenant({ pageId: 'page_realtime_101' });
    expect(tenant).not.toBeNull();
    expect(tenant?.companyId).toBe(companyId);
    expect(tenant?.branchId).toBe(branchId);
    expect(tenant?.integrationId).toBe(integrationId);
  });

  it('resolves correct companyId for ad account ads_management', async () => {
    const tenant = await MetaService.resolveTenant({ adAccountId: 'act_99887766' });
    expect(tenant).not.toBeNull();
    expect(tenant?.companyId).toBe(companyId);
    expect(tenant?.integrationId).toBe(integrationId);
  });

  // Step 5 & 6: Subscribe webhooks endpoint for connecting apps
  it('POST /api/meta/subscribe-webhooks responds with subscription status', async () => {
    const res = await request(app)
      .post('/api/meta/subscribe-webhooks')
      .set('Authorization', `Bearer ${companyAdminToken}`)
      .send({ companyId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('pagesSubscribed');
    expect(res.body.data).toHaveProperty('adAccountsSubscribed');
  });

  // Real-Time Broadcaster Test
  it('broadcasts real-time events to connected clients with company isolation', () => {
    let receivedData = '';
    const mockRes: any = {
      write: (chunk: string) => {
        receivedData += chunk;
      },
    };

    RealtimeService.registerClient('test_client_1', mockRes, companyId, 'user_1', false);

    RealtimeService.broadcastToCompany(companyId, {
      type: 'LEAD_CREATED',
      payload: { name: 'Sarah Jenkins', source: 'meta_ads' },
    });

    expect(receivedData).toContain('LEAD_CREATED');
    expect(receivedData).toContain('Sarah Jenkins');

    RealtimeService.removeClient('test_client_1');
  });
});

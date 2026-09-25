import request from 'supertest';
import { app } from '../src/app';
import { connectTestDB, clearTestDB, closeTestDB } from './setup';
import { User } from '../src/common/models/User';
import { Company } from '../src/common/models/Company';
import { Branch } from '../src/common/models/Branch';
import { MetaSyncSetting } from '../src/common/models/MetaSyncSetting';
import { hashPassword } from '../src/common/security/hash';
import { Role } from '../src/common/types';

describe('company settings 100% server synchronization', () => {
  let tokenAdmin: string;
  let companyId: string;
  let branchId: string;

  beforeAll(async () => {
    await connectTestDB();
    await clearTestDB();

    const company = await new Company({
      name: 'Vedasynk Enterprise',
      domain: 'vedasynk.local',
      status: 'active',
      contactEmail: 'admin@vedasynk.local',
    }).save();
    companyId = company._id.toString();

    const branch = await new Branch({
      companyId: company._id,
      name: 'Central Headquarters',
      branchCode: 'BR-HQ-001',
      status: 'active',
    }).save();
    branchId = branch._id.toString();

    const password = await hashPassword('AdminPass123!');
    await new User({
      email: 'admin@vedasynk.local',
      password,
      firstName: 'Vedasynk',
      lastName: 'Admin',
      role: Role.COMPANY_ADMIN,
      companyId: company._id,
      isActive: true,
    }).save();

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@vedasynk.local', password: 'AdminPass123!' });
    tokenAdmin = loginRes.body.data.accessToken as string;
  }, 30000);

  afterAll(async () => {
    await closeTestDB();
  });

  test('PUT /api/companies/:id updates operational fields, default branch, and composite settings object', async () => {
    const payload = {
      contactEmail: 'contact@vedasynk.io',
      contactPhone: '+1 (555) 987-6543',
      address: '100 Silicon Boulevard',
      city: 'San Francisco',
      country: 'United States',
      website: 'https://vedasynk.io',
      defaultBranchId: branchId,
      settings: {
        timezone: 'America/Los_Angeles',
        currency: 'USD',
        branding: {
          logoUrl: 'https://vedasynk.io/logo.png',
          primaryColor: '#4f46e5',
          portalSubtitle: 'Enterprise Portal',
          compactMode: true,
        },
        routing: {
          strategy: 'round_robin',
          dedupPolicy: 'merge_latest',
          autoArchiveDays: 90,
          requirePhone: true,
          requireEmail: true,
        },
        security: {
          sessionTimeoutMinutes: 30,
          minPasswordLength: 10,
          requireSpecialChar: true,
          requireNumber: true,
          twoFactorPolicy: 'managers_only',
          ssoEnabled: true,
          ssoConfig: {
            idpIssuer: 'https://accounts.google.com/o/saml2',
            ssoUrl: 'https://accounts.google.com/o/saml2/idp',
            x509Cert: 'TEST_CERT_DATA',
            autoProvisionUsers: true,
            defaultSsoRole: 'SALES_AGENT',
          },
        },
        notifications: {
          notifyOnNewLead: true,
          notifyOnHotLead: true,
          whatsappAlerts: true,
          whatsappManagerPhone: '+1 (555) 000-1111',
          dailyDigest: true,
          weeklyReport: true,
          alertEmails: 'alerts@vedasynk.io',
        },
      },
    };

    const updateRes = await request(app)
      .put(`/api/companies/${companyId}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send(payload);

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.success).toBe(true);
    expect(updateRes.body.data.contactEmail).toBe('contact@vedasynk.io');
    expect(updateRes.body.data.defaultBranchId).toBe(branchId);
    expect(updateRes.body.data.settings.timezone).toBe('America/Los_Angeles');
    expect(updateRes.body.data.settings.branding.primaryColor).toBe('#4f46e5');
    expect(updateRes.body.data.settings.routing.strategy).toBe('round_robin');
    expect(updateRes.body.data.settings.security.ssoEnabled).toBe(true);
    expect(updateRes.body.data.settings.notifications.whatsappAlerts).toBe(true);

    // Verify database directly
    const stored = await Company.findById(companyId);
    expect(stored?.contactEmail).toBe('contact@vedasynk.io');
    expect((stored?.settings as any)?.timezone).toBe('America/Los_Angeles');
    expect((stored?.settings as any)?.branding?.portalSubtitle).toBe('Enterprise Portal');
  });

  test('GET /api/companies/:id/settings reads back complete server settings', async () => {
    const res = await request(app)
      .get(`/api/companies/${companyId}/settings`)
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.timezone).toBe('America/Los_Angeles');
    expect(res.body.data.routing.autoArchiveDays).toBe(90);
    expect(res.body.data.security.minPasswordLength).toBe(10);
  });

  test('PUT /api/companies/:id/settings updates specific settings directly', async () => {
    const res = await request(app)
      .put(`/api/companies/${companyId}/settings`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        settings: {
          timezone: 'Asia/Dubai',
          currency: 'AED',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.timezone).toBe('Asia/Dubai');
    expect(res.body.data.currency).toBe('AED');

    const stored = await Company.findById(companyId);
    expect((stored?.settings as any)?.timezone).toBe('Asia/Dubai');
  });

  test('PUT /api/meta/sync-settings synchronizes Meta polling interval in MongoDB', async () => {
    const res = await request(app)
      .put('/api/meta/sync-settings')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ enabled: true, intervalMinutes: 15 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.intervalMinutes).toBe(15);

    const setting = await MetaSyncSetting.findOne({ companyId });
    expect(setting?.enabled).toBe(true);
    expect(setting?.intervalMinutes).toBe(15);
  });
});

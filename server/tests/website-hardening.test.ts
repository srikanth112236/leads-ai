import request from 'supertest';
import { app } from '../src/app';
import { connectTestDB, clearTestDB, closeTestDB } from './setup';
import { Company } from '../src/common/models/Company';
import { Branch } from '../src/common/models/Branch';
import { Lead } from '../src/common/models/Lead';
import { WebsiteLeadForm } from '../src/common/models/WebsiteLeadForm';

describe('website hardening (§13–§14)', () => {
  let formKey: string;

  beforeAll(async () => {
    await connectTestDB();
    await clearTestDB();

    const company = await new Company({ name: 'Hardened Co', status: 'active' }).save();
    const branch = await new Branch({ companyId: company._id, name: 'HQ', status: 'active' }).save();
    const form = await new WebsiteLeadForm({
      companyId: company._id,
      branchId: branch._id,
      publicKey: 'hardened-key-123',
      allowedDomains: [],
      status: 'active',
      configuration: {},
    }).save();
    formKey = form.publicKey;
  }, 30000);

  afterAll(async () => {
    await closeTestDB();
  });

  test('missing name is rejected with stable code', async () => {
    const res = await request(app).post('/api/public/leads').send({
      publicKey: formKey,
      email: 'noname@example.com',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('malformed email is rejected', async () => {
    const res = await request(app).post('/api/public/leads').send({
      publicKey: formKey,
      name: 'Bad Email',
      email: 'not-an-email',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('payload with neither email nor phone is rejected', async () => {
    const res = await request(app).post('/api/public/leads').send({
      publicKey: formKey,
      name: 'No Contact',
    });
    expect(res.status).toBe(400);
  });

  test('honeypot submission is silently dropped (no lead stored)', async () => {
    const before = await Lead.countDocuments({});
    const res = await request(app).post('/api/public/leads').send({
      publicKey: formKey,
      name: 'Spam Bot',
      email: 'bot@spam-example.com',
      website_url: 'http://spam.local',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.leadId).toBeUndefined();
    expect(await Lead.countDocuments({})).toBe(before);
  });

  test('valid payload with UTM still creates lead', async () => {
    const res = await request(app).post('/api/public/leads').send({
      publicKey: formKey,
      name: 'Real Person',
      phone: '+913333333333',
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: 'spring',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.leadId).toBeDefined();
  });
});

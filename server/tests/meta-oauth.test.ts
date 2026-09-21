import jwt from 'jsonwebtoken';
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

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

function mockMetaApi() {
  (global as any).fetch = jest.fn(async (url: string) => {
    if (String(url).includes('/me/accounts')) {
      return { ok: true, json: async () => ({ data: [{ id: 'page-99', name: 'Test Page', access_token: 'page-token' }] }) };
    }
    if (String(url).includes('grant_type=fb_exchange_token')) {
      return { ok: true, json: async () => ({ access_token: 'long-lived-token', expires_in: 5184000 }) };
    }
    return { ok: true, json: async () => ({ access_token: 'short-lived-token' }) };
  });
}

describe('meta oauth (§phase-19)', () => {
  let tokenA: string;
  let tokenB: string;
  let companyAId: string;
  let branchAId: string;

  beforeAll(async () => {
    await connectTestDB();
    await clearTestDB();
    process.env.META_APP_ID = 'test-app-id';
    process.env.META_APP_SECRET = 'test-app-secret';

    const companyA = await new Company({ name: 'OAuth A', status: 'active' }).save();
    const companyB = await new Company({ name: 'OAuth B', status: 'active' }).save();
    companyAId = companyA._id.toString();
    const branchA = await new Branch({ companyId: companyA._id, name: 'A1', status: 'active' }).save();
    await new Branch({ companyId: companyA._id, name: 'A2', status: 'active' }).save();
    branchAId = branchA._id.toString();
    const password = await hashPassword('Test123!');
    await new User({ email: 'oauthA@t.local', password, firstName: 'O', lastName: 'A', role: Role.COMPANY_ADMIN, companyId: companyA._id, isActive: true }).save();
    await new User({ email: 'oauthB@t.local', password, firstName: 'O', lastName: 'B', role: Role.COMPANY_ADMIN, companyId: companyB._id, isActive: true }).save();

    const aLogin = await request(app).post('/api/auth/login').send({ email: 'oauthA@t.local', password: 'Test123!' });
    tokenA = aLogin.body.data.accessToken as string;
    const bLogin = await request(app).post('/api/auth/login').send({ email: 'oauthB@t.local', password: 'Test123!' });
    tokenB = bLogin.body.data.accessToken as string;

    mockMetaApi();
  }, 30000);

  afterEach(() => {
    mockMetaApi();
  });

  afterAll(async () => {
    delete (global as any).fetch;
    await closeTestDB();
  });

  test('start returns a facebook dialog URL bound to own company', async () => {
    const res = await request(app).get('/api/meta/oauth/start').set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.data.dialogUrl).toContain('https://www.facebook.com/');
    expect(res.body.data.dialogUrl).toContain('test-app-id');
  });

  test('callback with valid state connects company, encrypts token, stages pages', async () => {
    const admin = await User.findOne({ email: 'oauthA@t.local' });
    const state = jwt.sign({ purpose: 'meta-oauth', companyId: companyAId, userId: admin!._id.toString(), nonce: 'n1' }, JWT_SECRET, { expiresIn: '10m' } as any);
    const res = await request(app).get('/api/meta/oauth/callback').query({ code: 'auth-code', state });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('ok=1');

    const integration = await MetaIntegration.findOne({ companyId: companyAId }).select('+accessToken');
    expect(integration).not.toBeNull();
    expect(integration?.status).toBe('active');
    expect(integration?.accessToken).toMatch(/^enc:v1:/);
    expect(integration?.tokenExpiresAt).toBeDefined();
    const pages = await MetaPage.find({ companyId: companyAId });
    expect(pages).toHaveLength(1);
    expect(pages[0].status).toBe('pending');
    expect(pages[0].branchId).toBeUndefined();
  });

  test('callback with forged state is rejected and creates nothing', async () => {
    const before = await MetaIntegration.countDocuments({});
    const res = await request(app).get('/api/meta/oauth/callback').query({ code: 'x', state: 'forged' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('invalid_state');
    expect(await MetaIntegration.countDocuments({})).toBe(before);
  });

  test('page assign binds branch in own company, blocked cross-company', async () => {
    const page = await MetaPage.findOne({ metaPageId: 'page-99' });
    const ok = await request(app)
      .put(`/api/meta/pages/${page!._id}/assign`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ branchId: branchAId });
    expect(ok.status).toBe(200);
    expect(ok.body.data.status).toBe('active');

    const cross = await request(app)
      .put(`/api/meta/pages/${page!._id}/assign`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ branchId: branchAId });
    expect(cross.status).toBe(403);
  });

  test('disconnect clears the token', async () => {
    const res = await request(app).post('/api/meta/disconnect').set('Authorization', `Bearer ${tokenA}`).send({});
    expect(res.status).toBe(200);
    const integration = await MetaIntegration.findOne({ companyId: companyAId }).select('+accessToken');
    expect(integration?.status).toBe('inactive');
    expect(integration?.accessToken).toBeUndefined();
  });
});

import request from 'supertest';
import { app } from '../src/app';
import { connectTestDB, clearTestDB, closeTestDB } from './setup';
import { User } from '../src/common/models/User';
import { hashPassword } from '../src/common/security/hash';
import { Role } from '../src/common/types';

describe('meta setup helpers (super-only)', () => {
  let tokenSuper: string;
  let tokenAdmin: string;

  beforeAll(async () => {
    await connectTestDB();
    await clearTestDB();
    process.env.META_APP_ID = 'test-app-id';
    process.env.META_APP_SECRET = 'test-app-secret';

    const password = await hashPassword('Test123!');
    await new User({ email: 'setup-super@t.local', password, firstName: 'S', lastName: 'U', role: Role.SUPER_ADMIN, isActive: true }).save();
    const { Company } = await import('../src/common/models/Company');
    const company = await new Company({ name: 'Setup Co', status: 'active' }).save();
    await new User({ email: 'setup-admin@t.local', password, firstName: 'C', lastName: 'A', role: Role.COMPANY_ADMIN, companyId: company._id, isActive: true }).save();

    const sLogin = await request(app).post('/api/auth/login').send({ email: 'setup-super@t.local', password: 'Test123!' });
    tokenSuper = sLogin.body.data.accessToken as string;
    const aLogin = await request(app).post('/api/auth/login').send({ email: 'setup-admin@t.local', password: 'Test123!' });
    tokenAdmin = aLogin.body.data.accessToken as string;
  }, 30000);

  afterAll(async () => {
    delete (global as any).fetch;
    await closeTestDB();
  });

  test('status reports presence only, never values', async () => {
    const res = await request(app).get('/api/admin/meta/status').set('Authorization', `Bearer ${tokenSuper}`);
    expect(res.status).toBe(200);
    expect(res.body.data.appIdSet).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('test-app-secret');
  });

  test('company admin cannot use setup helpers', async () => {
    const status = await request(app).get('/api/admin/meta/status').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(status.status).toBe(403);
    const exch = await request(app).post('/api/admin/meta/exchange').set('Authorization', `Bearer ${tokenAdmin}`).send({ shortToken: 'x' });
    expect(exch.status).toBe(403);
  });

  test('exchange swaps short token for long-lived (mocked Meta)', async () => {
    (global as any).fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ access_token: 'long-lived-abc', expires_in: 5184000, token_type: 'bearer' }),
    }));
    const res = await request(app)
      .post('/api/admin/meta/exchange')
      .set('Authorization', `Bearer ${tokenSuper}`)
      .send({ shortToken: 'short-xyz' });
    expect(res.status).toBe(200);
    expect(res.body.data.access_token).toBe('long-lived-abc');
    expect(res.body.data.expires_in).toBe(5184000);
  });

  test('exchange surfaces Meta rejection cleanly', async () => {
    (global as any).fetch = jest.fn(async () => ({
      ok: false,
      json: async () => ({ error: { message: 'Invalid token', code: 190 } }),
    }));
    const res = await request(app)
      .post('/api/admin/meta/exchange')
      .set('Authorization', `Bearer ${tokenSuper}`)
      .send({ shortToken: 'bad' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('EXCHANGE_FAILED');
  });
});

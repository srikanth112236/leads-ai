import request from 'supertest';
import { app } from '../src/app';
import { connectTestDB, clearTestDB, closeTestDB } from './setup';
import { User } from '../src/common/models/User';
import { Company } from '../src/common/models/Company';
import { MetaSyncSetting } from '../src/common/models/MetaSyncSetting';
import { hashPassword } from '../src/common/security/hash';
import { Role } from '../src/common/types';

describe('meta sync settings', () => {
  let tokenA: string;
  let tokenAgent: string;

  beforeAll(async () => {
    await connectTestDB();
    await clearTestDB();

    const companyA = await new Company({ name: 'Sync A', status: 'active' }).save();
    const password = await hashPassword('Test123!');
    await new User({ email: 'syncA@t.local', password, firstName: 'S', lastName: 'A', role: Role.COMPANY_ADMIN, companyId: companyA._id, isActive: true }).save();
    await new User({ email: 'syncAgent@t.local', password, firstName: 'S', lastName: 'G', role: Role.SALES_AGENT, companyId: companyA._id, isActive: true }).save();

    const aLogin = await request(app).post('/api/auth/login').send({ email: 'syncA@t.local', password: 'Test123!' });
    tokenA = aLogin.body.data.accessToken as string;
    const gLogin = await request(app).post('/api/auth/login').send({ email: 'syncAgent@t.local', password: 'Test123!' });
    tokenAgent = gLogin.body.data.accessToken as string;
  }, 30000);

  afterAll(async () => {
    await closeTestDB();
  });

  test('saves schedule without Redis (setting persists, scheduler best-effort)', async () => {
    const res = await request(app)
      .put('/api/meta/sync-settings')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ enabled: true, intervalMinutes: 5 });
    expect(res.status).toBe(200);
    expect(res.body.data.intervalMinutes).toBe(5);
    const stored = await MetaSyncSetting.findOne({});
    expect(stored?.enabled).toBe(true);
  });

  test('rejects out-of-range intervals', async () => {
    for (const minutes of [1, 4, 0, 1441, -5]) {
      const res = await request(app)
        .put('/api/meta/sync-settings')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ enabled: true, intervalMinutes: minutes });
      expect(res.status).toBe(400);
    }
  });

  test('settings read back saved values; agents cannot write', async () => {
    const get = await request(app).get('/api/meta/sync-settings').set('Authorization', `Bearer ${tokenA}`);
    expect(get.status).toBe(200);
    expect(get.body.data.intervalMinutes).toBe(5);

    const forbidden = await request(app)
      .put('/api/meta/sync-settings')
      .set('Authorization', `Bearer ${tokenAgent}`)
      .send({ enabled: true, intervalMinutes: 30 });
    expect(forbidden.status).toBe(403);
  });
});

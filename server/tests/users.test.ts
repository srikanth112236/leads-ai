import request from 'supertest';
import { app } from '../src/app';
import { connectTestDB, clearTestDB, closeTestDB } from './setup';
import { User } from '../src/common/models/User';
import { Company } from '../src/common/models/Company';
import { hashPassword } from '../src/common/security/hash';
import { Role } from '../src/common/types';

describe('users listing (§33)', () => {
  let tokenA: string;

  beforeAll(async () => {
    await connectTestDB();
    await clearTestDB();

    const companyA = await new Company({ name: 'Users A', status: 'active' }).save();
    const companyB = await new Company({ name: 'Users B', status: 'active' }).save();
    const password = await hashPassword('Test123!');
    await new User({ email: 'uadminA@t.local', password, firstName: 'U', lastName: 'A', role: Role.COMPANY_ADMIN, companyId: companyA._id, isActive: true }).save();
    await new User({ email: 'uadminB@t.local', password, firstName: 'U', lastName: 'B', role: Role.COMPANY_ADMIN, companyId: companyB._id, isActive: true }).save();

    const login = await request(app).post('/api/auth/login').send({ email: 'uadminA@t.local', password: 'Test123!' });
    tokenA = login.body.data.accessToken as string;
  }, 30000);

  afterAll(async () => {
    await closeTestDB();
  });

  test('lists own-company users without password hashes', async () => {
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].email).toBe('uadmina@t.local');
    expect(res.body.data[0].password).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('$2b$');
  });

  test('sales agents cannot list users', async () => {
    const loginB = await request(app).post('/api/auth/login').send({ email: 'uadminB@t.local', password: 'Test123!' });
    await new User({
      email: 'uagent@t.local',
      password: await hashPassword('Test123!'),
      firstName: 'U',
      lastName: 'G',
      role: Role.SALES_AGENT,
      companyId: loginB.body.data.user.companyId,
      isActive: true,
    }).save();
    const agentLogin = await request(app).post('/api/auth/login').send({ email: 'uagent@t.local', password: 'Test123!' });
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${agentLogin.body.data.accessToken}`);
    expect(res.status).toBe(403);
  });

  test('admin creates a lower-rank user who can log in', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ email: 'newagent@t.local', password: 'Test123!', firstName: 'N', lastName: 'A', role: Role.SALES_AGENT });
    expect(res.status).toBe(201);
    expect(res.body.data.password).toBeUndefined();
    const login = await request(app).post('/api/auth/login').send({ email: 'newagent@t.local', password: 'Test123!' });
    expect(login.status).toBe(200);
  });

  test('admin cannot create equal-or-higher-rank users', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ email: 'sneakyadmin@t.local', password: 'Test123!', firstName: 'S', lastName: 'N', role: Role.COMPANY_ADMIN });
    expect(res.status).toBe(403);
  });

  test('cross-company user update is forbidden', async () => {
    const other = await User.findOne({ email: 'uadminb@t.local' });
    const res = await request(app)
      .put(`/api/users/${other!._id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ firstName: 'Hacked' });
    expect(res.status).toBe(403);
  });

  test('self-deactivation is blocked, others deactivate softly with audit', async () => {
    const me = await User.findOne({ email: 'uadmina@t.local' });
    const selfRes = await request(app)
      .delete(`/api/users/${me!._id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(selfRes.status).toBe(403);

    const agent = await User.findOne({ email: 'newagent@t.local' });
    const res = await request(app)
      .delete(`/api/users/${agent!._id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    const updated = await User.findById(agent!._id);
    expect(updated?.isActive).toBe(false);
    const { AuditLog } = await import('../src/common/models/AuditLog');
    expect(await AuditLog.countDocuments({ action: 'USER_DEACTIVATED' })).toBeGreaterThanOrEqual(1);
  });
});

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import { app } from '../src/app';
import { connectTestDB, clearTestDB, closeTestDB } from './setup';
import { User } from '../src/common/models/User';
import { Company } from '../src/common/models/Company';
import { PasswordResetToken } from '../src/common/models/PasswordResetToken';
import { hashPassword } from '../src/common/security/hash';
import { Role } from '../src/common/types';

describe('password lifecycle (force-change + reset)', () => {
  let company: any;
  let mcpToken: string;

  beforeAll(async () => {
    await connectTestDB();
    await clearTestDB();

    company = await new Company({
      name: 'Pwd Co',
      status: 'active',
      settings: { security: { sessionTimeoutMinutes: 60, minPasswordLength: 8, requireSpecialChar: true, requireNumber: true } },
    }).save();

    const password = await hashPassword('Temp123!');
    // Simulates an admin-provisioned account (creation endpoints set the flag).
    await new User({
      email: 'newbie@pwd.local', password, firstName: 'New', lastName: 'Bie',
      role: Role.SALES_AGENT, companyId: company._id, isActive: true, mustChangePassword: true,
    }).save();
    await new User({
      email: 'regular@pwd.local', password, firstName: 'Reg', lastName: 'Ular',
      role: Role.SALES_AGENT, companyId: company._id, isActive: true, mustChangePassword: false,
    }).save();
    await new User({
      email: 'boss@pwd.local', password, firstName: 'Boss', lastName: 'Man',
      role: Role.COMPANY_ADMIN, companyId: company._id, isActive: true, mustChangePassword: false,
    }).save();
  }, 30000);

  afterAll(async () => {
    await closeTestDB();
  });

  test('first login reports mustChangePassword with rules and mcp claim', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'newbie@pwd.local', password: 'Temp123!' });
    expect(res.status).toBe(200);
    expect(res.body.data.mustChangePassword).toBe(true);
    expect(res.body.data.passwordRules.minPasswordLength).toBe(8);
    const decoded = jwt.verify(res.body.data.accessToken, process.env.JWT_SECRET || 'dev-secret') as any;
    expect(decoded.mcp).toBe(true);
    mcpToken = res.body.data.accessToken;
  });

  test('mcp-gated token is locked out of app APIs but can change password', async () => {
    const blocked = await request(app).get('/api/users').set('Authorization', `Bearer ${mcpToken}`);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${mcpToken}`);
    expect(me.status).toBe(200);
  });

  test('weak replacement password is rejected with rules', async () => {
    const res = await request(app)
      .put('/api/auth/change-password')
      .set('Authorization', `Bearer ${mcpToken}`)
      .send({ currentPassword: 'Temp123!', newPassword: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('WEAK_PASSWORD');
  });

  test('strong replacement clears the flag; re-login is clean', async () => {
    const res = await request(app)
      .put('/api/auth/change-password')
      .set('Authorization', `Bearer ${mcpToken}`)
      .send({ currentPassword: 'Temp123!', newPassword: 'Strong99!' });
    expect(res.status).toBe(200);

    const relogin = await request(app).post('/api/auth/login').send({ email: 'newbie@pwd.local', password: 'Strong99!' });
    expect(relogin.status).toBe(200);
    expect(relogin.body.data.mustChangePassword).toBe(false);
    const decoded = jwt.verify(relogin.body.data.accessToken, process.env.JWT_SECRET || 'dev-secret') as any;
    expect(decoded.mcp).toBeUndefined();

    // Clean token is no longer gated by the password-change lock
    // (a 403 here would be RBAC, never PASSWORD_CHANGE_REQUIRED).
    const ok = await request(app).get('/api/users').set('Authorization', `Bearer ${relogin.body.data.accessToken}`);
    expect(ok.body.code).not.toBe('PASSWORD_CHANGE_REQUIRED');
  });

  test('forgot-password never enumerates; reset token works once then expires', async () => {
    const ghost = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@pwd.local' });
    expect(ghost.status).toBe(200);

    const raw = 'raw-reset-token-123';
    const user = await User.findOne({ email: 'regular@pwd.local' });
    await PasswordResetToken.create({
      userId: user!._id,
      tokenHash: createHash('sha256').update(raw).digest('hex'),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });

    const reset = await request(app).post('/api/auth/reset-password').send({ token: raw, newPassword: 'Fresh99!' });
    expect(reset.status).toBe(200);

    const reuse = await request(app).post('/api/auth/reset-password').send({ token: raw, newPassword: 'Fresh99!' });
    expect(reuse.status).toBe(400);
    expect(reuse.body.code).toBe('INVALID_TOKEN');

    const login = await request(app).post('/api/auth/login').send({ email: 'regular@pwd.local', password: 'Fresh99!' });
    expect(login.status).toBe(200);

    const stale = await PasswordResetToken.create({
      userId: user!._id,
      tokenHash: createHash('sha256').update('stale-token').digest('hex'),
      expiresAt: new Date(Date.now() - 1000),
    });
    void stale;
    const expired = await request(app).post('/api/auth/reset-password').send({ token: 'stale-token', newPassword: 'Fresh99!' });
    expect(expired.status).toBe(400);
  });

  test('admin-provisioned users must change password on first login', async () => {
    const adminLogin = await request(app).post('/api/auth/login').send({ email: 'boss@pwd.local', password: 'Temp123!' });
    expect(adminLogin.status).toBe(200);
    const created = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminLogin.body.data.accessToken}`)
      .send({
        email: 'provisioned@pwd.local', password: 'Temp123!', firstName: 'Pro', lastName: 'Visioned',
        role: Role.SALES_AGENT,
      });
    expect(created.status).toBe(201);
    const firstLogin = await request(app).post('/api/auth/login').send({ email: 'provisioned@pwd.local', password: 'Temp123!' });
    expect(firstLogin.status).toBe(200);
    expect(firstLogin.body.data.mustChangePassword).toBe(true);
  });

  test('self-registration does not force a password change', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'selfreg@pwd.local', password: 'Self99!!', firstName: 'Self', lastName: 'Reg',
    });
    expect(res.status).toBe(201);
    const login = await request(app).post('/api/auth/login').send({ email: 'selfreg@pwd.local', password: 'Self99!!' });
    expect(login.body.data.mustChangePassword).toBe(false);
  });
});

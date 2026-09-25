import request from 'supertest';
import { app } from '../src/app';
import { connectTestDB, clearTestDB, closeTestDB } from './setup';
import { User } from '../src/common/models/User';
import { Company } from '../src/common/models/Company';
import { Branch } from '../src/common/models/Branch';
import { CompanyMembership } from '../src/common/models/CompanyMembership';
import { UserSession } from '../src/common/models/UserSession';
import { Notification } from '../src/common/models/Notification';
import { hashPassword } from '../src/common/security/hash';
import { Role } from '../src/common/types';
import { LoginPolicyService, ACCESS_VALIDITY_DAYS } from '../src/modules/auth/login-policy.service';

const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';

describe('tiered access control (branch web+mobile, company x3, 90-day windows)', () => {
  let company: any;
  let branch1: any;
  let adminToken: string;
  const password = 'Password123!';

  const loginAs = (email: string, deviceId: string, ua?: string) => {
    const r = request(app).post('/api/auth/login').send({ email, password, deviceId, deviceName: deviceId });
    return ua ? r.set('User-Agent', ua) : r;
  };

  // Stable admin credential per test (reuses the adm-1 slot, never parks).
  const freshAdminToken = async () => {
    const res = await loginAs('access-admin@local', 'adm-1');
    expect(res.status).toBe(200);
    return res.body.data.accessToken as string;
  };

  beforeAll(async () => {
    await connectTestDB();
    await clearTestDB();

    company = await new Company({ name: 'Access Co', status: 'active' }).save();
    branch1 = await new Branch({ companyId: company._id, name: 'Main HQ', status: 'active' }).save();
    await new Branch({ companyId: company._id, name: 'Outlet', status: 'active' }).save();

    const hashed = await hashPassword(password);
    const mk = async (email: string, role: string, branchIds: string[] = []) => {
      const u = await new User({
        email, password: hashed, firstName: email.split('@')[0], lastName: 'T',
        role, companyId: company._id, isActive: true, mustChangePassword: false,
      }).save();
      if (branchIds.length > 0) {
        await CompanyMembership.create({ userId: u._id, companyId: company._id, role, branchIds, isActive: true });
      }
      return u;
    };
    await mk('access-admin@local', Role.COMPANY_ADMIN, [branch1._id.toString()]);
    await mk('access-agent@local', Role.SALES_AGENT, [branch1._id.toString()]);

    const login = await request(app).post('/api/auth/login').send({ email: 'access-admin@local', password, deviceId: 'admin-dev' });
    expect(login.status).toBe(200);
    adminToken = login.body.data.accessToken;
  }, 30000);

  afterAll(async () => {
    await closeTestDB();
  });

  test('backfill marks the oldest branch default and grants access windows', async () => {
    const fixed = await LoginPolicyService.backfillDefaults();
    expect(fixed).toBeGreaterThanOrEqual(1);
    const def = await Branch.findOne({ companyId: company._id, isDefault: true }).lean();
    expect(def!.name).toBe('Main HQ');
    const backfilled = await LoginPolicyService.backfillAccessWindows();
    expect(backfilled).toBeGreaterThanOrEqual(2);
    const agent = await User.findOne({ email: 'access-agent@local' }).lean();
    expect(new Date(agent!.accessExpiresAt!).getTime()).toBeGreaterThan(Date.now());
  });

  test('backfill marks exactly one (oldest) default per company', async () => {
    const fresh = await new Company({ name: 'Fresh Co', status: 'active' }).save();
    const first = await Branch.create({ companyId: fresh._id, name: 'Fresh One', status: 'active' });
    await Branch.create({ companyId: fresh._id, name: 'Fresh Two', status: 'active' });
    await LoginPolicyService.backfillDefaults();
    const marked = await Branch.find({ companyId: fresh._id, isDefault: true }).lean();
    expect(marked.length).toBe(1);
    expect(marked[0]._id.toString()).toBe(first._id.toString());
  });

  test('branch transfer moves the default flag', async () => {
    const one = await Branch.findOne({ companyId: company._id, name: 'Main HQ' });
    const two = await Branch.findOne({ companyId: company._id, name: 'Outlet' });
    const res = await request(app)
      .put(`/api/branches/${two!._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isDefault: true });
    expect(res.status).toBe(200);
    expect(await Branch.countDocuments({ companyId: company._id, isDefault: true })).toBe(1);
    expect(String((await Branch.findById(two!._id).lean())!.isDefault)).toBe('true');
    // Restore for other tests.
    await request(app).put(`/api/branches/${one!._id}`).set('Authorization', `Bearer ${adminToken}`).send({ isDefault: true });
  });

  test('branch tier: 1 web + 1 mobile, second web reports cap then parks on request', async () => {
    const w1 = await loginAs('access-agent@local', 'agent-web-1');
    expect(w1.status).toBe(200);
    const m1 = await loginAs('access-agent@local', 'agent-mob-1', MOBILE_UA);
    expect(m1.status).toBe(200);

    // Step 1: cap message with admin contacts, no pending row yet.
    const w2 = await loginAs('access-agent@local', 'agent-web-2');
    expect(w2.status).toBe(403);
    expect(w2.body.code).toBe('DEVICE_CAP_REACHED');
    expect(w2.body.data.tier).toBe('branch');
    expect(w2.body.data.maxDevices).toBe(2);
    expect(w2.body.error).toMatch(/already signed in|1 web \+ 1 mobile/i);
    expect(Array.isArray(w2.body.data.approvers)).toBe(true);
    expect(w2.body.data.approvers.some((a: any) => a.email === 'access-admin@local')).toBe(true);
    const agent = await User.findOne({ email: 'access-agent@local' });
    expect(await UserSession.countDocuments({ userId: agent!._id, status: 'pending' })).toBe(0);

    // Step 2: explicit request parks and becomes pollable.
    const w2req = await request(app).post('/api/auth/login').send({
      email: 'access-agent@local', password, deviceId: 'agent-web-2', deviceName: 'agent-web-2', requestApproval: true,
    });
    expect(w2req.status).toBe(403);
    expect(w2req.body.code).toBe('DEVICE_APPROVAL_REQUIRED');
    expect(w2req.body.data.sessionId).toBeTruthy();
  });

  test('company tier: 3 of any kind, 4th parks', async () => {
    const admin = await User.findOne({ email: 'access-admin@local' });
    await UserSession.deleteMany({ userId: admin!._id });
    expect((await loginAs('access-admin@local', 'adm-1')).status).toBe(200);
    expect((await loginAs('access-admin@local', 'adm-2')).status).toBe(200);
    expect((await loginAs('access-admin@local', 'adm-3')).status).toBe(200);
    const fourth = await loginAs('access-admin@local', 'adm-4');
    expect(fourth.status).toBe(403);
    expect(fourth.body.code).toBe('DEVICE_CAP_REACHED');
    expect(fourth.body.data.tier).toBe('company');
    expect(fourth.body.data.maxDevices).toBe(3);
  });

  test('default admin can approve a branch user request (cross-user, same company)', async () => {
    const agent = await User.findOne({ email: 'access-agent@local' });
    const pending = await UserSession.findOne({ userId: agent!._id, deviceId: 'agent-web-2', status: 'pending' });
    expect(pending).not.toBeNull();
    const allow = await request(app)
      .post(`/api/auth/sessions/${pending!._id}/allow`)
      .set('Authorization', `Bearer ${await freshAdminToken()}`);
    expect(allow.status).toBe(200);
    const decided = await UserSession.findById(pending!._id).lean();
    expect(String(decided!.decidedBy)).toBeTruthy();
    expect(decided!.decidedAt).toBeTruthy();
  });

  test('login requests page lists raised/approved with details, scoped', async () => {
    const res = await request(app).get('/api/auth/login-requests').set('Authorization', `Bearer ${await freshAdminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    const approved = res.body.data.find((r: any) => r.status === 'active' && r.decidedBy);
    expect(approved).toBeTruthy();
    expect(approved.user.email).toBe('access-agent@local');
  });

  test('security overview shows slot usage and access windows', async () => {
    const res = await request(app).get('/api/auth/security/overview').set('Authorization', `Bearer ${await freshAdminToken()}`);
    expect(res.status).toBe(200);
    const agent = res.body.data.users.find((u: any) => u.email === 'access-agent@local');
    expect(agent.tier).toBe('branch');
    expect(agent.slotsMax).toBe(2);
    expect(agent.activeCount).toBeGreaterThan(0);
    expect(agent.accessDaysLeft).toBeGreaterThan(80);
    expect(Array.isArray(res.body.data.recent)).toBe(true);
  });

  test('expired access blocks login; super admin exempt', async () => {
    await User.updateOne({ email: 'access-agent@local' }, { $set: { accessExpiresAt: new Date(Date.now() - 1000) } });
    const blocked = await loginAs('access-agent@local', 'agent-web-9');
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('ACCESS_EXPIRED');
  });

  test('approval request notifies default admin with a Notification row', async () => {
    const agent = await User.findOne({ email: 'access-agent@local' });
    await User.updateOne({ _id: agent!._id }, { $set: { accessExpiresAt: new Date(Date.now() + 86400000) } });
    await UserSession.deleteMany({ userId: agent!._id });
    await Notification.deleteMany({ type: 'login_approval_request' });
    await loginAs('access-agent@local', 'agent-web-1');
    await loginAs('access-agent@local', 'agent-mob-1', MOBILE_UA);
    const req2 = await request(app).post('/api/auth/login').send({
      email: 'access-agent@local', password, deviceId: 'agent-web-2', deviceName: 'w2', requestApproval: true,
    });
    expect(req2.status).toBe(403);
    const notes = await Notification.find({ type: 'login_approval_request' }).lean();
    expect(notes.length).toBeGreaterThan(0);
    const admin = await User.findOne({ email: 'access-admin@local' });
    expect(notes.some((n: any) => String(n.userId) === String(admin!._id))).toBe(true);
    expect(notes[0].body).toMatch(/allow or deny/i);
  });

  test('extend access requires logins:approve (agents cannot extend)', async () => {
    await User.updateOne({ email: 'access-agent@local' }, { $set: { accessExpiresAt: new Date(Date.now() + 86400000) } });
    const agentLogin = await loginAs('access-agent@local', 'agent-web-1');
    const agent = await User.findOne({ email: 'access-agent@local' });
    const res = await request(app)
      .post(`/api/auth/users/${agent!._id}/extend-access`)
      .set('Authorization', `Bearer ${agentLogin.body.data.accessToken}`);
    expect(res.status).toBe(403);
  });

  test('branch approver sees only own-branch requests', async () => {
    const hashed = await hashPassword(password);
    const mgr = await new User({
      email: 'access-bm@local', password: hashed, firstName: 'Bm', lastName: 'T',
      role: Role.BRANCH_MANAGER, companyId: company._id, isActive: true, mustChangePassword: false,
    }).save();
    const b1 = await Branch.findOne({ companyId: company._id, name: 'Main HQ' });
    await CompanyMembership.create({ userId: mgr._id, companyId: company._id, role: Role.BRANCH_MANAGER, branchIds: [b1!._id.toString()], isActive: true });
    const mgrLogin = await request(app).post('/api/auth/login').send({ email: 'access-bm@local', password, deviceId: 'bm-dev' });
    expect(mgrLogin.status).toBe(200);
    const res = await request(app)
      .get('/api/auth/login-requests')
      .set('Authorization', `Bearer ${mgrLogin.body.data.accessToken}`);
    expect(res.status).toBe(200);
    // Rows belong to branch-1 members only – never to admins outside branches.
    const agent = await User.findOne({ email: 'access-agent@local' });
    const mgrUser = await User.findOne({ email: 'access-bm@local' });
    const allowed = new Set([String(agent!._id), String(mgrUser!._id)]);
    expect(res.body.data.length).toBeGreaterThan(0);
    for (const r of res.body.data) {
      expect(allowed.has(String(r.user.id))).toBe(true);
    }
  });

  test('extend access stamps sessions, notifies, and forces stale re-login after grace', async () => {
    // Restore access first so extend has something to extend.
    await User.updateOne({ email: 'access-agent@local' }, { $set: { accessExpiresAt: new Date(Date.now() + 86400000) } });
    const ext = await request(app)
      .post(`/api/auth/users/${(await User.findOne({ email: 'access-agent@local' }))!._id}/extend-access`)
      .set('Authorization', `Bearer ${await freshAdminToken()}`);
    expect(ext.status).toBe(200);
    const daysLeft = (new Date(ext.body.data.accessExpiresAt).getTime() - Date.now()) / 86400000;
    expect(daysLeft).toBeGreaterThan(ACCESS_VALIDITY_DAYS - 2);

    const notes = await Notification.find({ type: 'access_extended' }).lean();
    expect(notes.length).toBeGreaterThan(0);

    // Simulate a stale session past its grace: forced logout with ACCESS_UPDATED.
    const agent = await User.findOne({ email: 'access-agent@local' });
    const stale = await UserSession.create({
      userId: agent!._id, deviceId: 'stale-dev', status: 'active',
      expiresAt: new Date(Date.now() + 86400000),
    });
    // Extension stamped after the session started, grace already lapsed.
    await UserSession.updateOne(
      { _id: stale._id },
      {
        $set: {
          accessExtendedAt: new Date(Date.now() + 3600000),
          reauthDeadline: new Date(Date.now() - 1000),
        },
      },
    );
    const { generateTokens } = await import('../src/common/security/jwt');
    const { accessToken } = generateTokens(agent!._id.toString(), Role.SALES_AGENT, company._id.toString(), undefined, [], [], {}, stale._id.toString());
    const forced = await request(app).get('/api/auth/sessions').set('Authorization', `Bearer ${accessToken}`);
    expect(forced.status).toBe(401);
    expect(forced.body.code).toBe('ACCESS_UPDATED');
  });
});

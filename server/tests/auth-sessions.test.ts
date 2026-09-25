import request from 'supertest';
import { app } from '../src/app';
import { connectTestDB, clearTestDB, closeTestDB } from './setup';
import { User } from '../src/common/models/User';
import { Company } from '../src/common/models/Company';
import { UserSession } from '../src/common/models/UserSession';
import { TrustedDevice } from '../src/common/models/TrustedDevice';
import { RealtimeService } from '../src/modules/realtime/realtime.service';
import { hashPassword } from '../src/common/security/hash';
import { Role } from '../src/common/types';

describe('concurrent device sessions (max 3 + approval)', () => {
  let company: any;
  const email = 'devuser@sess.local';
  const password = 'Password123!';

  const loginAs = (deviceId: string, deviceName?: string) =>
    request(app).post('/api/auth/login').send({ email, password, deviceId, deviceName });

  beforeAll(async () => {
    await connectTestDB();
    await clearTestDB();

    company = await new Company({ name: 'Sess Co', status: 'active' }).save();
    // Company tier (flat 3) – branch-tier web/mobile caps are covered in auth-access.test.ts.
    await new User({
      email, password: await hashPassword(password), firstName: 'Dev', lastName: 'User',
      role: Role.COMPANY_ADMIN, companyId: company._id, isActive: true, mustChangePassword: false,
    }).save();
  }, 30000);

  afterAll(async () => {
    await closeTestDB();
  });

  test('first login creates an active session visible in the list', async () => {
    const res = await loginAs('device-A', 'Chrome on Windows');
    expect(res.status).toBe(200);
    const list = await request(app).get('/api/auth/sessions').set('Authorization', `Bearer ${res.body.data.accessToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBe(1);
    expect(list.body.data[0].deviceId).toBe('device-A');
    expect(list.body.data[0].current).toBe(true);
  });

  test('same-device re-login reuses its session (no slot leak)', async () => {
    await loginAs('device-B');
    await loginAs('device-C');
    const again = await loginAs('device-A');
    expect(again.status).toBe(200);
    const user = await User.findOne({ email });
    const count = await UserSession.countDocuments({ userId: user!._id, status: 'active' });
    expect(count).toBe(3);
  });

  test('over-cap login first reports the cap, then parks on explicit request', async () => {
    // Step 1: plain login attempt → cap message, approvers, no pending row yet.
    const capped = await loginAs('device-D', 'Safari on iPhone');
    expect(capped.status).toBe(403);
    expect(capped.body.code).toBe('DEVICE_CAP_REACHED');
    expect(capped.body.data.sessionId).toBeUndefined();
    expect(capped.body.error).toMatch(/already signed in|already uses/i);
    const user = await User.findOne({ email });
    expect(await UserSession.countDocuments({ userId: user!._id, status: 'pending' })).toBe(0);

    // Step 2: explicit approval request → pending + pollable.
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password, deviceId: 'device-D', deviceName: 'Safari on iPhone', requestApproval: true });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DEVICE_APPROVAL_REQUIRED');
    expect(res.body.data.sessionId).toBeTruthy();
    expect(res.body.data.maxDevices).toBe(3);
    expect(res.body.data.devices.length).toBe(3);

    const poll = await request(app).get(`/api/auth/sessions/pending/${res.body.data.sessionId}`);
    expect(poll.status).toBe(200);
    expect(poll.body.data.status).toBe('pending');
  });

  test('owner approval logs the device in and keeps the cap at 3', async () => {
    const owner = await loginAs('device-A');
    const ownerToken = owner.body.data.accessToken;

    const pending = await UserSession.findOne({ deviceId: 'device-D', status: 'pending' });
    const allow = await request(app)
      .post(`/api/auth/sessions/${pending!._id}/allow`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(allow.status).toBe(200);

    const poll = await request(app).get(`/api/auth/sessions/pending/${pending!._id}`);
    expect(poll.body.data.status).toBe('active');
    expect(poll.body.data.accessToken).toBeTruthy();

    const user = await User.findOne({ email });
    expect(await UserSession.countDocuments({ userId: user!._id, status: 'active' })).toBe(3);
    // Least-recently-seen device was evicted (device-B or C, never the approver or newcomer).
    const actives = await UserSession.find({ userId: user!._id, status: 'active' }).select('deviceId').lean();
    const ids = actives.map((a) => a.deviceId);
    expect(ids).toContain('device-A');
    expect(ids).toContain('device-D');
  });

  test('deny blocks the login and strangers cannot approve', async () => {
    // All 3 slots are taken (A, D + survivor of B/C) so device-E must park.
    const owner = await loginAs('device-A');
    const capped = await loginAs('device-E', 'Firefox on Linux');
    expect(capped.status).toBe(403);
    expect(capped.body.code).toBe('DEVICE_CAP_REACHED');
    const parked = await request(app).post('/api/auth/login').send({
      email, password, deviceId: 'device-E', deviceName: 'Firefox on Linux', requestApproval: true,
    });
    expect(parked.status).toBe(403);
    expect(parked.body.code).toBe('DEVICE_APPROVAL_REQUIRED');
    const sessionId = parked.body.data.sessionId;

    const otherCompany = await new Company({ name: 'Sess Other', status: 'active' }).save();
    await new User({
      email: 'stranger@sess.local', password: await hashPassword(password), firstName: 'S', lastName: 'T',
      role: Role.SALES_AGENT, companyId: otherCompany._id, isActive: true, mustChangePassword: false,
    }).save();
    const stranger = await request(app).post('/api/auth/login').send({ email: 'stranger@sess.local', password, deviceId: 'device-X' });
    const forbidden = await request(app)
      .post(`/api/auth/sessions/${sessionId}/allow`)
      .set('Authorization', `Bearer ${stranger.body.data.accessToken}`);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');

    const deny = await request(app)
      .post(`/api/auth/sessions/${sessionId}/deny`)
      .set('Authorization', `Bearer ${owner.body.data.accessToken}`);
    expect(deny.status).toBe(200);
    const poll = await request(app).get(`/api/auth/sessions/pending/${sessionId}`);
    expect(poll.body.data.status).toBe('denied');
  });

  test('expired pending requests cannot be approved', async () => {
    const user = await User.findOne({ email });
    const stale = await UserSession.create({
      userId: user!._id, deviceId: 'device-stale', status: 'pending',
      expiresAt: new Date(Date.now() - 1000),
    });
    const owner = await loginAs('device-A');
    const res = await request(app)
      .post(`/api/auth/sessions/${stale._id}/allow`)
      .set('Authorization', `Bearer ${owner.body.data.accessToken}`);
    expect(res.status).toBe(410);
    expect(res.body.code).toBe('REQUEST_EXPIRED');
  });

  test('pending approvals inbox lists requests with account details', async () => {
    const user = await User.findOne({ email });
    await UserSession.deleteMany({ userId: user!._id });
    await TrustedDevice.deleteMany({ userId: user!._id });
    await loginAs('device-A');
    await loginAs('device-B');
    await loginAs('device-C');
    const parked = await request(app).post('/api/auth/login').send({
      email, password, deviceId: 'device-D', deviceName: 'Edge on macOS', requestApproval: true,
    });
    expect(parked.status).toBe(403);
    expect(parked.body.code).toBe('DEVICE_APPROVAL_REQUIRED');

    const owner = await loginAs('device-A');
    const inbox = await request(app)
      .get('/api/auth/sessions/pending')
      .set('Authorization', `Bearer ${owner.body.data.accessToken}`);
    expect(inbox.status).toBe(200);
    expect(inbox.body.data.length).toBe(1);
    expect(inbox.body.data[0].accountEmail).toBe(email);
    expect(inbox.body.data[0].deviceName).toBe('Edge on macOS');
  });

  test('trusted device skips approval; trust lasts 90 days and is revocable', async () => {
    const user = await User.findOne({ email });
    await UserSession.deleteMany({ userId: user!._id });
    await TrustedDevice.deleteMany({ userId: user!._id });

    const owner = await loginAs('device-A');
    const ownerToken = owner.body.data.accessToken;
    await loginAs('device-B');
    await loginAs('device-C');
    const parked = await request(app).post('/api/auth/login').send({
      email, password, deviceId: 'device-D', deviceName: 'Trusted Browser', requestApproval: true,
    });
    expect(parked.status).toBe(403);
    expect(parked.body.code).toBe('DEVICE_APPROVAL_REQUIRED');
    const pendingId = parked.body.data.sessionId;

    const trust = await request(app)
      .post(`/api/auth/sessions/${pendingId}/trust`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(trust.status).toBe(200);
    expect(trust.body.data.trustedUntil).toBeTruthy();

    const row = await TrustedDevice.findOne({ userId: user!._id, deviceId: 'device-D' }).lean();
    expect(row).not.toBeNull();
    const daysLeft = (new Date(row!.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(daysLeft).toBeGreaterThan(89);
    expect(daysLeft).toBeLessThan(91);

    // Approval may have evicted the owner's own session (LRU) – re-establish.
    await UserSession.deleteMany({ userId: user!._id });
    const owner2 = await loginAs('device-A');
    expect(owner2.status).toBe(200);
    const listed = await request(app)
      .get('/api/auth/trusted-devices')
      .set('Authorization', `Bearer ${owner2.body.data.accessToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body.data.length).toBe(1);

    // Trusted browser logs straight in on a fresh slate.
    await UserSession.deleteMany({ userId: user!._id });
    const straight = await loginAs('device-D');
    expect(straight.status).toBe(200);

    // Untrusted browsers still hit the cap (message first, approval on request).
    await loginAs('device-A');
    await loginAs('device-B');
    const capped = await loginAs('device-C');
    expect(capped.status).toBe(403);
    expect(capped.body.code).toBe('DEVICE_CAP_REACHED');
    const cappedReq = await request(app).post('/api/auth/login').send({
      email, password, deviceId: 'device-C', deviceName: 'device-C', requestApproval: true,
    });
    expect(cappedReq.status).toBe(403);
    expect(cappedReq.body.code).toBe('DEVICE_APPROVAL_REQUIRED');

    // Expired trust behaves like no trust: approval required again.
    await TrustedDevice.updateOne(
      { userId: user!._id, deviceId: 'device-D' },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    await UserSession.deleteMany({ userId: user!._id });
    await loginAs('device-A');
    await loginAs('device-B');
    await loginAs('device-C');
    const parkedAgain = await loginAs('device-D');
    expect(parkedAgain.status).toBe(403);
    expect(parkedAgain.body.code).toBe('DEVICE_CAP_REACHED');

    // Revoking trust removes the row (device-A still holds a live session).
    const ownerAgain = await loginAs('device-A');
    expect(ownerAgain.status).toBe(200);
    const gone = await request(app)
      .delete('/api/auth/trusted-devices/device-D')
      .set('Authorization', `Bearer ${ownerAgain.body.data.accessToken}`);
    expect(gone.status).toBe(200);
    expect(await TrustedDevice.countDocuments({ userId: user!._id, deviceId: 'device-D' })).toBe(0);
  }, 30000);

  test('notifyUser pushes only to the target user connections', () => {
    const writesA: string[] = [];
    const writesB: string[] = [];
    RealtimeService.registerClient('c-a', { write: (s: string) => writesA.push(s) } as any, 'co', 'user-A');
    RealtimeService.registerClient('c-b', { write: (s: string) => writesB.push(s) } as any, 'co', 'user-B');
    const sent = RealtimeService.notifyUser('user-A', { type: 'SESSION_APPROVAL_REQUESTED', payload: { sessionId: 's1' } });
    expect(sent).toBe(1);
    // Each connection first receives the CONNECTED greeting, then the event.
    expect(writesA.length).toBe(2);
    expect(writesA[1]).toContain('SESSION_APPROVAL_REQUESTED');
    expect(writesB.length).toBe(1);
    expect(RealtimeService.notifyUser('nobody', { type: 'SESSION_APPROVAL_REQUESTED', payload: {} })).toBe(0);
    RealtimeService.removeClient('c-a');
    RealtimeService.removeClient('c-b');
  });

  test('revoked sessions stop working immediately; revoke-others keeps current', async () => {
    const user = await User.findOne({ email });
    await UserSession.deleteMany({ userId: user!._id });
    const a = await loginAs('device-A');
    await loginAs('device-B');
    const list = await request(app).get('/api/auth/sessions').set('Authorization', `Bearer ${a.body.data.accessToken}`);
    const other = list.body.data.find((s: any) => !s.current);
    expect(other).toBeTruthy();

    // Revoke one other session directly and prove its token dies.
    const otherLogin = await loginAs(other.deviceId);
    const otherToken = otherLogin.body.data.accessToken;
    await request(app).delete(`/api/auth/sessions/${other._id}`).set('Authorization', `Bearer ${a.body.data.accessToken}`);
    const dead = await request(app).get('/api/auth/sessions').set('Authorization', `Bearer ${otherToken}`);
    expect(dead.status).toBe(401);
    expect(dead.body.code).toBe('SESSION_REVOKED');

    // Revoke-others keeps only the caller.
    const me = await loginAs('device-A');
    const wiped = await request(app).delete('/api/auth/sessions/others').set('Authorization', `Bearer ${me.body.data.accessToken}`);
    expect(wiped.status).toBe(200);
    const remaining = await request(app).get('/api/auth/sessions').set('Authorization', `Bearer ${me.body.data.accessToken}`);
    expect(remaining.body.data.length).toBe(1);
    expect(remaining.body.data[0].current).toBe(true);
  });
});

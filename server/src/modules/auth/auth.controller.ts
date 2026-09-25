import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'crypto';
import { User } from '../../common/models/User';
import { CompanyMembership } from '../../common/models/CompanyMembership';
import { BranchMembership } from '../../common/models/BranchMembership';
import { PasswordResetToken } from '../../common/models/PasswordResetToken';
import { generateTokens } from '../../common/security/jwt';
import { hashPassword, comparePassword } from '../../common/security/hash';
import { getPasswordRules, validatePassword } from '../../common/security/passwordRules';
import { Role } from '../../common/types';
import { BaseController } from '../../common/controllers/BaseController';
import { RbacService } from '../../common/services/RbacService';
import { AuthRequest } from '../../common/middleware/auth';
import { logger } from '../../common/utils/logger';

export class AuthController extends BaseController {
  static async resolveAllowedBranchIds(userId: string): Promise<string[]> {
    const [companyMemberships, branchMemberships, userDoc] = await Promise.all([
      CompanyMembership.find({ userId, isActive: true }).lean(),
      BranchMembership.find({ userId, isActive: true }).lean(),
      User.findById(userId).select('branchId').lean(),
    ]);
    const ids = new Set<string>();
    if (userDoc?.branchId) ids.add(userDoc.branchId.toString());
    for (const m of companyMemberships) {
      for (const b of (m.branchIds || [])) ids.add(b.toString());
    }
    for (const m of branchMemberships) ids.add(m.branchId.toString());
    return [...ids];
  }

  static async resolveUserBranches(role: Role, companyId?: string, allowedBranchIds: string[] = []): Promise<any[]> {
    const { Branch } = await import('../../common/models/Branch');
    if (role === Role.SUPER_ADMIN) {
      return Branch.find({ status: 'active' }).select('name branchCode location companyId').sort({ name: 1 }).lean();
    }
    if (role === Role.COMPANY_ADMIN || role === Role.COMPANY_MANAGER) {
      return Branch.find({ companyId, status: 'active' }).select('name branchCode location companyId').sort({ name: 1 }).lean();
    }
    return Branch.find({ _id: { $in: allowedBranchIds }, status: 'active' }).select('name branchCode location companyId').sort({ name: 1 }).lean();
  }

  static async register(req: Request, res: Response): Promise<void> {
    try {
      // Public registration is deliberately unprivileged: role and tenant come
      // only from an administrator afterwards. Never trust them from the body.
      const { email, password, firstName, lastName } = req.body;
      const role = Role.SALES_AGENT;
      const existing = await User.findOne({ email });
      if (existing) {
        res.status(409).json({ error: 'User already exists', code: 'USER_EXISTS' });
        return;
      }
      const hashedPassword = await hashPassword(password);
      // Self-registered users chose their own password – no forced change.
      const user = new User({ email, password: hashedPassword, firstName, lastName, role, isActive: true, mustChangePassword: false });
      await user.save();
      const { UserSession } = await import('../../common/models/UserSession');
      const meta = AuthController.sessionMeta(req);
      const regSession = await UserSession.create({
        userId: user._id.toString(),
        deviceId: meta.deviceId,
        deviceName: meta.deviceName,
        ip: meta.ip,
        userAgent: meta.userAgent,
        status: 'active',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      const { accessToken, refreshToken } = generateTokens(user._id.toString(), user.role, user.companyId, user.branchId, [], [], {}, regSession._id.toString());
      res.status(201).json({ success: true, data: { user: { id: user._id, email, firstName, lastName, role }, accessToken, refreshToken } });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'REGISTRATION_ERROR' });
    }
  }

  /** Shared login payload (initial login + approval-poll completion). */
  static async buildLoginPayload(user: any, sessionId?: string) {
    const allowedBranchIds = await AuthController.resolveAllowedBranchIds(user._id.toString());
    const branches = await AuthController.resolveUserBranches(user.role as Role, user.companyId?.toString(), allowedBranchIds);
    const permissions = await RbacService.getEffectivePermissions(user);
    const mustChangePassword = (user as any).mustChangePassword === true;
    const passwordRules = await getPasswordRules(user.companyId?.toString());
    const { accessDaysLeft } = await import('./login-policy.service');
    const { accessToken, refreshToken } = generateTokens(
      user._id.toString(),
      user.role,
      user.companyId,
      user.branchId,
      allowedBranchIds,
      permissions,
      mustChangePassword ? { mcp: true } : {},
      sessionId
    );
    return {
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        roleId: (user as any).roleId,
        permissions,
        companyId: user.companyId,
        branchId: user.branchId,
        allowedBranchIds,
        branches,
        mustChangePassword,
        accessExpiresAt: (user as any).accessExpiresAt || null,
        accessDaysLeft: accessDaysLeft((user as any).accessExpiresAt),
      },
      passwordRules,
      mustChangePassword,
      accessToken,
      refreshToken,
    };
  }

  static sessionMeta(req: Request): { deviceId: string; deviceName?: string; ip?: string; userAgent?: string } {
    const deviceId = String((req.body as any)?.deviceId || (req.query as any)?.deviceId || 'unknown').slice(0, 128);
    const deviceName = (req.body as any)?.deviceName ? String((req.body as any).deviceName).slice(0, 160) : undefined;
    return { deviceId, deviceName, ip: req.ip, userAgent: req.headers['user-agent'] };
  }

  static async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;
      const user = await User.findOne({ email }).select('+password');
      if (!user || !user.isActive) {
        res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
        return;
      }
      const valid = await comparePassword(password, user.password);
      if (!valid) {
        res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
        return;
      }
      // Expired account access blocks login for everyone except super admins.
      const accessExp = (user as any).accessExpiresAt ? new Date((user as any).accessExpiresAt).getTime() : null;
      if (accessExp !== null && accessExp <= Date.now() && user.role !== Role.SUPER_ADMIN && user.role !== 'SUPER_ADMIN') {
        res.status(403).json({
          error: 'Your access has expired. Please contact your administrator to extend it.',
          code: 'ACCESS_EXPIRED',
        });
        return;
      }
      user.lastLoginAt = new Date();
      await user.save();

      // ---- Tiered concurrent-device control ----
      // Company tier: 3 devices of any kind. Branch tier (any role):
      // 1 web + 1 mobile. Same device re-login reuses its slot.
      const { UserSession, PENDING_SESSION_TTL_SECONDS } = await import('../../common/models/UserSession');
      const { TrustedDevice } = await import('../../common/models/TrustedDevice');
      const { RealtimeService } = await import('../realtime/realtime.service');
      const { Notification } = await import('../../common/models/Notification');
      const {
        detectDeviceKind,
        isBranchTier,
        COMPANY_TIER_MAX,
        BRANCH_TIER_MAX_PER_KIND,
      } = await import('./login-policy.service');
      const meta = AuthController.sessionMeta(req);
      const loginUserId = user._id.toString();
      const deviceKind = detectDeviceKind(meta.userAgent);
      const branchTier = isBranchTier(user.role as string);

      // Trusted devices (90-day trust) skip the approval popup entirely.
      const trustedDevice = await TrustedDevice.findOne({
        userId: loginUserId,
        deviceId: meta.deviceId,
        expiresAt: { $gt: new Date() },
      }).lean();

      // Same-device re-login reuses its live session (no slot leak).
      let session = await UserSession.findOne({ userId: loginUserId, deviceId: meta.deviceId, status: 'active' });
      if (session && session.deviceKind !== deviceKind) {
        session.deviceKind = deviceKind;
      }
      const activeFilter: Record<string, unknown> = { userId: loginUserId, status: 'active' };
      if (branchTier && !session) (activeFilter as any).deviceKind = deviceKind;
      const slotTaken = !session && (await UserSession.countDocuments(activeFilter)) >= (branchTier ? BRANCH_TIER_MAX_PER_KIND : COMPANY_TIER_MAX);

      const evictOldest = async () => {
        const oldest = await UserSession.findOne({ userId: loginUserId, status: 'active' }).sort({ lastSeenAt: 1 });
        if (oldest) {
          oldest.status = 'revoked';
          await oldest.save();
        }
      };

      if (!session) {
        if (slotTaken && trustedDevice) {
          // Trusted device silently takes the oldest slot (cap always holds).
          await evictOldest();
        }
        if (slotTaken && !trustedDevice) {
          const actives = await UserSession.find({ userId: loginUserId, status: 'active' })
            .select('deviceId deviceName deviceKind ip lastSeenAt createdAt')
            .sort({ lastSeenAt: -1 })
            .lean();
          const { LoginPolicyService } = await import('./login-policy.service');
          const approvers = user.companyId
            ? await LoginPolicyService.resolveApprovers(user.companyId.toString())
            : [];
          const approverContacts = approvers
            .filter((a) => String(a.userId) !== loginUserId)
            .map((a) => ({
              name: `${a.firstName || ''} ${a.lastName || ''}`.trim() || a.email,
              email: a.email,
            }));
          const capMessage = branchTier
            ? `This account is already signed in on its ${deviceKind === 'web' ? 'web' : 'mobile'} device. Branch accounts allow 1 web + 1 mobile login. Please contact your administrator.`
            : 'This account is already signed in on the maximum 3 devices. Please contact your administrator.';
          // Step 1 (default): inform + offer approval. No pending row, no
          // approver spam until the user explicitly taps "Request approval".
          if ((req.body as any)?.requestApproval !== true) {
            res.status(403).json({
              error: capMessage,
              code: 'DEVICE_CAP_REACHED',
              data: {
                tier: branchTier ? 'branch' : 'company',
                deviceKind,
                maxDevices: branchTier ? 2 : COMPANY_TIER_MAX,
                approvers: approverContacts,
                devices: actives.map((a: any) => ({
                  deviceId: a.deviceId,
                  deviceName: a.deviceName,
                  deviceKind: (a as any).deviceKind,
                  ip: a.ip,
                  lastSeenAt: a.lastSeenAt,
                })),
              },
            });
            return;
          }
          // Step 2 (explicit request): park + notify owner devices + approvers.
          const pending = await UserSession.create({
            userId: loginUserId,
            deviceId: meta.deviceId,
            deviceName: meta.deviceName,
            deviceKind,
            ip: meta.ip,
            userAgent: meta.userAgent,
            status: 'pending',
            expiresAt: new Date(Date.now() + PENDING_SESSION_TTL_SECONDS * 1000),
          });
          const requestPayload = {
            sessionId: pending._id.toString(),
            accountEmail: user.email,
            accountName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
            deviceId: meta.deviceId,
            deviceName: meta.deviceName || 'Unknown device',
            deviceKind,
            ip: meta.ip,
            userAgent: meta.userAgent,
            requestedAt: new Date().toISOString(),
          };
          // 1) The account owner's own active devices (self-approval).
          RealtimeService.notifyUser(loginUserId, {
            type: 'SESSION_APPROVAL_REQUESTED',
            payload: requestPayload,
          });
          // 2) Default admin + logins:approve holders (company fallback).
          try {
            for (const approver of approvers) {
              if (String(approver.userId) === loginUserId) continue;
              RealtimeService.notifyUser(approver.userId, {
                type: 'SESSION_APPROVAL_REQUESTED',
                payload: requestPayload,
              });
              if (user.companyId) {
                await Notification.create({
                  userId: approver.userId,
                  companyId: user.companyId,
                  type: 'login_approval_request',
                  title: `Login approval needed: ${user.email}`,
                  body: `${requestPayload.accountName || user.email} is trying to log in from ${requestPayload.deviceName} (${deviceKind}, IP ${meta.ip || 'unknown'}). Open Login Requests to allow or deny.`,
                  data: { sessionId: pending._id.toString(), targetUserId: loginUserId, deviceKind },
                  read: false,
                });
              }
            }
          } catch (notifyError: any) {
            logger.warn('Approver notification failed', { error: notifyError?.message });
          }
          const approvalMessage = branchTier
            ? `Approval requested for your ${deviceKind} login. Your administrator has been notified – please wait here.`
            : 'Approval requested. Your administrator has been notified – please wait here.';
          res.status(403).json({
            error: approvalMessage,
            code: 'DEVICE_APPROVAL_REQUIRED',
            data: {
              sessionId: pending._id.toString(),
              expiresIn: PENDING_SESSION_TTL_SECONDS,
              tier: branchTier ? 'branch' : 'company',
              deviceKind,
              maxDevices: branchTier ? 2 : COMPANY_TIER_MAX,
              approvers: approverContacts,
              devices: actives.map((a: any) => ({
                deviceId: a.deviceId,
                deviceName: a.deviceName,
                deviceKind: (a as any).deviceKind,
                ip: a.ip,
                lastSeenAt: a.lastSeenAt,
              })),
            },
          });
          return;
        }
        session = await UserSession.create({
          userId: loginUserId,
          deviceId: meta.deviceId,
          deviceName: meta.deviceName,
          deviceKind,
          ip: meta.ip,
          userAgent: meta.userAgent,
          status: 'active',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });
      } else {
        session.lastSeenAt = new Date();
        session.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        if (meta.deviceName) session.deviceName = meta.deviceName;
        await session.save();
      }

      res.json({ success: true, data: await AuthController.buildLoginPayload(user, session._id.toString()) });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'LOGIN_ERROR' });
    }
  }

  static async refreshToken(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        res.status(401).json({ error: 'Refresh token required', code: 'NO_TOKEN' });
        return;
      }
      const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET || 'dev-secret') as Record<string, unknown>;
      const user = await User.findById(decoded.userId);
      if (!user || !user.isActive) {
        res.status(401).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
        return;
      }
      const refreshExp = (user as any).accessExpiresAt ? new Date((user as any).accessExpiresAt).getTime() : null;
      if (refreshExp !== null && refreshExp <= Date.now() && user.role !== Role.SUPER_ADMIN && user.role !== 'SUPER_ADMIN') {
        res.status(401).json({ error: 'Your access has expired. Please contact your administrator.', code: 'ACCESS_EXPIRED' });
        return;
      }
      // Refresh honors device revocation: a revoked/expired session cannot mint tokens.
      const refreshSid = decoded.sid as string | undefined;
      if (refreshSid) {
        const { UserSession } = await import('../../common/models/UserSession');
        const sess = await UserSession.findById(refreshSid).select('status userId expiresAt').lean();
        if (!sess || sess.status !== 'active' || String(sess.userId) !== String(user._id) || (sess.expiresAt && new Date(sess.expiresAt).getTime() <= Date.now())) {
          res.status(401).json({ error: 'Session revoked. Please login again.', code: 'SESSION_REVOKED' });
          return;
        }
      }
      const permissions = await RbacService.getEffectivePermissions(user);
      const mustChangePassword = (user as any).mustChangePassword === true;
      const { accessToken, refreshToken: newRefresh } = generateTokens(
        user._id.toString(),
        user.role,
        user.companyId,
        user.branchId,
        await AuthController.resolveAllowedBranchIds(user._id.toString()),
        permissions,
        mustChangePassword ? { mcp: true } : {},
        refreshSid
      );
      res.json({ success: true, data: { accessToken, refreshToken: newRefresh, mustChangePassword } });
    } catch (error) {
      res.status(403).json({ error: 'Invalid refresh token', code: 'INVALID_REFRESH' });
    }
  }

  static async getProfile(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.userId;
      const user = await User.findById(userId).select('email firstName lastName role roleId customPermissions companyId branchId isActive accessExpiresAt reauthDeadline');
      if (!user) {
        res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
        return;
      }
      const allowedBranchIds = await AuthController.resolveAllowedBranchIds(user._id.toString());
      const branches = await AuthController.resolveUserBranches(user.role as Role, user.companyId?.toString(), allowedBranchIds);
      const permissions = await RbacService.getEffectivePermissions(user);
      const { accessDaysLeft } = await import('./login-policy.service');
      res.json({
        success: true,
        data: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          roleId: (user as any).roleId,
          permissions,
          companyId: user.companyId,
          branchId: user.branchId,
          allowedBranchIds,
          branches,
          accessExpiresAt: (user as any).accessExpiresAt || null,
          accessDaysLeft: accessDaysLeft((user as any).accessExpiresAt),
          reauthDeadline: (user as any).reauthDeadline || null,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'PROFILE_ERROR' });
    }
  }

  static async updateProfile(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.userId;
      const { firstName, lastName, phone } = req.body;
      const user = await User.findByIdAndUpdate(userId, { firstName, lastName, phone }, { new: true, runValidators: true });
      res.json({ success: true, data: user });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'UPDATE_ERROR' });
    }
  }

  static async changePassword(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.userId;
      const { currentPassword, newPassword } = req.body;
      if (!newPassword) {
        res.status(400).json({ error: 'newPassword is required', code: 'VALIDATION_ERROR' });
        return;
      }
      const user = await User.findById(userId).select('+password');
      if (!user) {
        res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
        return;
      }
      const valid = await comparePassword(currentPassword, user.password);
      if (!valid) {
        res.status(400).json({ error: 'Current password is incorrect', code: 'WRONG_PASSWORD' });
        return;
      }
      const violations = await validatePassword(user.companyId?.toString(), newPassword);
      if (violations.length > 0) {
        res.status(400).json({ error: violations[0], code: 'WEAK_PASSWORD', details: violations });
        return;
      }
      user.password = await hashPassword(newPassword);
      (user as any).mustChangePassword = false;
      await user.save();
      res.json({ success: true, message: 'Password updated. Please login again.' });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'PASSWORD_ERROR' });
    }
  }

  static async forgotPassword(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.body;
      // Always respond success – never reveal whether the email exists.
      if (!email) {
        res.json({ success: true, message: 'If the email exists, a reset link was sent.' });
        return;
      }
      const user = await User.findOne({ email: String(email).toLowerCase().trim() });
      if (user && user.isActive) {
        const raw = randomBytes(32).toString('hex');
        const tokenHash = createHash('sha256').update(raw).digest('hex');
        await PasswordResetToken.updateMany({ userId: user._id, usedAt: { $exists: false } }, { $set: { usedAt: new Date() } });
        await PasswordResetToken.create({
          userId: user._id,
          tokenHash,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        });
        logger.info('Password reset requested', { userId: user._id.toString(), resetToken: raw });
      }
      res.json({ success: true, message: 'If the email exists, a reset link was sent.' });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FORGOT_ERROR' });
    }
  }

  static async resetPassword(req: Request, res: Response): Promise<void> {
    try {
      const { token, newPassword } = req.body;
      if (!token || !newPassword) {
        res.status(400).json({ error: 'token and newPassword are required', code: 'VALIDATION_ERROR' });
        return;
      }
      const tokenHash = createHash('sha256').update(String(token)).digest('hex');
      const record = await PasswordResetToken.findOne({ tokenHash, usedAt: { $exists: false } });
      if (!record || record.expiresAt.getTime() <= Date.now()) {
        res.status(400).json({ error: 'Reset link is invalid or expired', code: 'INVALID_TOKEN' });
        return;
      }
      const user = await User.findById(record.userId);
      if (!user || !user.isActive) {
        res.status(400).json({ error: 'Reset link is invalid or expired', code: 'INVALID_TOKEN' });
        return;
      }
      const violations = await validatePassword(user.companyId?.toString(), newPassword);
      if (violations.length > 0) {
        res.status(400).json({ error: violations[0], code: 'WEAK_PASSWORD', details: violations });
        return;
      }
      user.password = await hashPassword(newPassword);
      (user as any).mustChangePassword = false;
      await user.save();
      record.usedAt = new Date();
      await record.save();
      res.json({ success: true, message: 'Password reset successfully. Please login.' });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'RESET_ERROR' });
    }
  }

  /* ---------------- Concurrent-device sessions ---------------- */

  /**
   * May this requester decide someone's login request? The account owner
   * always can; otherwise company admins/managers or holders of the
   * logins:approve permission in the SAME company.
   */
  static async canDecideLoginRequest(me: any, targetUserId: string): Promise<boolean> {
    if (!me || !targetUserId) return false;
    if (String(me.userId) === String(targetUserId)) return true;
    const target = await User.findById(targetUserId).select('companyId').lean();
    if (!target || String((target as any).companyId) !== String(me.companyId)) return false;
    if (me.isSuperAdmin) return true;
    const role = String(me.role || '');
    if (['COMPANY_ADMIN', 'COMPANY_MANAGER'].includes(role)) return true;
    const perms = (me.permissions || []) as string[];
    return perms.includes('logins:approve') || perms.includes('*') || perms.includes('users:*');
  }

  /** Pending login requests for MY account (approval inbox fallback for missed realtime pushes). */
  static async listPendingSessions(req: Request, res: Response): Promise<void> {
    try {
      const me = (req as AuthRequest).user;
      const { UserSession } = await import('../../common/models/UserSession');
      const now = new Date();
      const sessions = await UserSession.find({
        userId: me?.userId,
        status: 'pending',
        expiresAt: { $gt: now },
      })
        .select('deviceId deviceName ip userAgent createdAt expiresAt')
        .sort({ createdAt: -1 })
        .lean();
      const user = await User.findById(me?.userId).select('email').lean();
      res.json({
        success: true,
        data: sessions.map((s: any) => ({
          sessionId: s._id.toString(),
          accountEmail: (user as any)?.email,
          deviceId: s.deviceId,
          deviceName: s.deviceName || 'Unknown device',
          ip: s.ip,
          userAgent: s.userAgent,
          requestedAt: s.createdAt,
          expiresAt: s.expiresAt,
        })),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  static async listSessions(req: Request, res: Response): Promise<void> {
    try {
      const me = (req as AuthRequest).user;
      const { UserSession } = await import('../../common/models/UserSession');
      const sessions = await UserSession.find({ userId: me?.userId, status: { $in: ['active', 'pending'] } })
        .select('deviceId deviceName ip status lastSeenAt expiresAt createdAt')
        .sort({ lastSeenAt: -1 })
        .lean();
      const currentSid = (me as any)?.sid;
      res.json({
        success: true,
        data: sessions.map((s: any) => ({ ...s, current: currentSid ? String(s._id) === String(currentSid) : false })),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  static async revokeSession(req: Request, res: Response): Promise<void> {
    try {
      const me = (req as AuthRequest).user;
      const { UserSession } = await import('../../common/models/UserSession');
      const target = await UserSession.findOne({ _id: req.params.id, userId: me?.userId });
      if (!target) {
        res.status(404).json({ error: 'Session not found', code: 'NOT_FOUND' });
        return;
      }
      target.status = 'revoked';
      await target.save();
      res.json({ success: true, message: 'Session revoked' });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'REVOKE_ERROR' });
    }
  }

  static async revokeOtherSessions(req: Request, res: Response): Promise<void> {
    try {
      const me = (req as AuthRequest).user;
      const { UserSession } = await import('../../common/models/UserSession');
      const currentSid = (me as any)?.sid;
      const filter: Record<string, unknown> = { userId: me?.userId, status: { $in: ['active', 'pending'] } };
      if (currentSid) filter._id = { $ne: currentSid };
      const result = await UserSession.updateMany(filter, { $set: { status: 'revoked' } });
      res.json({ success: true, data: { revoked: result.modifiedCount || 0 } });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'REVOKE_ERROR' });
    }
  }

  /** Public poll for a pending device: active (with tokens) / pending / denied / expired. */
  static async pendingSessionStatus(req: Request, res: Response): Promise<void> {
    try {
      const { UserSession } = await import('../../common/models/UserSession');
      const session = await UserSession.findById(req.params.id);
      if (!session) {
        res.status(404).json({ error: 'Login request not found', code: 'NOT_FOUND' });
        return;
      }
      if (session.status === 'pending' && session.expiresAt.getTime() <= Date.now()) {
        session.status = 'expired';
        await session.save();
      }
      if (session.status === 'active') {
        const user = await User.findById(session.userId);
        if (!user || !user.isActive) {
          res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
          return;
        }
        res.json({ success: true, data: { status: 'active', ...(await AuthController.buildLoginPayload(user, session._id.toString())) } });
        return;
      }
      res.json({ success: true, data: { status: session.status } });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  static async allowSession(req: Request, res: Response): Promise<void> {
    try {
      const me = (req as AuthRequest).user;
      const { UserSession, MAX_ACTIVE_SESSIONS } = await import('../../common/models/UserSession');
      const target = await UserSession.findById(req.params.id);
      if (!target) {
        res.status(404).json({ error: 'Login request not found', code: 'NOT_FOUND' });
        return;
      }
      if (!(await AuthController.canDecideLoginRequest(me, String(target.userId)))) {
        res.status(403).json({ error: 'You do not have permission to approve logins', code: 'FORBIDDEN' });
        return;
      }
      if (target.status !== 'pending' || target.expiresAt.getTime() <= Date.now()) {
        target.status = 'expired';
        await target.save();
        res.status(410).json({ error: 'This login request has expired', code: 'REQUEST_EXPIRED' });
        return;
      }
      target.status = 'active';
      target.lastSeenAt = new Date();
      target.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      target.decidedBy = me?.userId as any;
      target.decidedAt = new Date();
      await target.save();
      // Keep the tier cap: branch tier evicts same-kind overflow, company tier total overflow.
      const { isBranchTier, COMPANY_TIER_MAX } = await import('./login-policy.service');
      const targetUser = await User.findById(target.userId).select('role').lean();
      const tierBranch = isBranchTier((targetUser as any)?.role);
      const scope: Record<string, unknown> = { userId: target.userId, status: 'active' };
      if (tierBranch) scope.deviceKind = (target as any).deviceKind || 'web';
      const actives = await UserSession.find(scope).sort({ lastSeenAt: -1 });
      const overflow = actives.slice(tierBranch ? 1 : COMPANY_TIER_MAX);
      if (overflow.length > 0) {
        await UserSession.updateMany({ _id: { $in: overflow.map((o) => o._id) } }, { $set: { status: 'revoked' } });
      }
      res.json({ success: true, message: 'Device approved and logged in' });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'APPROVE_ERROR' });
    }
  }

  static async denySession(req: Request, res: Response): Promise<void> {
    try {
      const me = (req as AuthRequest).user;
      const { UserSession } = await import('../../common/models/UserSession');
      const target = await UserSession.findById(req.params.id);
      if (!target) {
        res.status(404).json({ error: 'Login request not found', code: 'NOT_FOUND' });
        return;
      }
      if (!(await AuthController.canDecideLoginRequest(me, String(target.userId)))) {
        res.status(403).json({ error: 'You do not have permission to deny logins', code: 'FORBIDDEN' });
        return;
      }
      target.status = 'denied';
      target.decidedBy = me?.userId as any;
      target.decidedAt = new Date();
      await target.save();
      res.json({ success: true, message: 'Login denied for this device' });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'DENY_ERROR' });
    }
  }

  /**
   * Trust a device for 90 days. Works on a pending request (approves it as
   * well) or an already-active session. Afterwards that browser logs in
   * without asking again until trust expires.
   */
  static async trustSession(req: Request, res: Response): Promise<void> {
    try {
      const me = (req as AuthRequest).user;
      const { UserSession, MAX_ACTIVE_SESSIONS } = await import('../../common/models/UserSession');
      const { TrustedDevice, trustedDeviceExpiry } = await import('../../common/models/TrustedDevice');
      const target = await UserSession.findById(req.params.id);
      if (!target) {
        res.status(404).json({ error: 'Session not found', code: 'NOT_FOUND' });
        return;
      }
      if (!(await AuthController.canDecideLoginRequest(me, String(target.userId)))) {
        res.status(403).json({ error: 'You do not have permission to trust devices', code: 'FORBIDDEN' });
        return;
      }
      if (target.status === 'pending') {
        if (target.expiresAt.getTime() <= Date.now()) {
          target.status = 'expired';
          await target.save();
          res.status(410).json({ error: 'This login request has expired', code: 'REQUEST_EXPIRED' });
          return;
        }
        target.status = 'active';
        target.lastSeenAt = new Date();
        target.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        target.decidedBy = me?.userId as any;
        target.decidedAt = new Date();
        await target.save();
        const { isBranchTier: isTierBranch, COMPANY_TIER_MAX: tierMax } = await import('./login-policy.service');
        const trustTarget = await User.findById(target.userId).select('role').lean();
        const trustScope: Record<string, unknown> = { userId: target.userId, status: 'active' };
        const trustBranchTier = isTierBranch((trustTarget as any)?.role);
        if (trustBranchTier) trustScope.deviceKind = (target as any).deviceKind || 'web';
        const actives = await UserSession.find(trustScope).sort({ lastSeenAt: -1 });
        const overflow = actives.slice(trustBranchTier ? 1 : tierMax);
        if (overflow.length > 0) {
          await UserSession.updateMany({ _id: { $in: overflow.map((o) => o._id) } }, { $set: { status: 'revoked' } });
        }
      } else if (target.status !== 'active') {
        res.status(400).json({ error: `Only pending or active sessions can be trusted (current: ${target.status})`, code: 'NOT_TRUSTABLE' });
        return;
      }
      const expiresAt = trustedDeviceExpiry();
      await TrustedDevice.findOneAndUpdate(
        { userId: me?.userId, deviceId: target.deviceId },
        {
          userId: me?.userId,
          deviceId: target.deviceId,
          deviceName: target.deviceName,
          trustedAt: new Date(),
          expiresAt,
        },
        { upsert: true },
      );
      res.json({
        success: true,
        message: 'Device trusted for 90 days. It will not ask for approval again until then.',
        data: { deviceId: target.deviceId, trustedUntil: expiresAt.toISOString() },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'TRUST_ERROR' });
    }
  }

  static async listTrustedDevices(req: Request, res: Response): Promise<void> {
    try {
      const me = (req as AuthRequest).user;
      const { TrustedDevice } = await import('../../common/models/TrustedDevice');
      const rows = await TrustedDevice.find({ userId: me?.userId, expiresAt: { $gt: new Date() } })
        .select('deviceId deviceName trustedAt expiresAt')
        .sort({ trustedAt: -1 })
        .lean();
      res.json({ success: true, data: rows });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  static async revokeTrustedDevice(req: Request, res: Response): Promise<void> {
    try {
      const me = (req as AuthRequest).user;
      const { TrustedDevice } = await import('../../common/models/TrustedDevice');
      const result = await TrustedDevice.deleteOne({ userId: me?.userId, deviceId: req.params.deviceId });
      if (result.deletedCount === 0) {
        res.status(404).json({ error: 'Trusted device not found', code: 'NOT_FOUND' });
        return;
      }
      res.json({ success: true, message: 'Device trust removed. Next login will ask for approval.' });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'REVOKE_ERROR' });
    }
  }

  /** Users in scope for a requester (company-wide for privileged, own branches otherwise). */
  static async scopedUserIds(me: any): Promise<string[] | null> {
    if (!me) return [];
    if (me.isSuperAdmin) return null;
    const role = String(me.role || '');
    if (['COMPANY_ADMIN', 'COMPANY_MANAGER'].includes(role)) {
      const users = await User.find({ companyId: me.companyId }).select('_id').lean();
      return users.map((u) => String(u._id));
    }
    const { BranchMembership } = await import('../../common/models/BranchMembership');
    const [mems, own] = await Promise.all([
      BranchMembership.find({ branchId: { $in: me.allowedBranchIds || [] }, isActive: true }).select('userId').lean(),
      User.find({ $or: [{ _id: me.userId }, { branchId: { $in: me.allowedBranchIds || [] } }] }).select('_id').lean(),
    ]);
    return [...new Set([...mems.map((m: any) => String(m.userId)), ...own.map((u: any) => String(u._id)), String(me.userId)])];
  }

  /**
   * GET /auth/login-requests – raised/approved/denied/expired device logins
   * with decider + device details. Scoped to the requester's visibility.
   */
  static async loginRequests(req: Request, res: Response): Promise<void> {
    try {
      const me = (req as AuthRequest).user;
      const { UserSession } = await import('../../common/models/UserSession');
      const scopeIds = await AuthController.scopedUserIds(me);
      const filter: Record<string, unknown> = {};
      if (scopeIds) filter.userId = { $in: scopeIds };
      if (me?.companyId && (me.isSuperAdmin || String(me.role) === 'COMPANY_ADMIN' || String(me.role) === 'COMPANY_MANAGER')) {
        const inCompany = await User.find(me.isSuperAdmin && (req.query as any).companyId
          ? { companyId: (req.query as any).companyId }
          : { companyId: me.companyId }).select('_id').lean();
        filter.userId = { $in: inCompany.map((u) => String(u._id)) };
      }
      if ((req.query as any).status) filter.status = (req.query as any).status;
      const rows = await UserSession.find(filter).sort({ createdAt: -1 }).limit(200).lean();
      const userIds = [...new Set(rows.map((r: any) => String(r.userId)))];
      const deciderIds = [...new Set(rows.map((r: any) => r.decidedBy).filter(Boolean).map(String))];
      const [users, deciders] = await Promise.all([
        User.find({ _id: { $in: userIds } }).select('email firstName lastName branchId').lean(),
        deciderIds.length > 0 ? User.find({ _id: { $in: deciderIds } }).select('email firstName lastName').lean() : [],
      ]);
      const userById = new Map(users.map((u: any) => [String(u._id), u]));
      const deciderById = new Map((deciders as any[]).map((u: any) => [String(u._id), u]));
      res.json({
        success: true,
        data: rows.map((r: any) => {
          const u = userById.get(String(r.userId)) as any;
          const d = r.decidedBy ? deciderById.get(String(r.decidedBy)) as any : null;
          return {
            _id: r._id,
            status: r.status,
            deviceId: r.deviceId,
            deviceName: r.deviceName,
            deviceKind: r.deviceKind,
            ip: r.ip,
            requestedAt: r.createdAt,
            decidedAt: r.decidedAt || null,
            decidedBy: d ? { id: String(d._id), email: d.email, name: `${d.firstName || ''} ${d.lastName || ''}`.trim() } : null,
            user: u ? { id: String(u._id), email: u.email, name: `${u.firstName || ''} ${u.lastName || ''}`.trim() } : { id: String(r.userId) },
          };
        }),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  /**
   * GET /auth/security/overview – who is logged in now, per-user slot usage,
   * and recent login activity, scoped to the requester's visibility.
   */
  static async securityOverview(req: Request, res: Response): Promise<void> {
    try {
      const me = (req as AuthRequest).user;
      const { UserSession } = await import('../../common/models/UserSession');
      const { isBranchTier, COMPANY_TIER_MAX } = await import('./login-policy.service');
      const scopeIds = await AuthController.scopedUserIds(me);
      const userFilter: Record<string, unknown> = {};
      if (scopeIds) userFilter._id = { $in: scopeIds };
      else if (me?.companyId && !me.isSuperAdmin) userFilter.companyId = me.companyId;
      const users = await User.find(userFilter).select('email firstName lastName role branchId isActive accessExpiresAt').lean();
      const ids = users.map((u: any) => String(u._id));
      const [actives, recent] = await Promise.all([
        UserSession.find({ userId: { $in: ids }, status: 'active' })
          .select('userId deviceId deviceName deviceKind ip lastSeenAt createdAt')
          .sort({ lastSeenAt: -1 })
          .lean(),
        UserSession.find({ userId: { $in: ids }, status: { $in: ['active', 'revoked', 'denied', 'expired'] } })
          .select('userId deviceId deviceName deviceKind ip status createdAt decidedAt')
          .sort({ createdAt: -1 })
          .limit(50)
          .lean(),
      ]);
      const { accessDaysLeft } = await import('./login-policy.service');
      const byUser = new Map<string, any[]>();
      for (const s of actives) {
        const k = String((s as any).userId);
        if (!byUser.has(k)) byUser.set(k, []);
        byUser.get(k)!.push(s);
      }
      res.json({
        success: true,
        data: {
          users: users.map((u: any) => {
            const sessions = byUser.get(String(u._id)) || [];
            const branchTier = isBranchTier(u.role);
            return {
              id: String(u._id),
              email: u.email,
              name: `${u.firstName || ''} ${u.lastName || ''}`.trim(),
              role: u.role,
              isActive: u.isActive,
              tier: branchTier ? 'branch' : 'company',
              slotsMax: branchTier ? 2 : COMPANY_TIER_MAX,
              activeCount: sessions.length,
              accessDaysLeft: accessDaysLeft(u.accessExpiresAt),
              sessions: sessions.map((s: any) => ({
                deviceId: s.deviceId,
                deviceName: s.deviceName,
                deviceKind: s.deviceKind,
                ip: s.ip,
                lastSeenAt: s.lastSeenAt,
              })),
            };
          }),
          recent: recent.map((r: any) => ({
            userId: String(r.userId),
            deviceName: r.deviceName,
            deviceKind: r.deviceKind,
            ip: r.ip,
            status: r.status,
            at: r.createdAt,
          })),
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  /**
   * POST /auth/users/:id/extend-access – default admin / logins:approve
   * holder extends account access by 90 days. Active sessions are stamped so
   * stale ones die after a 24h re-login grace; the user is notified.
   */
  static async extendAccess(req: Request, res: Response): Promise<void> {
    try {
      const me = (req as AuthRequest).user;
      const target = await User.findById(req.params.id);
      if (!target) {
        res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' });
        return;
      }
      const { UserSession } = await import('../../common/models/UserSession');
      const { Notification } = await import('../../common/models/Notification');
      const { RealtimeService } = await import('../realtime/realtime.service');
      const { accessWindow, REAUTH_GRACE_HOURS } = await import('./login-policy.service');
      if (!me?.isSuperAdmin && String((target as any).companyId) !== String(me?.companyId)) {
        res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
        return;
      }
      if (!me?.isSuperAdmin) {
        const role = String(me?.role || '');
        const perms = ((me as any)?.permissions || []) as string[];
        const allowed =
          ['COMPANY_ADMIN', 'COMPANY_MANAGER'].includes(role) ||
          perms.includes('logins:approve') || perms.includes('*') || perms.includes('users:*');
        if (!allowed) {
          res.status(403).json({ error: 'You do not have permission to extend access', code: 'FORBIDDEN' });
          return;
        }
      }
      const now = new Date();
      const base = (target as any).accessExpiresAt && new Date((target as any).accessExpiresAt).getTime() > now.getTime()
        ? new Date((target as any).accessExpiresAt)
        : now;
      (target as any).accessExpiresAt = accessWindow(base);
      (target as any).accessExtendedAt = now;
      (target as any).reauthDeadline = new Date(now.getTime() + REAUTH_GRACE_HOURS * 60 * 60 * 1000);
      await target.save();
      // Stamp live sessions: ones predating this extension die after the grace.
      await UserSession.updateMany(
        { userId: target._id, status: 'active' },
        {
          $set: {
            accessExtendedAt: now,
            reauthDeadline: (target as any).reauthDeadline,
          },
        },
      );
      const targetId = target._id.toString();
      RealtimeService.notifyUser(targetId, {
        type: 'SYSTEM_NOTIFICATION',
        payload: {
          kind: 'access_extended',
          message: 'Your access was extended. Please log out and log in again within 24 hours to continue without interruption.',
          accessExpiresAt: (target as any).accessExpiresAt,
        },
      });
      if ((target as any).companyId) {
        await Notification.create({
          userId: target._id,
          companyId: (target as any).companyId,
          type: 'access_extended',
          title: 'Your access was extended',
          body: 'Your permissions are enabled. Please log out and log in again within 24 hours – otherwise the system will log you out automatically.',
          data: { accessExpiresAt: (target as any).accessExpiresAt, extendedBy: me?.userId },
          read: false,
        });
      }
      await import('../../common/services/audit').then(({ recordAudit }) => recordAudit({
        actorId: me?.userId,
        action: 'ACCESS_EXTENDED',
        companyId: (target as any).companyId?.toString(),
        metadata: { targetUserId: targetId, accessExpiresAt: (target as any).accessExpiresAt },
      }));
      res.json({
        success: true,
        data: {
          userId: targetId,
          accessExpiresAt: (target as any).accessExpiresAt,
          reauthDeadline: (target as any).reauthDeadline,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'EXTEND_ERROR' });
    }
  }
}

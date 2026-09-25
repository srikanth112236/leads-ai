import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '../types';
import { logger } from '../utils/logger';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    role: Role | string;
    companyId?: string;
    branchId?: string;
    allowedBranchIds: string[];
    isSuperAdmin: boolean;
    permissions?: string[];
    /** Device-session id bound at login (absent on legacy tokens). */
    sid?: string;
  };
}

export async function authenticateToken(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    res.status(401).json({ error: 'Access token required', code: 'NO_TOKEN' });
    return;
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as Record<string, unknown>;
    const userRole = (decoded.role as Role | string);
    const companyId = decoded.companyId as string | undefined;
    const allowedBranchIds = (decoded.allowedBranchIds as string[]) || [];
    const permissions = (decoded.permissions as string[]) || [];
    const isSuperAdmin = userRole === Role.SUPER_ADMIN || userRole === 'SUPER_ADMIN';

    let branchId = decoded.branchId as string | undefined;
    const headerBranchId = req.headers['x-branch-id'];
    if (typeof headerBranchId === 'string' && headerBranchId.trim()) {
      const target = headerBranchId.trim();
      if (target === 'all' || target === '') {
        if (isSuperAdmin || userRole === Role.COMPANY_ADMIN || userRole === Role.COMPANY_MANAGER) {
          branchId = undefined;
        } else if (userRole === Role.BRANCH_MANAGER && allowedBranchIds.length > 0) {
          branchId = undefined;
        }
      } else {
        if (isSuperAdmin || userRole === Role.COMPANY_ADMIN || userRole === Role.COMPANY_MANAGER || allowedBranchIds.includes(target)) {
          branchId = target;
        } else {
          logger.warn('Branch access denied via x-branch-id', { userId: decoded.userId, target, allowedBranchIds });
          res.status(403).json({ error: 'Cross-branch access denied', code: 'BRANCH_VIOLATION' });
          return;
        }
      }
    }

    req.user = {
      userId: decoded.userId as string,
      role: userRole,
      companyId,
      branchId,
      allowedBranchIds,
      isSuperAdmin,
      permissions,
      sid: (decoded as any).sid as string | undefined,
    } as AuthRequest['user'];

    // Device-session revocation: tokens bound to a revoked/expired session
    // stop working immediately (pre-sid legacy tokens keep working).
    const sid = (decoded as any).sid as string | undefined;
    if (sid) {
      try {
        const { UserSession } = await import('../models/UserSession');
        const sess = await UserSession.findById(sid).select('status userId expiresAt lastSeenAt accessExtendedAt reauthDeadline createdAt').lean();
        const dead =
          !sess ||
          sess.status !== 'active' ||
          String((sess as any).userId) !== String(decoded.userId) ||
          ((sess as any).expiresAt && new Date((sess as any).expiresAt).getTime() <= Date.now());
        if (dead) {
          res.status(401).json({ error: 'Session revoked. Please login again.', code: 'SESSION_REVOKED' });
          return;
        }
        // Post-extension grace: sessions predating an access extension die
        // once the 24h re-login window lapses (force logout + fresh login).
        const extAt = (sess as any).accessExtendedAt ? new Date((sess as any).accessExtendedAt).getTime() : 0;
        const deadline = (sess as any).reauthDeadline ? new Date((sess as any).reauthDeadline).getTime() : 0;
        const createdAt = (sess as any).createdAt ? new Date((sess as any).createdAt).getTime() : Date.now();
        if (extAt > 0 && deadline > 0 && createdAt < extAt && Date.now() > deadline) {
          await UserSession.updateOne({ _id: sid }, { $set: { status: 'revoked' } });
          res.status(401).json({ error: 'Your access was updated. Please login again.', code: 'ACCESS_UPDATED' });
          return;
        }
        // Throttled presence update (at most once per 5 minutes per session).
        const lastSeen = (sess as any).lastSeenAt ? new Date((sess as any).lastSeenAt).getTime() : 0;
        if (Date.now() - lastSeen > 5 * 60 * 1000) {
          UserSession.updateOne({ _id: sid }, { $set: { lastSeenAt: new Date() } }).exec().catch(() => {});
        }
      } catch (sessionError) {
        logger.warn('Session lookup failed', { error: (sessionError as any)?.message });
        res.status(500).json({ error: 'Session validation failed', code: 'SESSION_ERROR' });
        return;
      }
    }

    // Forced password change: tokens carrying the mcp claim may only reach
    // the password-change completion endpoints – everything else is locked
    // until the temporary password is replaced.
    if ((decoded as any).mcp === true) {
      // NOTE: req.path is router-relative here – use the full original URL.
      const path = req.originalUrl || req.path || '';
      const allowed =
        path.endsWith('/auth/change-password') ||
        path.endsWith('/auth/me') ||
        path.endsWith('/auth/logout');
      if (!allowed) {
        res.status(403).json({
          error: 'You must change your temporary password before continuing.',
          code: 'PASSWORD_CHANGE_REQUIRED',
        });
        return;
      }
    }
    next();
  } catch (error) {
    logger.warn('Invalid token attempt', { ip: req.ip, path: req.path });
    res.status(403).json({ error: 'Invalid or expired token', code: 'INVALID_TOKEN' });
  }
}

export function requireRole(...roles: (Role | string)[]): (req: AuthRequest, res: Response, next: NextFunction) => Promise<void> {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required', code: 'NO_AUTH' });
      return;
    }
    if (req.user.isSuperAdmin) {
      next();
      return;
    }

    const userRole = String(req.user.role || '').toUpperCase();
    const allowedRoles = roles.map((r) => String(r).toUpperCase());

    // 1. Direct case-insensitive match on standard or custom role
    if (allowedRoles.includes(userRole) || roles.includes(req.user.role)) {
      next();
      return;
    }

    // 2. Re-verify against fresh DB user in case token role is outdated or case differs
    try {
      const { User } = await import('../models/User');
      const dbUser = await User.findById(req.user.userId);
      if (dbUser && dbUser.isActive) {
        const dbRoleUpper = String(dbUser.role || '').toUpperCase();
        if (allowedRoles.includes(dbRoleUpper) || roles.includes(dbUser.role)) {
          req.user.role = dbUser.role as Role;
          next();
          return;
        }

        // 3. Fallback to dynamic permissions: wildcard or root access
        const { RbacService } = await import('../services/RbacService');
        const userPerms = await RbacService.getEffectivePermissions(dbUser);
        req.user.permissions = userPerms;
        if (userPerms && userPerms.includes('*')) {
          next();
          return;
        }
      }
    } catch {
      // Fall through to 403
    }

    res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' });
  };
}

export function requireRoleOrPermission(
  roles: (Role | string)[],
  permissions: string[],
): (req: AuthRequest, res: Response, next: NextFunction) => Promise<void> {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required', code: 'NO_AUTH' });
      return;
    }
    if (req.user.isSuperAdmin) {
      next();
      return;
    }

    const userRole = String(req.user.role || '').toUpperCase();
    const allowedRoles = roles.map((r) => String(r).toUpperCase());
    if (allowedRoles.includes(userRole)) {
      next();
      return;
    }

    try {
      const { User } = await import('../models/User');
      const { RbacService } = await import('../services/RbacService');
      const dbUser = await User.findById(req.user.userId);
      if (dbUser && dbUser.isActive) {
        const dbRoleUpper = String((dbUser as any).role || '').toUpperCase();
        if (allowedRoles.includes(dbRoleUpper)) {
          req.user.role = (dbUser as any).role as Role;
          next();
          return;
        }
        const userPerms = await RbacService.getEffectivePermissions(dbUser);
        req.user.permissions = userPerms;
        if (RbacService.hasAnyPermission(userPerms, permissions)) {
          next();
          return;
        }
      } else {
        // Fall back to token permissions when DB lookup is unavailable
        const { RbacService } = await import('../services/RbacService');
        const tokenPerms = req.user.permissions || [];
        if (RbacService.hasAnyPermission(tokenPerms, permissions)) {
          next();
          return;
        }
      }
    } catch {
      // Fall through to 403
    }

    res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' });
  };
}

export function requirePermission(...permissions: string[]): (req: AuthRequest, res: Response, next: NextFunction) => Promise<void> {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required', code: 'NO_AUTH' });
      return;
    }
    if (req.user.isSuperAdmin) {
      next();
      return;
    }

    const { RbacService } = await import('../services/RbacService');
    const { User } = await import('../models/User');

    let userPerms = req.user.permissions;
    let hasAccess = userPerms && userPerms.length > 0 && RbacService.hasAllPermissions(userPerms, permissions);

    if (!hasAccess) {
      const user = await User.findById(req.user.userId);
      if (user && user.isActive) {
        userPerms = await RbacService.getEffectivePermissions(user);
        req.user.permissions = userPerms;
        hasAccess = RbacService.hasAllPermissions(userPerms, permissions);
      }
    }

    if (!hasAccess) {
      res.status(403).json({
        error: 'Insufficient permissions for this operation',
        code: 'FORBIDDEN',
        requiredPermissions: permissions,
      });
      return;
    }
    next();
  };
}

export function requireAnyPermission(...permissions: string[]): (req: AuthRequest, res: Response, next: NextFunction) => Promise<void> {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required', code: 'NO_AUTH' });
      return;
    }
    if (req.user.isSuperAdmin) {
      next();
      return;
    }

    const { RbacService } = await import('../services/RbacService');
    const { User } = await import('../models/User');

    let userPerms = req.user.permissions;
    let hasAccess = userPerms && userPerms.length > 0 && RbacService.hasAnyPermission(userPerms, permissions);

    if (!hasAccess) {
      const user = await User.findById(req.user.userId);
      if (user && user.isActive) {
        userPerms = await RbacService.getEffectivePermissions(user);
        req.user.permissions = userPerms;
        hasAccess = RbacService.hasAnyPermission(userPerms, permissions);
      }
    }

    if (!hasAccess) {
      res.status(403).json({
        error: 'Insufficient permissions for this operation',
        code: 'FORBIDDEN',
        requiredPermissions: permissions,
      });
      return;
    }
    next();
  };
}

/**
 * Case-insensitive role comparison.
 * System roles are stored UPPERCASE but RBAC-assigned users may carry the
 * lowercase slug (e.g. "branch_manager"), and custom roles use lowercase slugs.
 * Always compare via this helper instead of `=== Role.X`.
 */
export function normalizeRole(role: Role | string | undefined | null): string {
  return String(role || '').toUpperCase();
}

export function hasAnyRole(userRole: Role | string | undefined | null, ...roles: (Role | string)[]): boolean {
  const normalized = normalizeRole(userRole);
  return roles.some((r) => normalizeRole(r) === normalized);
}

/**
 * Company-wide privileged roles: see all branches in the company.
 */
export function isPrivilegedRole(userRole: Role | string | undefined | null): boolean {
  const normalized = normalizeRole(userRole);
  return (
    normalized === normalizeRole(Role.SUPER_ADMIN) ||
    normalized === normalizeRole(Role.COMPANY_ADMIN) ||
    normalized === normalizeRole(Role.COMPANY_MANAGER)
  );
}

export function requireTenantContext(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required', code: 'NO_AUTH' });
    return;
  }
  if (!req.user.companyId && !req.user.isSuperAdmin) {
    res.status(403).json({ error: 'Company context required', code: 'NO_COMPANY' });
    return;
  }
  next();
}


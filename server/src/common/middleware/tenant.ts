import { Response, NextFunction } from 'express';
import { AuthRequest, isPrivilegedRole } from './auth';
import { logger } from '../utils/logger';

/**
 * Whether the user may access data scoped to `branchId`.
 * Privileged company roles (and super admins) may access every branch.
 * Everyone else must hold the branch in their membership-derived allow-list.
 */
export function canAccessBranch(
  user: AuthRequest['user'],
  branchId: string | undefined | null,
): boolean {
  if (!user || !branchId) return false;
  if (user.isSuperAdmin || isPrivilegedRole(user.role)) return true;
  const allowed = user.allowedBranchIds || [];
  if (allowed.includes(String(branchId))) return true;
  if (user.branchId && String(user.branchId) === String(branchId)) return true;
  return false;
}

export function enforceTenantIsolation(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required', code: 'NO_AUTH' });
    return;
  }

  const bodyCompanyId = req.body.companyId;
  const queryCompanyId = req.query.companyId;
  const paramsCompanyId = req.params.companyId;
  const bodyBranchId = req.body.branchId;

  if (bodyCompanyId && bodyCompanyId !== req.user.companyId && !req.user.isSuperAdmin) {
    logger.warn('Tenant escape attempt via companyId', {
      userId: req.user.userId,
      attemptedCompanyId: bodyCompanyId,
      actualCompanyId: req.user.companyId,
    });
    res.status(403).json({ error: 'Cross-tenant access denied', code: 'TENANT_VIOLATION' });
    return;
  }

  if (queryCompanyId && queryCompanyId !== req.user.companyId && !req.user.isSuperAdmin) {
    logger.warn('Tenant escape attempt via query companyId', {
      userId: req.user.userId,
      attemptedCompanyId: queryCompanyId,
      actualCompanyId: req.user.companyId,
    });
    res.status(403).json({ error: 'Cross-tenant access denied', code: 'TENANT_VIOLATION' });
    return;
  }

  if (paramsCompanyId && paramsCompanyId !== req.user.companyId && !req.user.isSuperAdmin) {
    logger.warn('Tenant escape attempt via params companyId', {
      userId: req.user.userId,
      attemptedCompanyId: paramsCompanyId,
      actualCompanyId: req.user.companyId,
    });
    res.status(403).json({ error: 'Cross-tenant access denied', code: 'TENANT_VIOLATION' });
    return;
  }

  const queryBranchId = req.query.branchId as string | undefined;
  const paramsBranchId = req.params.branchId as string | undefined;

  if (
    paramsBranchId &&
    !req.user.isSuperAdmin &&
    !isPrivilegedRole(req.user.role) &&
    !canAccessBranch(req.user, paramsBranchId)
  ) {
    logger.warn('Tenant escape attempt via params branchId', {
      userId: req.user.userId,
      attemptedBranchId: paramsBranchId,
      allowedBranchIds: req.user.allowedBranchIds,
    });
    res.status(403).json({ error: 'Cross-branch access denied', code: 'BRANCH_VIOLATION' });
    return;
  }

  if (queryBranchId && queryBranchId !== req.user.branchId && !req.user.isSuperAdmin && !isPrivilegedRole(req.user.role)) {
    if (!req.user.allowedBranchIds.includes(queryBranchId)) {
      logger.warn('Tenant escape attempt via query branchId', {
        userId: req.user.userId,
        attemptedBranchId: queryBranchId,
        allowedBranchIds: req.user.allowedBranchIds,
      });
      res.status(403).json({ error: 'Cross-branch access denied', code: 'BRANCH_VIOLATION' });
      return;
    }
  }

  if (bodyBranchId && bodyBranchId !== req.user.branchId && !req.user.isSuperAdmin && !isPrivilegedRole(req.user.role)) {
    if (!req.user.allowedBranchIds.includes(bodyBranchId)) {
      logger.warn('Tenant escape attempt via branchId', {
        userId: req.user.userId,
        attemptedBranchId: bodyBranchId,
        allowedBranchIds: req.user.allowedBranchIds,
      });
      res.status(403).json({ error: 'Cross-branch access denied', code: 'BRANCH_VIOLATION' });
      return;
    }
  }

  next();
}

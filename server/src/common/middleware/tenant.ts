import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { logger } from '../utils/logger';

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

  if (bodyBranchId && bodyBranchId !== req.user.branchId && !req.user.isSuperAdmin) {
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

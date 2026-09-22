import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { MetaOAuthController } from './meta-oauth.controller';
import { authenticateToken, requireRole } from '../../common/middleware/auth';
import { Role } from '../../common/types';

const router = Router();

router.get(
  '/oauth/start',
  authenticateToken,
  requireRole(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.COMPANY_MANAGER),
  MetaOAuthController.start,
);
router.get(
  '/oauth/callback',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: { error: 'Too many requests', code: 'RATE_LIMITED' } }),
  MetaOAuthController.callback,
);
router.post(
  '/disconnect',
  authenticateToken,
  requireRole(Role.SUPER_ADMIN, Role.COMPANY_ADMIN),
  MetaOAuthController.disconnect,
);
router.put(
  '/pages/:id/assign',
  authenticateToken,
  requireRole(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.COMPANY_MANAGER),
  MetaOAuthController.assignPage,
);
router.get(
  '/pages',
  authenticateToken,
  requireRole(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.COMPANY_MANAGER),
  MetaOAuthController.listPages,
);
router.get(
  '/forms',
  authenticateToken,
  requireRole(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.COMPANY_MANAGER),
  MetaOAuthController.listForms,
);
router.put(
  '/forms/:id/assign',
  authenticateToken,
  requireRole(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.COMPANY_MANAGER),
  MetaOAuthController.assignForm,
);
router.get(
  '/adaccounts',
  authenticateToken,
  requireRole(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.COMPANY_MANAGER),
  MetaOAuthController.listAdAccounts,
);
router.post(
  '/adaccounts/sync',
  authenticateToken,
  requireRole(Role.SUPER_ADMIN, Role.COMPANY_ADMIN),
  MetaOAuthController.syncAdAccounts,
);
router.post(
  '/refresh',
  authenticateToken,
  requireRole(Role.SUPER_ADMIN),
  MetaOAuthController.refresh,
);

export { router as metaOAuthRoutes };

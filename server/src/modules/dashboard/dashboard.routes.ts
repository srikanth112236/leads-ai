import { Router } from 'express';
import { DashboardController } from './dashboard.controller';
import { authenticateToken, requireRoleOrPermission } from '../../common/middleware/auth';
import { Role } from '../../common/types';

const router = Router();

router.get(
  '/summary',
  authenticateToken,
  requireRoleOrPermission(
    [Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.COMPANY_MANAGER, Role.BRANCH_MANAGER],
    ['leads:read', 'campaigns:read', 'settings:read'],
  ),
  DashboardController.getSummary,
);

export { router as dashboardRoutes };

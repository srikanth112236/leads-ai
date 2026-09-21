import { Router } from 'express';
import { AdminController } from './admin.controller';
import { authenticateToken, requireRole } from '../../common/middleware/auth';
import { Role } from '../../common/types';

const router = Router();

router.get('/companies', authenticateToken, requireRole(Role.SUPER_ADMIN), AdminController.getCompanies);
router.get('/companies/:id', authenticateToken, requireRole(Role.SUPER_ADMIN), AdminController.getCompany);
router.get('/companies/:id/integrations', authenticateToken, requireRole(Role.SUPER_ADMIN), AdminController.getCompanyIntegrations);
router.get('/companies/:id/webhooks', authenticateToken, requireRole(Role.SUPER_ADMIN), AdminController.getCompanyWebhooks);
router.get('/branches', authenticateToken, requireRole(Role.SUPER_ADMIN), AdminController.getBranches);
router.get('/branches/:id/leads', authenticateToken, requireRole(Role.SUPER_ADMIN), AdminController.getBranchLeads);
router.get('/audit-logs', authenticateToken, requireRole(Role.SUPER_ADMIN), AdminController.getAuditLogs);
router.get('/integrations', authenticateToken, requireRole(Role.SUPER_ADMIN), AdminController.getIntegrations);
router.get('/meta/status', authenticateToken, requireRole(Role.SUPER_ADMIN), AdminController.getMetaStatus);
router.post('/meta/exchange', authenticateToken, requireRole(Role.SUPER_ADMIN), AdminController.exchangeMetaToken);

export { router as adminRoutes };

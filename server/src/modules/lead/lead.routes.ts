import { Router } from 'express';
import { LeadController } from './lead.controller';
import { authenticateToken, requireRole } from '../../common/middleware/auth';
import { enforceTenantIsolation } from '../../common/middleware/tenant';
import { Role } from '../../common/types';
import { leadSourceRoutes } from '../lead-source/lead-source.routes';

const router = Router();

router.get('/', authenticateToken, requireRole(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.COMPANY_MANAGER, Role.BRANCH_MANAGER, Role.SALES_AGENT), LeadController.getAll);
router.get('/export', authenticateToken, requireRole(Role.SUPER_ADMIN, Role.COMPANY_ADMIN), LeadController.export);
router.get('/:id', authenticateToken, requireRole(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.COMPANY_MANAGER, Role.BRANCH_MANAGER, Role.SALES_AGENT), LeadController.getById);
router.post('/', authenticateToken, requireRole(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.COMPANY_MANAGER, Role.SALES_AGENT), LeadController.create);
router.put('/:id', authenticateToken, requireRole(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.COMPANY_MANAGER, Role.SALES_AGENT), enforceTenantIsolation, LeadController.update);
router.delete('/:id', authenticateToken, requireRole(Role.SUPER_ADMIN, Role.COMPANY_ADMIN), enforceTenantIsolation, LeadController.remove);
router.get('/:id/sources', authenticateToken, LeadController.getSources);
router.get('/:id/tracker', authenticateToken, LeadController.getTrackerEvents);
router.post('/:id/assign', authenticateToken, requireRole(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.COMPANY_MANAGER), enforceTenantIsolation, LeadController.assign);
router.get('/:id/conversations', authenticateToken, LeadController.getConversations);
router.get('/:id/notes', authenticateToken, LeadController.getNotes);
router.post('/:id/notes', authenticateToken, requireRole(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.COMPANY_MANAGER, Role.SALES_AGENT), enforceTenantIsolation, LeadController.addNote);
router.use('/:id/sources', leadSourceRoutes);

export { router as leadRoutes };

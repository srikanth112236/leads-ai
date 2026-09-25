import { Router } from 'express';
import { LeadController } from './lead.controller';
import { authenticateToken, requireAnyPermission, requireRole } from '../../common/middleware/auth';
import { enforceTenantIsolation } from '../../common/middleware/tenant';
import { Role } from '../../common/types';
import { leadSourceRoutes } from '../lead-source/lead-source.routes';

const router = Router();

router.get('/', authenticateToken, requireAnyPermission('leads:read'), enforceTenantIsolation, LeadController.getAll);
router.get('/export', authenticateToken, requireAnyPermission('leads:export'), enforceTenantIsolation, LeadController.export);
router.post('/batch-assign', authenticateToken, requireAnyPermission('leads:assign'), LeadController.batchAssign);
router.post('/seed-demo', authenticateToken, requireRole(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.COMPANY_MANAGER), LeadController.seedDemoLeads);
router.get('/:id', authenticateToken, requireAnyPermission('leads:read'), LeadController.getById);
router.post('/', authenticateToken, requireAnyPermission('leads:create'), LeadController.create);
router.put('/:id', authenticateToken, requireAnyPermission('leads:update'), enforceTenantIsolation, LeadController.update);
router.delete('/:id', authenticateToken, requireAnyPermission('leads:delete'), enforceTenantIsolation, LeadController.remove);
router.get('/:id/sources', authenticateToken, LeadController.getSources);
router.get('/:id/tracker', authenticateToken, LeadController.getTrackerEvents);
router.post('/:id/assign', authenticateToken, requireAnyPermission('leads:assign'), enforceTenantIsolation, LeadController.assign);
router.get('/:id/conversations', authenticateToken, LeadController.getConversations);
router.get('/:id/notes', authenticateToken, LeadController.getNotes);
router.post('/:id/notes', authenticateToken, requireAnyPermission('leads:update'), enforceTenantIsolation, LeadController.addNote);
router.use('/:id/sources', leadSourceRoutes);

export { router as leadRoutes };

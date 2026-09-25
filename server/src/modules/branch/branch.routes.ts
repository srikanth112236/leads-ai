import { Router } from 'express';
import { BranchController } from './branch.controller';
import { authenticateToken, requireAnyPermission } from '../../common/middleware/auth';
import { enforceTenantIsolation } from '../../common/middleware/tenant';

const router = Router();

router.get('/', authenticateToken, requireAnyPermission('branches:read'), BranchController.getAll);
router.get('/:id', authenticateToken, requireAnyPermission('branches:read'), BranchController.getById);
router.post('/', authenticateToken, requireAnyPermission('branches:create'), BranchController.create);
router.put('/:id', authenticateToken, requireAnyPermission('branches:update'), enforceTenantIsolation, BranchController.update);
router.delete('/:id', authenticateToken, requireAnyPermission('branches:delete'), BranchController.remove);
router.get('/:id/users', authenticateToken, requireAnyPermission('branches:read', 'branches:team_manage', 'users:read'), BranchController.getUsers);
router.post('/:id/users', authenticateToken, requireAnyPermission('branches:team_manage'), BranchController.addUsers);
router.get('/:id/leads', authenticateToken, requireAnyPermission('branches:read', 'leads:read'), BranchController.getLeads);
router.get('/:id/stats', authenticateToken, requireAnyPermission('branches:read'), BranchController.getStats);

export { router as branchRoutes };

import { Router } from 'express';
import { BranchController } from './branch.controller';
import { authenticateToken, requireRole } from '../../common/middleware/auth';
import { enforceTenantIsolation } from '../../common/middleware/tenant';
import { Role } from '../../common/types';

const router = Router();

router.get('/', authenticateToken, requireRole(Role.SUPER_ADMIN, Role.COMPANY_ADMIN), BranchController.getAll);
router.get('/:id', authenticateToken, requireRole(Role.SUPER_ADMIN, Role.COMPANY_ADMIN), BranchController.getById);
router.post('/', authenticateToken, requireRole(Role.SUPER_ADMIN, Role.COMPANY_ADMIN), BranchController.create);
router.put('/:id', authenticateToken, requireRole(Role.SUPER_ADMIN, Role.COMPANY_ADMIN), enforceTenantIsolation, BranchController.update);
router.delete('/:id', authenticateToken, requireRole(Role.SUPER_ADMIN, Role.COMPANY_ADMIN), BranchController.remove);
router.get('/:id/users', authenticateToken, requireRole(Role.SUPER_ADMIN, Role.COMPANY_ADMIN), BranchController.getUsers);
router.get('/:id/leads', authenticateToken, requireRole(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.BRANCH_MANAGER), BranchController.getLeads);
router.get('/:id/stats', authenticateToken, requireRole(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.BRANCH_MANAGER), BranchController.getStats);

export { router as branchRoutes };

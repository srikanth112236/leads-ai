import { Router } from 'express';
import { CompanyController } from './company.controller';
import { authenticateToken, requireRole, requireRoleOrPermission } from '../../common/middleware/auth';
import { enforceTenantIsolation } from '../../common/middleware/tenant';
import { Role } from '../../common/types';

const router = Router();

router.get('/', authenticateToken, requireRole(Role.SUPER_ADMIN), CompanyController.getAll);
router.get('/:id', authenticateToken, requireRoleOrPermission([Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.COMPANY_MANAGER, Role.BRANCH_MANAGER], ['settings:read', 'settings:manage']), CompanyController.getById);
router.post('/', authenticateToken, requireRole(Role.SUPER_ADMIN), CompanyController.create);
router.put('/:id', authenticateToken, requireRoleOrPermission([Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.COMPANY_MANAGER], ['settings:manage']), enforceTenantIsolation, CompanyController.update);
router.delete('/:id', authenticateToken, requireRole(Role.SUPER_ADMIN), CompanyController.remove);
router.get('/:id/users', authenticateToken, requireRoleOrPermission([Role.COMPANY_ADMIN, Role.COMPANY_MANAGER], ['users:read']), CompanyController.getUsers);
router.get('/:id/branches', authenticateToken, requireRoleOrPermission([Role.COMPANY_ADMIN, Role.COMPANY_MANAGER], ['branches:read']), CompanyController.getBranches);
router.get('/:id/integrations', authenticateToken, requireRoleOrPermission([Role.COMPANY_ADMIN, Role.COMPANY_MANAGER], ['integrations:read', 'integrations:manage', 'meta:manage']), CompanyController.getIntegrations);
router.get('/:id/settings', authenticateToken, requireRoleOrPermission([Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.COMPANY_MANAGER, Role.BRANCH_MANAGER], ['settings:read', 'settings:manage']), CompanyController.getSettings);
router.put('/:id/settings', authenticateToken, requireRoleOrPermission([Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.COMPANY_MANAGER], ['settings:manage']), enforceTenantIsolation, CompanyController.updateSettings);

export { router as companyRoutes };

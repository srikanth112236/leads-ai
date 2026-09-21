import { Router } from 'express';
import { CompanyController } from './company.controller';
import { authenticateToken, requireRole } from '../../common/middleware/auth';
import { enforceTenantIsolation } from '../../common/middleware/tenant';
import { Role } from '../../common/types';

const router = Router();

router.get('/', authenticateToken, requireRole(Role.SUPER_ADMIN), CompanyController.getAll);
router.get('/:id', authenticateToken, requireRole(Role.SUPER_ADMIN), CompanyController.getById);
router.post('/', authenticateToken, requireRole(Role.SUPER_ADMIN), CompanyController.create);
router.put('/:id', authenticateToken, requireRole(Role.SUPER_ADMIN), enforceTenantIsolation, CompanyController.update);
router.delete('/:id', authenticateToken, requireRole(Role.SUPER_ADMIN), CompanyController.remove);
router.get('/:id/users', authenticateToken, requireRole(Role.COMPANY_ADMIN), CompanyController.getUsers);
router.get('/:id/branches', authenticateToken, requireRole(Role.COMPANY_ADMIN), CompanyController.getBranches);
router.get('/:id/integrations', authenticateToken, requireRole(Role.COMPANY_ADMIN), CompanyController.getIntegrations);

export { router as companyRoutes };

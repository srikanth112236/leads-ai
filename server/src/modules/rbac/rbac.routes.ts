import { Router } from 'express';
import { RbacController } from './rbac.controller';
import { authenticateToken, requireRole, requirePermission } from '../../common/middleware/auth';
import { Role } from '../../common/types';

const router = Router();

// Apply base authentication to all RBAC endpoints
router.use(authenticateToken);

// Read permissions catalog
router.get('/permissions', RbacController.getPermissions);

// Read available roles (allowed for role management or user creation/editing)
router.get('/roles', RbacController.getRoles);

// CRUD on Roles strictly for Default Admin (SUPER_ADMIN) or Company Admin (COMPANY_ADMIN)
router.post(
  '/roles',
  requireRole(Role.SUPER_ADMIN, Role.COMPANY_ADMIN),
  requirePermission('roles:create'),
  RbacController.createRole
);

router.put(
  '/roles/:id',
  requireRole(Role.SUPER_ADMIN, Role.COMPANY_ADMIN),
  requirePermission('roles:update'),
  RbacController.updateRole
);

router.delete(
  '/roles/:id',
  requireRole(Role.SUPER_ADMIN, Role.COMPANY_ADMIN),
  requirePermission('roles:delete'),
  RbacController.deleteRole
);

export const rbacRoutes = router;

import { Router } from 'express';
import { WebFormController } from './web-form.controller';
import { authenticateToken, requireRoleOrPermission } from '../../common/middleware/auth';
import { Role } from '../../common/types';

const router = Router();

const FORM_ROLES = [
  Role.SUPER_ADMIN,
  Role.COMPANY_ADMIN,
  Role.COMPANY_MANAGER,
  Role.BRANCH_MANAGER,
];
const FORM_READ_PERMS = ['integrations:read', 'integrations:manage', 'meta:manage'];
const FORM_MANAGE_PERMS = ['integrations:manage', 'meta:manage'];

router.get('/', authenticateToken, requireRoleOrPermission(FORM_ROLES, FORM_READ_PERMS), WebFormController.list);
router.get('/:id', authenticateToken, requireRoleOrPermission(FORM_ROLES, FORM_READ_PERMS), WebFormController.getById);
router.post('/', authenticateToken, requireRoleOrPermission(FORM_ROLES, FORM_MANAGE_PERMS), WebFormController.create);
router.put('/:id', authenticateToken, requireRoleOrPermission(FORM_ROLES, FORM_MANAGE_PERMS), WebFormController.update);
router.patch('/:id/status', authenticateToken, requireRoleOrPermission(FORM_ROLES, FORM_MANAGE_PERMS), WebFormController.toggleStatus);
router.delete('/:id', authenticateToken, requireRoleOrPermission(FORM_ROLES, FORM_MANAGE_PERMS), WebFormController.remove);

export { router as webFormRoutes };

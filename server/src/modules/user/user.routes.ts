import { Router } from 'express';
import { UserController } from './user.controller';
import { authenticateToken, requireAnyPermission } from '../../common/middleware/auth';

const router = Router();

router.get('/', authenticateToken, requireAnyPermission('users:read'), UserController.getAll);
router.get('/:id', authenticateToken, requireAnyPermission('users:read'), UserController.getOne);
router.post('/', authenticateToken, requireAnyPermission('users:create'), UserController.create);
router.put('/:id', authenticateToken, requireAnyPermission('users:update'), UserController.update);
router.delete('/:id', authenticateToken, requireAnyPermission('users:delete'), UserController.remove);

export { router as userRoutes };

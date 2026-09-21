import { Router } from 'express';
import { UserController } from './user.controller';
import { authenticateToken, requireRole } from '../../common/middleware/auth';
import { Role } from '../../common/types';

const MANAGERS = [Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.COMPANY_MANAGER, Role.BRANCH_MANAGER];
const WRITERS = [Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.COMPANY_MANAGER];

const router = Router();

router.get('/', authenticateToken, requireRole(...MANAGERS), UserController.getAll);
router.post('/', authenticateToken, requireRole(...WRITERS), UserController.create);
router.put('/:id', authenticateToken, requireRole(...WRITERS), UserController.update);
router.delete('/:id', authenticateToken, requireRole(...WRITERS), UserController.remove);

export { router as userRoutes };

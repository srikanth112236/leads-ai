import { Router } from 'express';
import { AuthController } from './auth.controller';
import { authenticateToken } from '../../common/middleware/auth';

const router = Router();

router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.post('/refresh', AuthController.refreshToken);
router.post('/forgot-password', AuthController.forgotPassword);
router.post('/reset-password', AuthController.resetPassword);
router.get('/me', authenticateToken, AuthController.getProfile);
router.put('/me', authenticateToken, AuthController.updateProfile);
router.put('/change-password', authenticateToken, AuthController.changePassword);

export { router as authRoutes };

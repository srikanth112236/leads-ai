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
// Concurrent-device sessions
router.get('/sessions', authenticateToken, AuthController.listSessions);
router.get('/sessions/pending', authenticateToken, AuthController.listPendingSessions);
router.get('/trusted-devices', authenticateToken, AuthController.listTrustedDevices);
router.delete('/trusted-devices/:deviceId', authenticateToken, AuthController.revokeTrustedDevice);
router.post('/sessions/:id/trust', authenticateToken, AuthController.trustSession);
router.get('/login-requests', authenticateToken, AuthController.loginRequests);
router.get('/security/overview', authenticateToken, AuthController.securityOverview);
router.post('/users/:id/extend-access', authenticateToken, AuthController.extendAccess);
router.delete('/sessions/others', authenticateToken, AuthController.revokeOtherSessions);
router.delete('/sessions/:id', authenticateToken, AuthController.revokeSession);
router.get('/sessions/pending/:id', AuthController.pendingSessionStatus);
router.post('/sessions/:id/allow', authenticateToken, AuthController.allowSession);
router.post('/sessions/:id/deny', authenticateToken, AuthController.denySession);

export { router as authRoutes };

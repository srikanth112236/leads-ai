import { Router } from 'express';
import { WebhookController } from './webhook.controller';
import { webhookLimiter } from '../../common/middleware/rateLimiter';
import { authenticateToken } from '../../common/middleware/auth';

const router = Router();

router.get('/meta', webhookLimiter, WebhookController.verifyMeta);
router.post('/meta', webhookLimiter, WebhookController.handleMeta);
router.get('/whatsapp', webhookLimiter, WebhookController.verifyWhatsApp);
router.post('/whatsapp', webhookLimiter, WebhookController.handleWhatsApp);
router.get('/trace', authenticateToken, WebhookController.getTrace);
router.post('/:id/retry', authenticateToken, WebhookController.retryEvent);
router.get('/:id', authenticateToken, WebhookController.getById);
router.get('/', authenticateToken, WebhookController.getAll);

export { router as webhookRoutes };

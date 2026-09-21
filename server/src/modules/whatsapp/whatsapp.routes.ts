import { Router } from 'express';
import { WebhookController } from '../webhook/webhook.controller';
import { webhookLimiter } from '../../common/middleware/rateLimiter';

const router = Router();

router.get('/whatsapp', webhookLimiter, WebhookController.verifyWhatsApp);
router.post('/whatsapp', webhookLimiter, WebhookController.handleWhatsApp);

export { router as whatsappRoutes };

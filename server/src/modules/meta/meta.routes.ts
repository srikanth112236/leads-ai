import { Router } from 'express';
import { WebhookController } from '../webhook/webhook.controller';
import { webhookLimiter } from '../../common/middleware/rateLimiter';

const router = Router();

router.get('/meta', webhookLimiter, WebhookController.verifyMeta);
router.post('/meta', webhookLimiter, WebhookController.handleMeta);

export { router as metaRoutes };

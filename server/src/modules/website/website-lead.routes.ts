import { Router } from 'express';
import { WebsiteLeadController } from './website-lead.controller';
import { publicLimiter } from '../../common/middleware/rateLimiter';

const router = Router();

// Public routes for website lead generation & embed forms
router.get('/forms/:formIdOrKey', publicLimiter, WebsiteLeadController.getPublicForm);
router.post('/forms/:formIdOrKey/submit', publicLimiter, WebsiteLeadController.submit);
router.post('/leads', publicLimiter, WebsiteLeadController.submit);

export { router as websiteLeadRoutes };

import { Router } from 'express';
import { WebsiteLeadController } from './website-lead.controller';
import { publicLimiter } from '../../common/middleware/rateLimiter';

const router = Router();

router.post('/leads', publicLimiter, WebsiteLeadController.submit);

export { router as websiteLeadRoutes };

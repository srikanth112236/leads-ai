import { Router } from 'express';
import { InboundLeadController } from './inbound-lead.controller';
import { authenticateToken } from '../../common/middleware/auth';

const router = Router();

router.post('/ingest', authenticateToken, InboundLeadController.ingest);
router.get('/ingest/:id', authenticateToken, InboundLeadController.getStatus);

export { router as inboundRoutes };

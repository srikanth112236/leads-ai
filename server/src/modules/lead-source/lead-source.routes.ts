import { Router } from 'express';
import { LeadSourceController } from './lead-source.controller';
import { authenticateToken } from '../../common/middleware/auth';

const router = Router();

router.get('/', authenticateToken, LeadSourceController.getAll);
router.get('/:leadId', authenticateToken, LeadSourceController.getByLead);

export { router as leadSourceRoutes };

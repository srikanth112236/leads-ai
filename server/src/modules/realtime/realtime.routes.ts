import { Router } from 'express';
import { RealtimeController } from './realtime.controller';

const router = Router();

// SSE stream endpoint - accepts ?token=jwt_token or Authorization: Bearer
router.get('/stream', RealtimeController.streamEvents);
router.get('/stats', RealtimeController.getStats);

export { router as realtimeRoutes };

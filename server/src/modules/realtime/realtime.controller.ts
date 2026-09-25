import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { RealtimeService } from './realtime.service';
import { logger } from '../../common/utils/logger';

export class RealtimeController {
  static streamEvents(req: Request, res: Response): void {
    // Authenticate via query param token (for standard EventSource) or Bearer header
    let token: string | undefined = req.query.token as string;
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      res.status(401).json({ error: 'Authentication token required for realtime stream', code: 'UNAUTHORIZED' });
      return;
    }

    const secret = process.env.JWT_SECRET || 'dev-secret-key-12345';
    let decoded: any;
    try {
      decoded = jwt.verify(token, secret);
    } catch (err) {
      res.status(401).json({ error: 'Invalid or expired token', code: 'INVALID_TOKEN' });
      return;
    }

    const companyId = decoded.companyId || (req.query.companyId as string) || '';
    const userId = decoded.userId || decoded.id;
    const isSuperAdmin = decoded.isSuperAdmin || decoded.role === 'SUPER_ADMIN';
    const allowedBranchIds = Array.isArray(decoded.allowedBranchIds)
      ? decoded.allowedBranchIds.map(String)
      : [];
    const role = typeof decoded.role === 'string' ? decoded.role : undefined;

    if (!companyId && !isSuperAdmin) {
      res.status(400).json({ error: 'Company context required', code: 'MISSING_COMPANY' });
      return;
    }

    // Set Server-Sent Events headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable proxy buffering for nginx
    });
    res.flushHeaders?.();

    const clientId = `${userId || 'anon'}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    RealtimeService.registerClient(clientId, res, companyId, userId, isSuperAdmin, allowedBranchIds, role);

    req.on('close', () => {
      RealtimeService.removeClient(clientId);
    });
  }

  static getStats(req: Request, res: Response): void {
    res.json({
      success: true,
      activeConnections: RealtimeService.getActiveCount(),
    });
  }
}

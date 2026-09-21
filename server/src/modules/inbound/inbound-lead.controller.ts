import { Request, Response } from 'express';
import { BaseController } from '../../common/controllers/BaseController';

export class InboundLeadController extends BaseController {
  static async ingest(req: Request, res: Response): Promise<void> {
    try {
      const { sourceType, payload } = req.body;
      if (!sourceType || !payload) {
        res.status(400).json({ error: 'Missing sourceType or payload', code: 'VALIDATION_ERROR' });
        return;
      }
      res.json({ success: true, data: { ingestId: `ingest_${Date.now()}`, status: 'queued', message: 'Ingestion queued' } });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'INGEST_ERROR' });
    }
  }

  static async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      res.json({ success: true, data: { id, status: 'completed' } });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }
}

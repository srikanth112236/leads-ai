import { Request, Response } from 'express';
import { WebhookEvent } from '../../common/models/WebhookEvent';
import { Lead } from '../../common/models/Lead';
import { LeadSource } from '../../common/models/LeadSource';
import { TrackerEvent } from '../../common/models/TrackerEvent';
import { logger } from '../../common/utils/logger';
import { BaseController } from '../../common/controllers/BaseController';
import { addMetaLeadJob, addWhatsAppJob } from '../queue/queue.config';
import * as crypto from 'crypto';

export class WebhookController extends BaseController {
  static async verifyMeta(req: Request, res: Response): Promise<void> {
    try {
      const mode = req.query['hub.mode'] as string;
      const token = req.query['hub.verify_token'] as string;
      const challenge = req.query['hub.challenge'] as string;
      const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN || '';

      if (mode === 'subscribe' && token === verifyToken && challenge) {
        res.status(200).send(challenge);
      } else {
        res.status(403).json({ error: 'Verification failed', code: 'WEBHOOK_VERIFY_FAILED' });
      }
    } catch (error) {
      res.status(403).json({ error: 'Verification failed', code: 'WEBHOOK_VERIFY_FAILED' });
    }
  }

  static async handleMeta(req: Request, res: Response): Promise<void> {
    try {
      const signature = req.headers['x-hub-signature-256'] as string;
      if (!signature) {
        logger.warn('Meta webhook missing signature');
        res.status(401).json({ error: 'Missing signature', code: 'INVALID_SIGNATURE' });
        return;
      }
      const payload = (req as any).rawBody ?? JSON.stringify(req.body);
      const expectedSig = 'sha256=' + crypto.createHmac('sha256', process.env.META_APP_SECRET || '').update(payload).digest('hex');
      const a = Buffer.from(signature);
      const b = Buffer.from(expectedSig);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        logger.warn('Meta webhook signature mismatch');
        res.status(401).json({ error: 'Invalid signature', code: 'INVALID_SIGNATURE' });
        return;
      }

      const entry = req.body?.entry?.[0];
      if (!entry) {
        res.status(400).json({ error: 'Invalid webhook payload', code: 'INVALID_PAYLOAD' });
        return;
      }

      const changes = entry.changes || [];
      for (const change of changes) {
        const { value } = change;
        if (value?.leadgen_id) {
          let event = await WebhookEvent.findOne({ provider: 'meta', externalEventId: value.leadgen_id });
          if (!event) {
            event = await WebhookEvent.create({
              provider: 'meta',
              eventType: 'leadgen',
              externalEventId: value.leadgen_id,
              payload: req.body,
              status: 'pending',
              attempts: 0,
              maxAttempts: 3,
              receivedAt: new Date(),
            });
          }
          try {
            await addMetaLeadJob({ webhookEventId: event._id.toString() });
          } catch (queueError) {
            logger.error('Failed to enqueue meta lead job (event persisted, will retry later)', { eventId: event._id });
          }
        }
      }

      res.status(200).json({ success: true, message: 'Webhook received' });
    } catch (error: any) {
      logger.error('Meta webhook handling error:', error);
      res.status(500).json({ error: error.message, code: 'WEBHOOK_ERROR' });
    }
  }

  static async verifyWhatsApp(req: Request, res: Response): Promise<void> {
    try {
      const mode = req.query['hub.mode'] as string;
      const token = req.query['hub.verify_token'] as string;
      const challenge = req.query['hub.challenge'] as string;
      const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || '';

      if (mode === 'subscribe' && token === verifyToken && challenge) {
        res.status(200).send(challenge);
      } else {
        res.status(403).json({ error: 'Verification failed', code: 'WEBHOOK_VERIFY_FAILED' });
      }
    } catch (error) {
      res.status(403).json({ error: 'Verification failed', code: 'WEBHOOK_VERIFY_FAILED' });
    }
  }

  static async handleWhatsApp(req: Request, res: Response): Promise<void> {
    try {
      const entry = req.body?.entry?.[0];
      if (!entry) {
        res.status(400).json({ error: 'Invalid webhook payload', code: 'INVALID_PAYLOAD' });
        return;
      }

      const value = entry?.changes?.[0]?.value || {};
      const externalEventId =
        value?.messages?.[0]?.id || value?.messages?.[0]?.message_id || value?.statuses?.[0]?.id || 'unknown';
      let event = await WebhookEvent.findOne({ provider: 'whatsapp', externalEventId });
      if (!event) {
        event = await WebhookEvent.create({
          provider: 'whatsapp',
          eventType: 'message',
          externalEventId,
          payload: req.body,
          status: 'pending',
          attempts: 0,
          maxAttempts: 3,
          receivedAt: new Date(),
        });
      }
      try {
        await addWhatsAppJob({ webhookEventId: event._id.toString() });
      } catch (queueError) {
        logger.error('Failed to enqueue whatsapp job (event persisted, will retry later)', { eventId: event._id });
      }

      res.status(200).json({ success: true, message: 'Webhook received' });
    } catch (error: any) {
      logger.error('WhatsApp webhook handling error:', error);
      res.status(500).json({ error: error.message, code: 'WEBHOOK_ERROR' });
    }
  }

  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const event = await WebhookEvent.findById(req.params.id).lean();
      if (!event) {
        res.status(404).json({ error: 'Event not found', code: 'NOT_FOUND' });
        return;
      }
      const user = (req as any).user;
      if (!user?.isSuperAdmin && event.companyId?.toString() !== user?.companyId) {
        res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
        return;
      }
      res.json({ success: true, data: event });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      const filter: Record<string, unknown> = {};
      if (!user?.isSuperAdmin) {
        if (!user?.companyId) {
          res.status(403).json({ error: 'Company context required', code: 'NO_COMPANY' });
          return;
        }
        filter.companyId = user.companyId;
      }
      if (req.query.provider) filter.provider = req.query.provider;
      if (req.query.status) filter.status = req.query.status;
      const page = parseInt((req.query.page as string) || '1');
      const limit = Math.min(parseInt((req.query.limit as string) || '20'), 100);
      const [events, total] = await Promise.all([
        WebhookEvent.find(filter).sort({ receivedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        WebhookEvent.countDocuments(filter),
      ]);
      res.status(200).json({ success: true, data: events, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  static async getTrace(req: Request, res: Response): Promise<void> {
    try {
      const { provider, externalEventId } = req.query as { provider?: string; externalEventId?: string };
      if (!provider || !externalEventId) {
        res.status(400).json({ error: 'provider and externalEventId are required', code: 'VALIDATION_ERROR' });
        return;
      }
      const event = await WebhookEvent.findOne({ provider, externalEventId }).lean();
      if (!event) {
        res.status(404).json({ error: 'Event not found', code: 'NOT_FOUND' });
        return;
      }
      const user = (req as any).user;
      if (!user?.isSuperAdmin && event.companyId?.toString() !== user?.companyId) {
        res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
        return;
      }
      const leadId = (event as any).leadId;
      const [lead, sources, trackerEvents] = await Promise.all([
        leadId ? Lead.findById(leadId).lean() : null,
        leadId ? LeadSource.find({ leadId }).lean() : [],
        leadId ? TrackerEvent.find({ leadId }).sort({ createdAt: 1 }).lean() : [],
      ]);
      const { captchaToken: _dropped, ...safePayload } = ((event as any).payload || {}) as Record<string, unknown>;
      res.json({
        success: true,
        data: {
          event: { ...(event as object), payload: safePayload },
          lead,
          sources,
          trackerEvents,
          duplicate: sources.length > 1,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'TRACE_ERROR' });
    }
  }
}

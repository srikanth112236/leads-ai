import { Request, Response } from 'express';
import { WebhookEvent } from '../../common/models/WebhookEvent';
import { Lead } from '../../common/models/Lead';
import { LeadSource } from '../../common/models/LeadSource';
import { TrackerEvent } from '../../common/models/TrackerEvent';
import { logger } from '../../common/utils/logger';
import { BaseController } from '../../common/controllers/BaseController';
import { addMetaLeadJob, addWhatsAppJob } from '../queue/queue.config';
import * as crypto from 'crypto';

/** Meta Lead Ads data expires 90 days after capture – replays after that are hopeless. */
export const LEAD_RECOVERABLE_DAYS = 90;

function recoverableUntil(event: { provider: string; eventType: string; receivedAt: Date }): Date | null {
  if (event.provider !== 'meta' || event.eventType !== 'leadgen' || !event.receivedAt) return null;
  return new Date(new Date(event.receivedAt).getTime() + LEAD_RECOVERABLE_DAYS * 24 * 60 * 60 * 1000);
}

function withRecovery(event: any): any {
  if (!event || typeof event !== 'object') return event;
  const until = recoverableUntil(event as any);
  return {
    ...event,
    recoverableUntil: until ? until.toISOString() : null,
    isExpired: until ? until.getTime() <= Date.now() : false,
  };
}

export class WebhookController extends BaseController {
  static async verifyMeta(req: Request, res: Response): Promise<void> {
    try {
      const mode = req.query['hub.mode'] as string;
      const token = req.query['hub.verify_token'] as string;
      const challenge = req.query['hub.challenge'] as string;
      const configuredToken = process.env.META_WEBHOOK_VERIFY_TOKEN || 'CRM_Secure_2026_!';

      if (mode === 'subscribe' && (token === configuredToken || token === 'CRM_Secure_2026_!') && challenge) {
        logger.info('Meta webhook verification handshake successful', { token });
        res.status(200).type('text/plain').send(challenge);
      } else {
        logger.warn('Meta webhook verification failed: token mismatch or missing challenge', {
          receivedToken: token,
          expectedToken: configuredToken,
          mode,
        });
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

      const entries = req.body?.entry || [];
      if (!Array.isArray(entries) || entries.length === 0) {
        res.status(400).json({ error: 'Invalid webhook payload: no entries', code: 'INVALID_PAYLOAD' });
        return;
      }

      const { MetaService } = await import('../meta/meta.service');

      for (const entry of entries) {
        const entryId = entry.id ? String(entry.id) : undefined;
        const changes = entry.changes || [];

        for (const change of changes) {
          const field = change?.field;
          const value = change?.value || {};

          // 1. Leadgen Webhook Notification (Instant Lead Form submission)
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
              logger.warn('Queue enqueue failed, falling back to direct targeted processing', { eventId: event._id });
              MetaService.ingestLeadEvent({ payload: req.body, externalEventId: value.leadgen_id }).catch((e) =>
                logger.error('Direct lead ingestion error:', e.message),
              );
            }
          }

          // 2. Ads Management Webhook Notification (Campaign/Ad created or updated)
          if (field === 'ads_management' || value?.campaign_id || value?.account_id) {
            const externalId = String(value.campaign_id || value.ad_id || entryId || Date.now());
            let event = await WebhookEvent.findOne({ provider: 'meta', externalEventId: externalId });
            if (!event) {
              event = await WebhookEvent.create({
                provider: 'meta',
                eventType: 'ads_management',
                externalEventId: externalId,
                payload: req.body,
                status: 'pending',
                attempts: 0,
                maxAttempts: 3,
                receivedAt: new Date(),
              });
            }

            // Non-blocking targeted campaign fetch
            const rawAcc = value.account_id ? String(value.account_id) : (entryId?.startsWith('act_') ? entryId : undefined);
            MetaService.resolveTenant({ adAccountId: rawAcc }).then(async (tenant) => {
              if (tenant && value?.campaign_id) {
                try {
                  await MetaService.syncSpecificCampaign(value.campaign_id, tenant.companyId, tenant.integrationId);
                  event!.status = 'processed';
                  event!.processedAt = new Date();
                  await event!.save();
                } catch (cErr: any) {
                  logger.warn('Targeted campaign sync warning:', cErr.message);
                }
              }
            }).catch((err) => logger.warn('Tenant resolution for ad account failed:', err.message));
          }
        }
      }

      res.status(200).json({ success: true, message: 'Webhook received and targeted sync initiated' });
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
      res.json({ success: true, data: withRecovery(event) });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      const filter: Record<string, unknown> = {};
      const queryCompanyId = req.query.companyId as string | undefined;
      if (!user?.isSuperAdmin) {
        if (!user?.companyId) {
          res.status(403).json({ error: 'Company context required', code: 'NO_COMPANY' });
          return;
        }
        if (queryCompanyId && queryCompanyId !== user.companyId) {
          res.status(403).json({ error: 'Cross-tenant access denied', code: 'TENANT_VIOLATION' });
          return;
        }
        filter.companyId = user.companyId;
      } else if (queryCompanyId) {
        filter.companyId = queryCompanyId;
      }
      if (req.query.provider) filter.provider = req.query.provider;
      if (req.query.status) filter.status = req.query.status;
      const page = parseInt((req.query.page as string) || '1');
      const limit = Math.min(parseInt((req.query.limit as string) || '20'), 100);
      const [events, total] = await Promise.all([
        WebhookEvent.find(filter).sort({ receivedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        WebhookEvent.countDocuments(filter),
      ]);
      res.status(200).json({ success: true, data: events.map(withRecovery), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  /**
   * POST /api/webhooks/:id/retry – re-queue a FAILED event (the DLQ replay).
   * Resets attempts and re-enqueues by provider. Meta leadgen events past the
   * 90-day recoverability window are rejected with 410.
   */
  static async retryEvent(req: Request, res: Response): Promise<void> {
    try {
      const event = await WebhookEvent.findById(req.params.id);
      if (!event) {
        res.status(404).json({ error: 'Event not found', code: 'NOT_FOUND' });
        return;
      }
      const user = (req as any).user;
      if (!user?.isSuperAdmin && event.companyId?.toString() !== user?.companyId) {
        res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
        return;
      }
      if (event.status !== 'failed') {
        res.status(400).json({ error: `Only failed events can be retried (current: ${event.status})`, code: 'NOT_FAILED' });
        return;
      }
      const until = recoverableUntil(event as any);
      if (until && until.getTime() <= Date.now()) {
        res.status(410).json({
          error: `Lead data expired – Meta purges leadgen payloads after ${LEAD_RECOVERABLE_DAYS} days`,
          code: 'RECOVERY_EXPIRED',
          recoverableUntil: until.toISOString(),
        });
        return;
      }
      // Atomic reset (updateOne): avoids re-validating untouched paths and
      // races with concurrent workers holding the same document.
      await WebhookEvent.updateOne(
        { _id: event._id },
        { $set: { status: 'pending', attempts: 0 }, $unset: { error: '', processedAt: '' } },
      );
      try {
        if (event.provider === 'meta') {
          await addMetaLeadJob({ webhookEventId: event._id.toString() });
        } else if (event.provider === 'whatsapp') {
          await addWhatsAppJob({ webhookEventId: event._id.toString() });
        } else {
          res.status(400).json({ error: `No replay handler for provider ${event.provider}`, code: 'NO_REPLAY_HANDLER' });
          return;
        }
      } catch (queueError) {
        logger.warn('Replay enqueue failed, event left pending for pickup', { eventId: event._id });
      }
      const refreshed = await WebhookEvent.findById(event._id).lean();
      logger.info('Webhook event queued for replay', { eventId: event._id, provider: event.provider });
      res.json({ success: true, data: withRecovery(refreshed) });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'RETRY_ERROR' });
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
          event: withRecovery({ ...(event as object), payload: safePayload }),
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

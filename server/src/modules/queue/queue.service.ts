import { WebhookEvent } from '../../common/models/WebhookEvent';
import { logger } from '../../common/utils/logger';
import { InboundLeadService } from '../inbound/inbound-lead.service';
import { MetaService } from '../meta/meta.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { NotificationService } from '../notification/notification.service';

const SOURCE_BY_PROVIDER: Record<string, string> = {
  meta: 'META_LEAD_ADS',
  whatsapp: 'WHATSAPP',
};

export class QueueService {
  static async processInboundLead(sourceType: string, payload: Record<string, unknown>, companyId?: string, branchId?: string) {
    try {
      const result = await InboundLeadService.ingest({ sourceType, payload, companyId, branchId });
      if (result.success && result.leadId && !result.isDuplicate) {
        await NotificationService.sendLeadCreatedNotification(result.leadId, companyId!, branchId);
      }
      return result;
    } catch (error) {
      logger.error('Queue service error:', error);
      throw error;
    }
  }

  static async processWebhookJob(provider: string, webhookEventId: string): Promise<void> {
    const event = await WebhookEvent.findById(webhookEventId);
    if (!event) {
      logger.warn('Webhook job for unknown event, skipping', { provider, webhookEventId });
      return;
    }
    if (event.status === 'processed') {
      logger.info('Webhook event already processed, skipping', { eventId: event._id });
      return;
    }
    event.status = 'processing';
    event.attempts += 1;
    await event.save();

    try {
      const sourceType = SOURCE_BY_PROVIDER[provider] || provider;
      let result;
      if (provider === 'meta') {
        result = await MetaService.ingestLeadEvent({ payload: event.payload, externalEventId: event.externalEventId });
      } else if (provider === 'whatsapp') {
        const wa = await WhatsAppService.ingestMessageEvent({ payload: event.payload, externalEventId: event.externalEventId });
        if (wa.handled === 'status') {
          event.status = 'processed';
          event.processedAt = new Date();
          await event.save();
          logger.info('WhatsApp statuses event processed (no lead work)', { eventId: event._id });
          return;
        }
        result = { success: true, leadId: wa.leadId, isDuplicate: wa.isDuplicate };
      } else {
        result = await InboundLeadService.ingest({
          sourceType,
          payload: event.payload,
          externalId: event.externalEventId,
        });
      }
      if (!result.success) {
        throw new Error(result.error || 'ingestion failed');
      }
      event.status = 'processed';
      event.processedAt = new Date();
      event.leadId = result.leadId as any;
      await event.save();
      if (!result.isDuplicate && result.leadId && event.companyId) {
        await NotificationService.sendLeadCreatedNotification(result.leadId, event.companyId.toString());
      }
      logger.info('Webhook job processed', { eventId: event._id, leadId: result.leadId, duplicate: result.isDuplicate });
    } catch (error: any) {
      // Permanent Meta faults (expired token, #200 permissions) can never
      // succeed on retry – fail fast instead of burning remaining attempts.
      const permanent = error?.name === 'MetaPermanentError';
      if (permanent) event.attempts = Math.max(event.attempts, event.maxAttempts);
      event.status = event.attempts >= event.maxAttempts ? 'failed' : 'pending';
      event.error = error.message;
      await event.save();
      logger.error('Webhook job failed', {
        eventId: event._id,
        attempt: event.attempts,
        permanent,
        error: error.message,
      });
      throw error;
    }
  }
}

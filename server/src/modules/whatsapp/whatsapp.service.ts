import { WhatsAppIntegration } from '../../common/models/WhatsAppIntegration';
import { decryptToken } from '../../common/security/tokenCrypto';
import { WhatsAppPhoneNumber } from '../../common/models/WhatsAppPhoneNumber';
import { Conversation } from '../../common/models/Conversation';
import { Message } from '../../common/models/Message';
import { InboundLeadService } from '../inbound/inbound-lead.service';
import { logger } from '../../common/utils/logger';

export interface WhatsAppTenant {
  companyId: string;
  branchId?: string;
  integrationId: string;
}

export interface WhatsAppIngestResult {
  handled: 'message' | 'status';
  leadId?: string;
  isDuplicate?: boolean;
}

function extractPayload(payload: Record<string, unknown>): {
  messages: any[];
  statuses: any[];
  phoneNumberId?: string;
} {
  const messages: any[] = [];
  const statuses: any[] = [];
  let phoneNumberId: string | undefined;
  const entries = ((payload as any).entry || []) as any[];
  for (const entry of entries) {
    for (const change of entry?.changes || []) {
      const value = change?.value || {};
      if (!phoneNumberId && value?.metadata?.phone_number_id) {
        phoneNumberId = String(value.metadata.phone_number_id);
      }
      if (Array.isArray(value?.messages)) messages.push(...value.messages);
      if (Array.isArray(value?.statuses)) statuses.push(...value.statuses);
    }
  }
  return { messages, statuses, phoneNumberId };
}

function messageContent(msg: any): string {  if (msg?.type === 'text' && msg?.text?.body) return String(msg.text.body);
  const caption = msg?.[msg?.type]?.caption;
  if (caption) return `[${msg.type}] ${caption}`;
  if (msg?.type) return `[${msg.type} message]`;
  return '[message]';
}

function isWindowError(err: { code?: number; message?: string } | undefined): boolean {
  if (!err) return false;
  if (err.code === 131047) return true; // Re-engagement outside the 24h window
  return /window|re-engagement|template/i.test(err.message || '');
}

export class WhatsAppService {
  static async resolveTenant(phoneNumberId?: string): Promise<WhatsAppTenant | null> {
    if (!phoneNumberId) return null;
    const number = await WhatsAppPhoneNumber.findOne({ phoneNumberId, status: 'active' }).lean();
    if (!number) return null;
    return {
      companyId: number.companyId.toString(),
      branchId: number.branchId?.toString(),
      integrationId: number.integrationId.toString(),
    };
  }

  static async ingestMessageEvent(event: {
    payload: Record<string, unknown>;
    externalEventId: string;
  }): Promise<WhatsAppIngestResult> {
    const { messages, statuses, phoneNumberId } = extractPayload(event.payload);
    if (messages.length === 0) {
      logger.info('WhatsApp statuses-only event, no lead work', { count: statuses.length });
      return { handled: 'status' };
    }
    const tenant = await this.resolveTenant(phoneNumberId);
    if (!tenant) {
      throw new Error(`no tenant mapping for WhatsApp number ${phoneNumberId || '?'}`);
    }
    let firstLeadId: string | undefined;
    let firstDuplicate = false;
    for (const msg of messages) {
      const messageId = msg?.id || msg?.message_id || event.externalEventId;
      const result = await InboundLeadService.ingest({
        sourceType: 'WHATSAPP',
        payload: { name: `WhatsApp ${msg?.from || 'Unknown'}`, phone: msg?.from, text: messageContent(msg), message_id: messageId, wa_type: msg?.type },
        companyId: tenant.companyId,
        branchId: tenant.branchId,
        externalId: String(messageId),
      });
      if (!result.success || !result.leadId) {
        throw new Error(result.error || 'whatsapp ingestion failed');
      }
      firstLeadId = firstLeadId || result.leadId;
      firstDuplicate = firstDuplicate || !!result.isDuplicate;

      let conversation = await Conversation.findOne({ leadId: result.leadId, channel: 'whatsapp', status: 'active' });
      if (!conversation) {
        conversation = new Conversation({
          leadId: result.leadId,
          companyId: tenant.companyId,
          branchId: tenant.branchId,
          channel: 'whatsapp',
          status: 'active',
        });
        await conversation.save();
      }
      await Message.create({
        conversationId: conversation._id,
        leadId: result.leadId,
        companyId: tenant.companyId,
        branchId: tenant.branchId,
        direction: 'inbound',
        sender: 'customer',
        content: messageContent(msg),
        channel: 'whatsapp',
        metadata: { messageId: String(messageId), waType: msg?.type, timestamp: msg?.timestamp },
      });
    }
    return { handled: 'message', leadId: firstLeadId, isDuplicate: firstDuplicate };
  }

  static async sendMessage(
    phoneNumber: string,
    message: string,
    integrationId: string,
    opts: {
      leadId?: string;
      phoneNumberId?: string;
      template?: { name: string; language?: string };
    } = {},
  ): Promise<{ success: boolean; messageId?: string; via?: 'text' | 'template'; error?: string }> {
    try {
      const integration = await WhatsAppIntegration.findById(integrationId).select('+accessToken');
      const accessToken = decryptToken(integration?.accessToken);
      if (!integration || !accessToken) {
        return { success: false, error: 'whatsapp integration not configured' };
      }
      const phoneNumberId = opts.phoneNumberId || integration.phoneNumberId;
      if (!phoneNumberId) {
        return { success: false, error: 'no WhatsApp phone_number_id configured' };
      }
      const version = process.env.WHATSAPP_GRAPH_VERSION || process.env.META_GRAPH_VERSION || 'v25.0';
      const url = `https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`;

      const post = async (body: Record<string, unknown>) => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 10000);
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal: ctrl.signal,
          });
          return { ok: res.ok, data: (await res.json()) as Record<string, unknown> };
        } finally {
          clearTimeout(timer);
        }
      };

      const textBody = { messaging_product: 'whatsapp', to: phoneNumber, type: 'text', text: { body: message } };
      let sent = await post(textBody);
      let via: 'text' | 'template' = 'text';

      const err = sent.data?.error as { code?: number; message?: string } | undefined;
      const template = opts.template || ((integration.metadata as any)?.template as { name: string; language?: string } | undefined);
      if (!sent.ok && isWindowError(err) && template?.name) {
        logger.info('Outside messaging window, retrying with template', { template: template.name });
        sent = await post({
          messaging_product: 'whatsapp',
          to: phoneNumber,
          type: 'template',
          template: { name: template.name, language: { code: template.language || 'en_US' } },
        });
        via = 'template';
      }

      if (!sent.ok) {
        const finalErr = sent.data?.error as { code?: number; message?: string } | undefined;
        logger.error('WhatsApp send failed', { code: finalErr?.code, message: finalErr?.message });
        return { success: false, error: finalErr?.message || `send failed (${via})` };
      }
      const messageId = ((sent.data?.messages as any[])?.[0]?.id as string) || undefined;

      if (opts.leadId) {
        const { Lead } = await import('../../common/models/Lead');
        const lead = await Lead.findById(opts.leadId);
        if (lead) {
          let conversation = await Conversation.findOne({ leadId: lead._id, channel: 'whatsapp', status: 'active' });
          if (!conversation) {
            conversation = new Conversation({
              leadId: lead._id,
              companyId: lead.companyId,
              branchId: lead.branchId,
              channel: 'whatsapp',
              status: 'active',
            });
            await conversation.save();
          }
          await Message.create({
            conversationId: conversation._id,
            leadId: lead._id,
            companyId: lead.companyId,
            branchId: lead.branchId,
            direction: 'outbound',
            sender: 'agent',
            content: message,
            channel: 'whatsapp',
            metadata: { messageId, via },
          });
        }
      }
      return { success: true, messageId, via };
    } catch (error: any) {
      logger.error('Failed to send WhatsApp message:', error?.message || error);
      return { success: false, error: error?.message || 'send failed' };
    }
  }
}

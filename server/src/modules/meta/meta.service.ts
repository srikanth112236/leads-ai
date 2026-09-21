import { MetaIntegration } from '../../common/models/MetaIntegration';
import { decryptToken } from '../../common/security/tokenCrypto';
import { MetaLeadForm } from '../../common/models/MetaLeadForm';
import { MetaPage } from '../../common/models/MetaPage';
import { WebhookEvent } from '../../common/models/WebhookEvent';
import { InboundLeadService, IngestionResult } from '../inbound/inbound-lead.service';
import { mapMetaLeadToIngest } from './meta-lead.mapper';
import { logger } from '../../common/utils/logger';

export interface MetaTenant {
  companyId: string;
  branchId?: string;
  integrationId: string;
}

export const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v25.0';
const GRAPH_TIMEOUT_MS = 10000;

export class MetaService {
  static async processWebhookEvent(payload: Record<string, unknown>): Promise<void> {
    try {
      const entry = (payload as any).entry?.[0];
      const changes = (entry as any)?.changes || [];
      for (const change of changes) {
        const value = (change as any).value;
        if (value?.leadgen_id) {
          await WebhookEvent.create({
            provider: 'meta',
            eventType: 'leadgen',
            externalEventId: value.leadgen_id,
            payload,
            status: 'pending',
            attempts: 0,
            maxAttempts: 3,
            receivedAt: new Date(),
          });
          await InboundLeadService.ingest({
            sourceType: 'META_LEAD_ADS',
            payload,
            externalId: value.leadgen_id,
          });
        }
      }
    } catch (error) {
      logger.error('Meta service processing error:', error);
    }
  }

  static extractIds(payload: Record<string, unknown>): { leadgenId?: string; pageId?: string; formId?: string } {
    const entries = ((payload as any).entry || []) as any[];
    for (const entry of entries) {
      for (const change of entry?.changes || []) {
        const value = change?.value || {};
        if (value.leadgen_id) {
          return { leadgenId: String(value.leadgen_id), pageId: value.page_id ? String(value.page_id) : undefined, formId: value.form_id ? String(value.form_id) : undefined };
        }
      }
    }
    return {};
  }

  static async resolveTenant(formId?: string, pageId?: string): Promise<MetaTenant | null> {
    if (formId) {
      const form = await MetaLeadForm.findOne({ metaFormId: formId, status: 'active' }).lean();
      if (form) {
        const page = await MetaPage.findOne({ metaPageId: form.metaPageId, status: 'active' }).lean();
        if (page) {
          return {
            companyId: form.companyId.toString(),
            branchId: form.branchId?.toString(),
            integrationId: page.integrationId.toString(),
          };
        }
      }
    }
    if (pageId) {
      const page = await MetaPage.findOne({ metaPageId: pageId, status: 'active' }).lean();
      if (page) {
        return { companyId: page.companyId.toString(), branchId: page.branchId?.toString(), integrationId: page.integrationId.toString() };
      }
    }
    return null;
  }

  static async ingestLeadEvent(event: { payload: Record<string, unknown>; externalEventId: string }): Promise<IngestionResult> {
    const { leadgenId, pageId, formId } = this.extractIds(event.payload);
    const id = leadgenId || event.externalEventId;
    const tenant = await this.resolveTenant(formId, pageId);
    if (!tenant) {
      throw new Error(`no tenant mapping for form ${formId || '?'} / page ${pageId || '?'}`);
    }
    const leadJson = await this.retrieveLead(id, tenant.integrationId);
    if (!leadJson) {
      throw new Error(`lead retrieval failed for ${id}`);
    }
    const mapped = mapMetaLeadToIngest(leadJson);
    return InboundLeadService.ingest({
      sourceType: 'META_LEAD_ADS',
      payload: {
        name: mapped.name,
        email: mapped.email,
        phone: mapped.phone,
        company: mapped.company,
        message: mapped.message,
        ...mapped.meta,
      },
      companyId: tenant.companyId,
      branchId: tenant.branchId,
      externalId: id,
    });
  }

  static async retrieveLead(leadgenId: string, integrationId: string): Promise<Record<string, unknown> | null> {
    try {
      const integration = await MetaIntegration.findById(integrationId).select('+accessToken');
      const accessToken = decryptToken(integration?.accessToken);
      if (!integration || !accessToken) {
        logger.error('Meta integration not found or no access token', { integrationId });
        return null;
      }
      const fields = 'created_time,id,ad_id,form_id,field_data,custom_disclaimer_responses';
      const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(leadgenId)}?fields=${fields}`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), GRAPH_TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: ctrl.signal,
        });
        const data = (await res.json()) as Record<string, unknown>;
        if (!res.ok) {
          const err = data.error as { message?: string; code?: number } | undefined;
          logger.error('Meta Graph API lead retrieval failed', { leadgenId, code: err?.code, message: err?.message });
          return null;
        }
        return data;
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      logger.error('Failed to retrieve Meta lead:', error);
      return null;
    }
  }

  static async verifyWebhookSignature(payload: string, signature: string): Promise<boolean> {
    const crypto = require('crypto');
    const expected = 'sha256=' + crypto.createHmac('sha256', process.env.META_APP_SECRET || '').update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }
}

import { MetaIntegration } from '../../common/models/MetaIntegration';
import { decryptToken } from '../../common/security/tokenCrypto';
import { MetaLeadForm } from '../../common/models/MetaLeadForm';
import { MetaAdAccount } from '../../common/models/MetaAdAccount';
import { MetaPage } from '../../common/models/MetaPage';
import { LeadSource } from '../../common/models/LeadSource';
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
    const result = await InboundLeadService.ingest({
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
    // Best-effort ad creative preview — never fails the ingestion.
    if (result.success && result.leadId) {
      try {
        const adId = (leadJson as any).ad_id ? String((leadJson as any).ad_id) : undefined;
        if (adId) {
          const preview = await this.getAdPreview(adId, tenant.integrationId);
          if (preview) {
            await LeadSource.findOneAndUpdate(
              { leadId: result.leadId, sourceType: 'META_LEAD_ADS', externalId: id },
              { $set: { 'metadata.adCreativeId': preview.creativeId, 'metadata.adPreview': preview.iframe } },
            );
          }
        }
      } catch (previewError) {
        logger.warn('Ad preview fetch failed (non-blocking)', { adId: (leadJson as any).ad_id });
      }
    }
    return result;
  }

  static async getAdPreview(adId: string, integrationId: string): Promise<{ creativeId: string; iframe: string } | null> {
    try {
      const integration = await MetaIntegration.findById(integrationId).select('+accessToken');
      const accessToken = decryptToken(integration?.accessToken);
      if (!accessToken) return null;
      const headers = { Authorization: `Bearer ${accessToken}` };
      const adRes = await fetch(
        `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(adId)}?fields=creative`,
        { headers, signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS) },
      );
      const adData = (await adRes.json().catch(() => ({}))) as any;
      const creativeId = adData?.creative?.id ? String(adData.creative.id) : undefined;
      if (!adRes.ok || !creativeId) return null;
      const pvRes = await fetch(
        `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(creativeId)}/previews?ad_format=DESKTOP_FEED_STANDARD`,
        { headers, signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS) },
      );
      const pvData = (await pvRes.json().catch(() => ({}))) as any;
      const iframe = pvData?.data?.[0]?.body ? String(pvData.data[0].body) : undefined;
      if (!pvRes.ok || !iframe) return null;
      return { creativeId, iframe };
    } catch (error) {
      logger.warn('Ad preview fetch failed:', error);
      return null;
    }
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

  static async syncAdAccounts(companyId: string): Promise<{ synced: number }> {
    const integration = await MetaIntegration.findOne({ companyId, status: 'active' }).select('+accessToken');
    const accessToken = decryptToken(integration?.accessToken);
    if (!integration || !accessToken) {
      throw new Error('no active Meta connection for this company');
    }
    const fields = 'id,name,account_status,amount_spent,currency,timezone_name,business_name,business{id,name}';
    const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/me/adaccounts?fields=${fields}&access_token=${encodeURIComponent(accessToken)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), GRAPH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        throw new Error(data?.error?.message || 'ad account sync rejected by Meta');
      }
      const accounts = Array.isArray(data?.data) ? data.data : [];
      for (const ad of accounts) {
        const rawId = String(ad.id || '');
        const metaAdAccountId = rawId.startsWith('act_') ? rawId : `act_${rawId}`;
        await MetaAdAccount.findOneAndUpdate(
          { metaAdAccountId },
          {
            metaAdAccountId,
            companyId,
            integrationId: integration._id,
            name: ad.name,
            accountStatus: typeof ad.account_status === 'number' ? ad.account_status : undefined,
            amountSpent: ad.amount_spent != null ? String(ad.amount_spent) : undefined,
            currency: ad.currency,
            timezone: ad.timezone_name,
            businessName: ad.business_name,
            ownerBusinessId: ad.business?.id ? String(ad.business.id) : undefined,
            lastSyncedAt: new Date(),
            status: 'active',
          },
          { upsert: true, runValidators: true },
        );
      }
      await this.syncLeadForms(companyId, integration._id.toString(), accessToken);
      await this.ensurePrimaryPages(companyId, integration._id.toString(), accessToken, accounts);
      return { synced: accounts.length };
    } finally {
      clearTimeout(timer);
    }
  }

  // Baseline mapping: a business's primary_page always gets a MetaPage row
  // (pending, unassigned) so tenant resolution has a fallback even before the
  // admin maps branches. Never overwrites an existing mapping.
  static async ensurePrimaryPages(companyId: string, integrationId: string, accessToken: string, accounts: any[]): Promise<void> {
    const { MetaPage } = await import('../../common/models/MetaPage');
    const businessIds = [...new Set(accounts.map((a) => a?.business?.id).filter(Boolean).map(String))];
    for (const businessId of businessIds) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), GRAPH_TIMEOUT_MS);
        try {
          const res = await fetch(
            `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(businessId)}?fields=primary_page`,
            { headers: { Authorization: `Bearer ${accessToken}` }, signal: ctrl.signal },
          );
          const data = (await res.json().catch(() => ({}))) as any;
          const primaryId = data?.primary_page?.id ? String(data.primary_page.id) : undefined;
          if (!res.ok || !primaryId) continue;
          await MetaPage.findOneAndUpdate(
            { metaPageId: primaryId },
            {
              $setOnInsert: {
                metaPageId: primaryId,
                companyId,
                integrationId,
                name: data?.primary_page?.name,
                status: 'pending',
              },
            },
            { upsert: true, runValidators: true },
          );
        } finally {
          clearTimeout(timer);
        }
      } catch (error) {
        logger.warn('Primary page lookup failed (non-blocking)', { businessId });
      }
    }
  }

  static async syncLeadForms(companyId: string, integrationId: string, accessToken: string): Promise<{ forms: number }> {
    const { MetaLeadForm } = await import('../../common/models/MetaLeadForm');
    const { MetaPage } = await import('../../common/models/MetaPage');
    const pages = await MetaPage.find({ companyId }).select('metaPageId').lean();
    let forms = 0;
    for (const page of pages) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), GRAPH_TIMEOUT_MS);
      try {
        const res = await fetch(
          `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(page.metaPageId)}/leadgen_forms?fields=id,name,status`,
          { headers: { Authorization: `Bearer ${accessToken}` }, signal: ctrl.signal },
        );
        const data = (await res.json().catch(() => ({}))) as any;
        if (!res.ok || !Array.isArray(data?.data)) continue;
        for (const form of data.data) {
          await MetaLeadForm.findOneAndUpdate(
            { metaFormId: String(form.id) },
            {
              $set: {
                metaFormId: String(form.id),
                metaPageId: page.metaPageId,
                pageRef: page._id,
                companyId,
                name: form.name,
              },
              $setOnInsert: { status: 'inactive' },
            },
            { upsert: true, runValidators: true },
          );
          forms++;
        }
      } finally {
        clearTimeout(timer);
      }
    }
    // Baseline: pages discovered only via business primary_page fallback stay pending
    // until a Company Admin assigns them to a branch in the UI.
    return { forms };
  }

  static async verifyWebhookSignature(payload: string, signature: string): Promise<boolean> {
    const crypto = require('crypto');
    const expected = 'sha256=' + crypto.createHmac('sha256', process.env.META_APP_SECRET || '').update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }
}

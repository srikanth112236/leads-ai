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

/** Failure kind for Meta Graph errors – drives retry vs fail-fast decisions. */
export type MetaFailureKind = 'permanent' | 'transient';

/** Thrown when a Meta call can never succeed on retry (auth/permission/validation). */
export class MetaPermanentError extends Error {
  code = 'META_PERMANENT';
  metaCode?: number;
  constructor(message: string, metaCode?: number) {
    super(message);
    this.name = 'MetaPermanentError';
    this.metaCode = metaCode;
  }
}

/**
 * Classify a Meta Graph failure. Permanent: token (190), permissions
 * (#200/298), app-level (10) and validation (100) errors, plus HTTP
 * 400/401/403/404. Everything else – 5xx, rate limits (4/17/32/613/80004),
 * network faults, timeouts – is transient and worth retrying.
 */
export function classifyMetaFailure(
  err?: { code?: number; message?: string } | null,
  httpStatus?: number,
): MetaFailureKind {
  const code = Number((err as any)?.code);
  if (code === 190 || code === 200 || code === 298 || code === 100 || code === 10) return 'permanent';
  if (httpStatus === 400 || httpStatus === 401 || httpStatus === 403 || httpStatus === 404) return 'permanent';
  return 'transient';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

  static extractIds(payload: Record<string, unknown>): {
    leadgenId?: string;
    pageId?: string;
    formId?: string;
    adAccountId?: string;
    campaignId?: string;
    adId?: string;
    field?: string;
  } {
    const entries = ((payload as any).entry || []) as any[];
    for (const entry of entries) {
      const entryId = entry.id ? String(entry.id) : undefined;
      for (const change of entry?.changes || []) {
        const field = change?.field;
        const value = change?.value || {};
        if (value.leadgen_id) {
          return {
            field: 'leadgen',
            leadgenId: String(value.leadgen_id),
            pageId: value.page_id ? String(value.page_id) : entryId,
            formId: value.form_id ? String(value.form_id) : undefined,
          };
        }
        if (field === 'ads_management' || value.account_id || value.campaign_id || value.ad_id) {
          const rawAcc = value.account_id ? String(value.account_id) : (entryId?.startsWith('act_') ? entryId : undefined);
          return {
            field: 'ads_management',
            adAccountId: rawAcc,
            campaignId: value.campaign_id ? String(value.campaign_id) : undefined,
            adId: value.ad_id ? String(value.ad_id) : undefined,
          };
        }
      }
      if (entryId?.startsWith('act_')) {
        return {
          field: 'ads_management',
          adAccountId: entryId,
        };
      }
    }
    return {};
  }

  static async resolveTenant(
    formIdOrOpts?: string | { formId?: string; pageId?: string; adAccountId?: string; campaignId?: string },
    legacyPageId?: string,
  ): Promise<MetaTenant | null> {
    let formId: string | undefined;
    let pageId: string | undefined;
    let adAccountId: string | undefined;
    let campaignId: string | undefined;

    if (typeof formIdOrOpts === 'object' && formIdOrOpts !== null) {
      formId = formIdOrOpts.formId;
      pageId = formIdOrOpts.pageId;
      adAccountId = formIdOrOpts.adAccountId;
      campaignId = formIdOrOpts.campaignId;
    } else {
      formId = formIdOrOpts;
      pageId = legacyPageId;
    }

    if (formId) {
      const form = await MetaLeadForm.findOne({ metaFormId: formId, status: 'active' }).lean();
      if (form) {
        const page = await MetaPage.findOne({ metaPageId: form.metaPageId, status: 'active' }).lean();
        if (page) {
          return {
            companyId: form.companyId.toString(),
            branchId: form.branchId?.toString() || page.branchId?.toString() || await this.defaultBranch(form.companyId.toString()),
            integrationId: page.integrationId.toString(),
          };
        }
      }
    }
    if (campaignId) {
      const { MetaCampaign } = await import('../../common/models/MetaCampaign');
      const campaign = await MetaCampaign.findOne({ campaignId }).lean();
      if (campaign) {
        const { MetaIntegration } = await import('../../common/models/MetaIntegration');
        const activeIntegration = await MetaIntegration.findOne({ companyId: campaign.companyId, status: 'active' }).lean();
        if (activeIntegration) {
          return {
            companyId: campaign.companyId.toString(),
            branchId: campaign.branchId?.toString() || await this.defaultBranch(campaign.companyId.toString()),
            integrationId: activeIntegration._id.toString(),
          };
        }
      }
    }
    if (pageId) {
      const page = await MetaPage.findOne({ metaPageId: pageId, status: 'active' }).lean();
      if (page) {
        return {
          companyId: page.companyId.toString(),
          branchId: page.branchId?.toString() || await this.defaultBranch(page.companyId.toString()),
          integrationId: page.integrationId.toString(),
        };
      }
    }
    if (adAccountId) {
      const formatted = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
      const account = await MetaAdAccount.findOne({ metaAdAccountId: formatted, status: 'active' }).lean();
      if (account) {
        return {
          companyId: account.companyId.toString(),
          branchId: (account as any).branchId?.toString() || await this.defaultBranch(account.companyId.toString()),
          integrationId: account.integrationId.toString(),
        };
      }
    }
    return null;
  }

  // Explicit opt-in fallback: only when the company admin set a default branch.
  // Otherwise null (fail closed — no guessing across tenants).
  static async defaultBranch(companyId: string): Promise<string | undefined> {
    const { Company } = await import('../../common/models/Company');
    const company = await Company.findById(companyId).select('defaultBranchId').lean();
    return (company as any)?.defaultBranchId?.toString();
  }

  static async ingestLeadEvent(event: { payload: Record<string, unknown>; externalEventId: string }): Promise<IngestionResult> {
    const { leadgenId, pageId, formId } = this.extractIds(event.payload);
    const id = leadgenId || event.externalEventId;
    const tenant = await this.resolveTenant({ formId, pageId });
    if (!tenant) {
      throw new Error(`no tenant mapping for form ${formId || '?'} / page ${pageId || '?'}`);
    }
    const retrieved = await this.retrieveLeadDetailed(id, tenant.integrationId);
    const leadJson = retrieved.data;
    if (!leadJson) {
      if (retrieved.kind === 'permanent') {
        throw new MetaPermanentError(`lead retrieval failed permanently for ${id}: ${retrieved.error}`);
      }
      throw new Error(`lead retrieval failed for ${id}`);
    }

    // Campaign-level branch resolution:
    // Route lead to the campaign's specific branch assignment if configured
    let effectiveBranchId = tenant.branchId;
    const campaignId = (leadJson as any).campaign_id ? String((leadJson as any).campaign_id) : undefined;
    const adId = (leadJson as any).ad_id ? String((leadJson as any).ad_id) : undefined;

    const { MetaCampaign } = await import('../../common/models/MetaCampaign');
    if (campaignId) {
      const camp = await MetaCampaign.findOne({ campaignId, companyId: tenant.companyId }).lean();
      if (camp?.branchId) {
        effectiveBranchId = camp.branchId.toString();
      }
    } else if (adId) {
      const camp = await MetaCampaign.findOne({ companyId: tenant.companyId, 'ads.adId': adId }).lean();
      if (camp?.branchId) {
        effectiveBranchId = camp.branchId.toString();
      }
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
      branchId: effectiveBranchId,
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

      // Instant real-time broadcast to connected CRM UI clients
      try {
        const { Lead } = await import('../../common/models/Lead');
        const { RealtimeService } = await import('../realtime/realtime.service');
        const fullLead = await Lead.findById(result.leadId).populate('assignedTo', 'name email').populate('branchId', 'name').lean();
        if (fullLead) {
          RealtimeService.broadcastToCompany(tenant.companyId, {
            type: 'LEAD_CREATED',
            payload: fullLead,
          });
        }
      } catch (rtErr) {
        logger.warn('Realtime broadcast for lead failed (non-blocking)', { error: rtErr });
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

  static async retrieveLead(
    leadgenId: string,
    integrationId: string,
    opts?: { maxRetries?: number; baseDelayMs?: number },
  ): Promise<Record<string, unknown> | null> {
    const detailed = await this.retrieveLeadDetailed(leadgenId, integrationId, opts);
    return detailed.data;
  }

  /**
   * Lead-details GET with exponential-backoff retry on transient faults.
   * Permanent faults (expired token, #200 permissions, validation) fail fast
   * and are reported with kind:'permanent' so callers stop burning retries.
   */
  static async retrieveLeadDetailed(
    leadgenId: string,
    integrationId: string,
    opts?: { maxRetries?: number; baseDelayMs?: number },
  ): Promise<{ data: Record<string, unknown> | null; kind?: MetaFailureKind; error?: string }> {
    const maxRetries = Math.max(0, opts?.maxRetries ?? 3);
    const baseDelayMs = opts?.baseDelayMs ?? 1000;
    try {
      const integration = await MetaIntegration.findById(integrationId).select('+accessToken');
      const accessToken = decryptToken(integration?.accessToken);
      if (!integration || !accessToken) {
        logger.error('Meta integration not found or no access token', { integrationId });
        return { data: null, kind: 'permanent', error: 'missing integration or access token' };
      }
      if (Array.isArray(integration.scopes) && integration.scopes.length > 0 && !integration.scopes.includes('leads_retrieval')) {
        logger.warn('Meta integration lacks leads_retrieval permission; skipping retrieveLead', { integrationId });
        return { data: null, kind: 'permanent', error: 'lacks leads_retrieval permission' };
      }
      const fields = 'created_time,id,ad_id,ad_name,form_id,campaign_id,campaign_name,adset_id,adset_name,field_data,custom_disclaimer_responses';
      const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(leadgenId)}?fields=${fields}`;
      let attempt = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), GRAPH_TIMEOUT_MS);
        try {
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: ctrl.signal,
          });
          const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
          if (res.ok) return { data };
          const err = (data as any)?.error as { message?: string; code?: number } | undefined;
          const kind = classifyMetaFailure(err, res.status);
          if (kind === 'permanent' || attempt >= maxRetries) {
            logger.error('Meta Graph API lead retrieval failed', {
              leadgenId,
              code: err?.code,
              message: err?.message,
              kind,
              attempt: attempt + 1,
            });
            return { data: null, kind, error: err?.message || `HTTP ${res.status}` };
          }
          logger.warn('Meta lead retrieval transient fault, retrying', {
            leadgenId,
            code: err?.code,
            attempt: attempt + 1,
          });
        } catch (error: any) {
          if (attempt >= maxRetries) {
            logger.error('Failed to retrieve Meta lead:', error?.message || error);
            return { data: null, kind: 'transient', error: error?.message || 'network fault' };
          }
          logger.warn('Meta lead retrieval network fault, retrying', { leadgenId, attempt: attempt + 1 });
        } finally {
          clearTimeout(timer);
        }
        attempt += 1;
        const delay = Math.min(baseDelayMs * 2 ** (attempt - 1) + Math.random() * 500, 15000);
        await sleep(delay);
      }
    } catch (error: any) {
      logger.error('Failed to retrieve Meta lead:', error?.message || error);
      return { data: null, kind: 'transient', error: error?.message || 'unknown fault' };
    }
  }

  static async syncAdAccounts(
    companyId: string,
    targetIntegrationId?: string,
  ): Promise<{
    synced: number;
    integrations: Array<{
      integrationId: string;
      label?: string;
      status: 'success' | 'failed';
      synced: number;
      error?: string;
      actionRequired?: boolean;
    }>;
    warnings: string[];
  }> {
    const filter: any = { companyId, status: 'active' };
    if (targetIntegrationId) {
      filter._id = targetIntegrationId;
    }
    const integrations = await MetaIntegration.find(filter).select('+accessToken');
    if (integrations.length === 0) {
      throw new Error('no active Meta connection for this company');
    }
    let total = 0;
    const integrationResults: Array<{
      integrationId: string;
      label?: string;
      status: 'success' | 'failed';
      synced: number;
      error?: string;
      actionRequired?: boolean;
    }> = [];
    const warnings: string[] = [];

    for (const integration of integrations) {
      const integrationLabel = integration.label || (integration.portfolioBusinessId ? `Portfolio ${integration.portfolioBusinessId}` : 'Meta Account');
      try {
        const count = await this.syncAdAccountsForIntegration(companyId, integration);
        total += count;
        integrationResults.push({
          integrationId: integration._id.toString(),
          label: integrationLabel,
          status: 'success',
          synced: count,
        });

        await MetaIntegration.findByIdAndUpdate(integration._id, {
          $set: {
            'metadata.lastSyncError': null,
            'metadata.lastSyncStatus': 'success',
            'metadata.actionRequired': false,
            'metadata.lastSyncedAt': new Date(),
          },
        });
      } catch (err: any) {
        const isPermissionError =
          /Missing Permissions|OAuthException|#200|permission/i.test(err?.message || '');
        const errorMsg = err?.message || 'Sync failed';
        logger.error(`Meta sync failed for integration ${integrationLabel} (${integration._id}):`, errorMsg);

        await MetaIntegration.findByIdAndUpdate(integration._id, {
          $set: {
            'metadata.lastSyncError': errorMsg,
            'metadata.lastSyncStatus': 'failed',
            'metadata.actionRequired': isPermissionError,
            'metadata.lastSyncedAt': new Date(),
          },
        });

        integrationResults.push({
          integrationId: integration._id.toString(),
          label: integrationLabel,
          status: 'failed',
          synced: 0,
          error: errorMsg,
          actionRequired: isPermissionError,
        });

        if (isPermissionError) {
          warnings.push(
            `Integration "${integrationLabel}" encountered (#200) Missing Permissions. Re-authentication with Ad Account permissions is required.`,
          );
        } else {
          warnings.push(`Integration "${integrationLabel}": ${errorMsg}`);
        }
      }
    }

    return { synced: total, integrations: integrationResults, warnings };
  }

  private static async tryFetchPortfolioAdAccounts(
    portfolioBusinessId: string | undefined,
    accessToken: string,
    fields: string,
    signal: AbortSignal,
  ): Promise<any[]> {
    if (!portfolioBusinessId) return [];
    const accountsMap = new Map<string, any>();
    for (const endpoint of ['owned_ad_accounts', 'client_ad_accounts']) {
      try {
        const res = await fetch(
          `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(portfolioBusinessId)}/${endpoint}?fields=${fields}&access_token=${encodeURIComponent(accessToken)}`,
          { signal },
        );
        const data = (await res.json().catch(() => ({}))) as any;
        if (res.ok && Array.isArray(data?.data)) {
          for (const acc of data.data) {
            accountsMap.set(String(acc.id), acc);
          }
        }
      } catch {
        // Ignore individual portfolio queries
      }
    }
    return Array.from(accountsMap.values());
  }

  private static async syncAdAccountsForIntegration(companyId: string, integration: any): Promise<number> {
    const accessToken = decryptToken(integration?.accessToken);
    if (!accessToken) return 0;
    if (Array.isArray(integration?.scopes) && integration.scopes.length > 0 && !integration.scopes.includes('ads_read') && !integration.scopes.includes('ads_management')) {
      logger.warn(`Integration ${integration._id} lacks ads_read / ads_management permissions; skipping ad accounts sync`);
      return 0;
    }
    const baseFields = 'id,name,account_status,amount_spent,currency,timezone_name,business_name';
    const fullFields = `${baseFields},business{id,name}`;
    const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/me/adaccounts?fields=${fullFields}&access_token=${encodeURIComponent(accessToken)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), GRAPH_TIMEOUT_MS);
    let accounts: any[] = [];
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        const msg = data?.error?.message || '';
        // business_management is a newer/optional grant: retry without the
        // business object so accounts still sync for older tokens.
        if (res.status === 400 && /business_management/i.test(msg)) {
          logger.warn('Token lacks business_management; syncing accounts without owner business');
          const retry = await fetch(
            `https://graph.facebook.com/${META_GRAPH_VERSION}/me/adaccounts?fields=${baseFields}&access_token=${encodeURIComponent(accessToken)}`,
            { signal: ctrl.signal },
          );
          const retryData = (await retry.json().catch(() => ({}))) as any;
          if (!retry.ok) {
            accounts = await this.tryFetchPortfolioAdAccounts(integration.portfolioBusinessId, accessToken, baseFields, ctrl.signal);
            if (accounts.length === 0) {
              throw new Error(retryData?.error?.message || 'ad account sync rejected by Meta');
            }
          } else {
            accounts = Array.isArray(retryData?.data) ? retryData.data : [];
          }
        } else if (/Missing Permissions|#200/i.test(msg) && integration.portfolioBusinessId) {
          // If /me/adaccounts returned #200, check if this token owns portfolio ad accounts
          accounts = await this.tryFetchPortfolioAdAccounts(integration.portfolioBusinessId, accessToken, baseFields, ctrl.signal);
          if (accounts.length === 0) {
            throw new Error(data?.error?.message || 'ad account sync rejected by Meta');
          }
        } else {
          if (integration.portfolioBusinessId) {
            accounts = await this.tryFetchPortfolioAdAccounts(integration.portfolioBusinessId, accessToken, baseFields, ctrl.signal);
          }
          if (accounts.length === 0) {
            throw new Error(data?.error?.message || 'ad account sync rejected by Meta');
          }
        }
      } else {
        accounts = Array.isArray(data?.data) ? data.data : [];
      }

      // If accounts is empty and portfolioBusinessId is present, attempt portfolio accounts fallback
      if (accounts.length === 0 && integration.portfolioBusinessId) {
        const portfolioAccounts = await this.tryFetchPortfolioAdAccounts(integration.portfolioBusinessId, accessToken, baseFields, ctrl.signal);
        if (portfolioAccounts.length > 0) {
          accounts = portfolioAccounts;
        }
      }

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
            ownerBusinessId: ad.business?.id ? String(ad.business.id) : (integration.portfolioBusinessId || undefined),
            lastSyncedAt: new Date(),
            status: 'active',
          },
          { upsert: true, runValidators: true },
        );
      }

      // Scoped lead forms sync: only for pages belonging to THIS integration
      try {
        await this.syncLeadForms(companyId, integration._id.toString(), accessToken);
      } catch (formErr: any) {
        logger.warn(`Lead forms sync warning for integration ${integration._id}:`, formErr?.message);
      }

      try {
        await this.ensurePrimaryPages(companyId, integration._id.toString(), accessToken, accounts);
      } catch (pageErr: any) {
        logger.warn(`Primary page lookup warning for integration ${integration._id}:`, pageErr?.message);
      }

      return accounts.length;
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
    const integration = await MetaIntegration.findById(integrationId).select('scopes').lean();
    if (Array.isArray(integration?.scopes) && integration.scopes.length > 0 && !integration.scopes.includes('leads_retrieval')) {
      logger.warn(`Integration ${integrationId} lacks leads_retrieval permission; skipping lead forms sync`);
      return { forms: 0 };
    }
    // Scoped to this integration so token is only used on its own pages
    const pages = await MetaPage.find({ companyId, integrationId, status: { $ne: 'inactive' } }).select('metaPageId').lean();
    let forms = 0;
    for (const page of pages) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), GRAPH_TIMEOUT_MS);
      try {
        const res = await fetch(
          `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(page.metaPageId)}/leadgen_forms?fields=id,name,status,created_time,locale`,
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
      } catch (err: any) {
        logger.warn(`Failed to sync leadgen forms for page ${page.metaPageId}:`, err?.message);
      } finally {
        clearTimeout(timer);
      }
    }
    return { forms };
  }

  static async debugToken(integrationId: string): Promise<{
    isValid: boolean;
    appId?: string;
    expiresAt?: Date;
    scopes?: string[];
    granularScopes?: Array<{ scope: string; target_ids?: string[] }>;
    adAccountIds?: string[];
    targetBusinessId?: string;
    error?: string;
  }> {
    const integration = await MetaIntegration.findById(integrationId).select('+accessToken');
    if (!integration) {
      throw new Error('Integration not found');
    }
    const token = decryptToken(integration.accessToken);
    if (!token) {
      return { isValid: false, error: 'No access token found on integration' };
    }
    const appId = process.env.META_APP_ID || integration.appId;
    const appSecret = process.env.META_APP_SECRET;
    if (!appId || !appSecret) {
      return { isValid: true, error: 'Meta App ID or Secret not configured to debug token' };
    }

    try {
      const url = `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`;
      const res = await fetch(url);
      const body = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !body?.data) {
        return { isValid: false, error: body?.error?.message || 'Token debug failed' };
      }
      const data = body.data;
      return {
        isValid: Boolean(data.is_valid),
        appId: data.app_id,
        expiresAt: data.expires_at ? new Date(data.expires_at * 1000) : undefined,
        scopes: Array.isArray(data.scopes) ? data.scopes : [],
        granularScopes: Array.isArray(data.granular_scopes) ? data.granular_scopes : [],
        adAccountIds: Array.isArray(data.metadata?.ad_account_ids) ? data.metadata.ad_account_ids : [],
        targetBusinessId: data.target_ids?.[0] || integration.portfolioBusinessId,
      };
    } catch (err: any) {
      return { isValid: false, error: err?.message || 'Debug token call failed' };
    }
  }

  static async companyToken(companyId: string, integrationId?: string): Promise<string> {
    let integration = null;
    if (integrationId) {
      integration = await MetaIntegration.findOne({ _id: integrationId, companyId, status: 'active' }).select('+accessToken');
    }
    if (!integration) {
      integration = await MetaIntegration.findOne({ companyId, status: 'active' }).select('+accessToken');
    }
    const token = decryptToken(integration?.accessToken);
    if (!token) throw new Error('no active Meta connection for this company');
    return token;
  }

  static extractLeadsCount(actions: any): string {
    if (!Array.isArray(actions)) return '0';
    const found = actions.find((a: any) => String(a?.action_type || '').includes('lead'));
    return found?.value != null ? String(found.value) : '0';
  }

  static async getCampaigns(
    adAccountDbId: string,
    companyId: string,
    datePreset = 'maximum',
    timeRange?: { since: string; until: string },
  ): Promise<any[]> {
    const { MetaAdAccount } = await import('../../common/models/MetaAdAccount');
    const account = await MetaAdAccount.findById(adAccountDbId);
    if (!account || account.companyId.toString() !== companyId) {
      throw new Error('ad account not found for this company');
    }

    const insightParam = timeRange?.since && timeRange?.until
      ? `time_range={"since":"${timeRange.since}","until":"${timeRange.until}"}`
      : `date_preset(${datePreset || 'maximum'})`;

    const fields = `name,status,objective,effective_status,account_id,insights.${insightParam}{spend,reach,impressions,results,actions,cost_per_result,cpc,cpm,ctr,inline_link_clicks}`;

    const integrations = await MetaIntegration.find({ companyId, status: 'active' }).select('+accessToken');
    if (!integrations.length) throw new Error('no active Meta connection for this company');

    if (account.integrationId) {
      integrations.sort((a, b) => {
        if (a._id.toString() === account.integrationId.toString()) return -1;
        if (b._id.toString() === account.integrationId.toString()) return 1;
        return 0;
      });
    }

    let lastError: any = null;
    for (const integration of integrations) {
      const token = decryptToken(integration.accessToken);
      if (!token) continue;
      const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(account.metaAdAccountId)}/campaigns?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), GRAPH_TIMEOUT_MS);
      try {
        const res = await fetch(url, { signal: ctrl.signal });
        const data = (await res.json().catch(() => ({}))) as any;
        if (!res.ok) {
          lastError = new Error(data?.error?.message || 'campaign fetch rejected by Meta');
          continue;
        }
        const rawCampaigns = Array.isArray(data?.data) ? data.data : [];
        const { MetaCampaign } = await import('../../common/models/MetaCampaign');
        const cIds = rawCampaigns.map((c: any) => String(c.id));
        const storedCampaigns = await MetaCampaign.find({ companyId, campaignId: { $in: cIds } }).lean();
        const campaignMap = new Map<string, any>(storedCampaigns.map((sc: any) => [String(sc.campaignId), sc]));

        // Background bulk sync to persist campaigns
        if (rawCampaigns.length > 0) {
          MetaCampaign.bulkWrite(
            rawCampaigns.map((c: any) => ({
              updateOne: {
                filter: { companyId, campaignId: String(c.id) },
                update: {
                  $setOnInsert: {
                    campaignId: String(c.id),
                    companyId,
                    adAccountId: account._id,
                    metaAdAccountId: account.metaAdAccountId,
                    branchId: (account as any).branchId || undefined,
                  },
                  $set: {
                    name: c.name,
                    status: c.status,
                    effectiveStatus: c.effective_status || c.status,
                    objective: c.objective,
                  },
                },
                upsert: true,
              },
            }))
          ).catch(() => {});
        }

        return rawCampaigns.map((c: any) => {
          const insightRow = (Array.isArray(c.insights) ? c.insights[0] : c.insights?.data?.[0]) || {};
          const actions = Array.isArray(insightRow.actions) ? insightRow.actions : [];
          const findAction = (type: string) => {
            const hit = actions.find((a: any) => String(a?.action_type || '') === type);
            return hit?.value != null ? String(hit.value) : '0';
          };
          const stored = campaignMap.get(String(c.id));
          return {
            id: c.id,
            name: c.name,
            status: c.status,
            effectiveStatus: c.effective_status || c.status,
            objective: c.objective,
            branchId: stored?.branchId?.toString() || (account as any).branchId?.toString() || undefined,
            adAccountId: account._id.toString(),
            metaAdAccountId: account.metaAdAccountId,
            metrics: {
              spend: insightRow.spend || '0',
              reach: insightRow.reach || '0',
              impressions: insightRow.impressions || '0',
              leads: this.extractLeadsCount(actions.length > 0 ? actions : insightRow.results),
              inlineLinkClicks: insightRow.inline_link_clicks || findAction('link_click'),
              cpc: insightRow.cpc || '0',
              cpm: insightRow.cpm || '0',
              ctr: insightRow.ctr || '0',
              costPerResult: this.extractCostPerResult(insightRow.cost_per_result),
            },
          };
        });
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError || new Error('campaign fetch rejected by Meta');
  }

  static async getCampaignAds(
    campaignId: string,
    companyId: string,
    datePreset = 'maximum',
    timeRange?: { since: string; until: string },
  ): Promise<any[]> {
    const integrations = await MetaIntegration.find({ companyId, status: 'active' }).select('+accessToken');
    if (!integrations.length) throw new Error('no active Meta connection for this company');

    const insightParam = timeRange?.since && timeRange?.until
      ? `time_range={"since":"${timeRange.since}","until":"${timeRange.until}"}`
      : `date_preset=${datePreset || 'maximum'}`;

    let lastError: any = null;
    for (const integration of integrations) {
      const token = decryptToken(integration.accessToken);
      if (!token) continue;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), GRAPH_TIMEOUT_MS);
      try {
        const adsRes = await fetch(
          `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(campaignId)}/ads` +
            `?fields=id,name,status,created_time,effective_status,creative{id,name,title,body,image_url,thumbnail_url,object_story_spec}&access_token=${encodeURIComponent(token)}`,
          { signal: ctrl.signal },
        );
        const adsData = (await adsRes.json().catch(() => ({}))) as any;
        if (!adsRes.ok) {
          lastError = new Error(adsData?.error?.message || 'ads fetch rejected by Meta');
          continue;
        }
        const ads = Array.isArray(adsData?.data) ? adsData.data : [];
        return await Promise.all(
          ads.map(async (ad: any) => {
            let metrics: Record<string, string> = { impressions: '0', reach: '0', spend: '0', ctr: '0', leads: '0' };
            try {
              const inRes = await fetch(
                `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(ad.id)}/insights` +
                  `?fields=impressions,reach,frequency,spend,cpc,cpp,cpm,ctr,inline_link_clicks,results,cost_per_result,actions,video_p25_watched_actions,video_p100_watched_actions&${insightParam}&access_token=${encodeURIComponent(token)}`,
                { signal: ctrl.signal },
              );
              const inData = (await inRes.json().catch(() => ({}))) as any;
              const ins = inData?.data?.[0];
              if (inRes.ok && ins) {
                const actions = Array.isArray(ins.actions) ? ins.actions : [];
                const findAction = (type: string) => {
                  const hit = actions.find((a: any) => String(a?.action_type || '') === type);
                  return hit?.value != null ? String(hit.value) : '0';
                };
                metrics = {
                  impressions: ins.impressions || '0',
                  reach: ins.reach || '0',
                  frequency: ins.frequency || '0',
                  spend: ins.spend || '0',
                  clicks: ins.clicks || ins.inline_link_clicks || '0',
                  inlineLinkClicks: ins.inline_link_clicks || '0',
                  cpc: ins.cpc || '0',
                  cpp: ins.cpp || '0',
                  cpm: ins.cpm || '0',
                  ctr: ins.ctr || '0',
                  results: Array.isArray(ins.results) ? String(ins.results[0]?.values?.[0]?.value || '0') : '0',
                  costPerResult: this.extractCostPerResult(ins.cost_per_result),
                  leads: this.extractLeadsCount(actions.length > 0 ? actions : ins.results),
                  postEngagement: findAction('post_engagement'),
                  videoWatched25: findAction('video_p25_watched_actions'),
                  videoWatched100: findAction('video_p100_watched_actions'),
                };
              }
            } catch {
              // per-ad metrics are best-effort
            }
            let preview: string | undefined;
            let previewIframeUrl: string | undefined;
            try {
              const creativeId = ad?.creative?.id ? String(ad.creative.id) : undefined;
              if (creativeId) {
                const pvRes = await fetch(
                  `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(creativeId)}/previews?ad_format=DESKTOP_FEED_STANDARD&access_token=${encodeURIComponent(token)}`,
                  { signal: ctrl.signal },
                );
                const pvData = (await pvRes.json().catch(() => ({}))) as any;
                if (pvRes.ok && pvData?.data?.[0]?.body) {
                  preview = String(pvData.data[0].body);
                  const iframeMatch = preview.match(/src="([^"]+)"/);
                  if (iframeMatch) {
                    previewIframeUrl = iframeMatch[1].replace(/&amp;/g, '&');
                  }
                }
              }
            } catch {
              // preview is best-effort
            }

            const spec = ad.creative?.object_story_spec;
            const resolvedImg = ad.creative?.image_url ||
              ad.creative?.thumbnail_url ||
              spec?.video_data?.image_url ||
              spec?.link_data?.picture ||
              spec?.link_data?.image_crops?.[0] ||
              undefined;
            const headline = spec?.link_data?.name || spec?.video_data?.title || ad.creative?.title || ad.name;
            const callToAction = spec?.link_data?.call_to_action?.type || spec?.video_data?.call_to_action?.type || 'APPLY_NOW';
            const leadGenFormId = spec?.link_data?.call_to_action?.value?.lead_gen_form_id || spec?.video_data?.call_to_action?.value?.lead_gen_form_id || undefined;

            return {
              id: String(ad.id),
              name: typeof ad.name === 'string' ? ad.name : (ad.name?.text || JSON.stringify(ad.name || '')),
              status: String(ad.status || ''),
              effectiveStatus: String(ad.effective_status || ad.status || ''),
              createdTime: ad.created_time,
              headline,
              callToAction,
              leadGenFormId,
              creative: ad.creative ? {
                id: ad.creative.id ? String(ad.creative.id) : undefined,
                name: typeof ad.creative.name === 'string' ? ad.creative.name : (ad.creative.name?.text || (ad.creative.name ? JSON.stringify(ad.creative.name) : undefined)),
                body: typeof ad.creative.body === 'string' ? ad.creative.body : (ad.creative.body?.text || ad.creative.body?.message || (ad.creative.body ? JSON.stringify(ad.creative.body) : undefined)),
                imageUrl: resolvedImg,
              } : undefined,
              metrics,
              preview,
              previewIframeUrl,
            };
          }),
        );
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError || new Error('failed to fetch campaign ads from Meta');
  }

  static async getAdLeads(adId: string, companyId: string, fallbackFormId?: string): Promise<any[]> {
    const integrations = await MetaIntegration.find({ companyId, status: 'active' }).select('+accessToken');
    if (!integrations.length) throw new Error('no active Meta connection for this company');

    let leadsData: any = null;
    let lastError: any = null;

    for (const integration of integrations) {
      const token = decryptToken(integration.accessToken);
      if (!token) continue;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), GRAPH_TIMEOUT_MS);
      try {
        const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(adId)}/leads?fields=id,created_time,field_data,ad_id,ad_name,form_id&access_token=${encodeURIComponent(token)}`;
        const res = await fetch(url, { signal: ctrl.signal });
        const data = (await res.json().catch(() => ({}))) as any;
        if (!res.ok) {
          lastError = new Error(data?.error?.message || 'failed to fetch leads for ad');
          // If ad endpoint fails and fallbackFormId exists, attempt /{form_id}/leads
          if (fallbackFormId) {
            try {
              const formUrl = `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(fallbackFormId)}/leads?fields=id,created_time,field_data,ad_id,ad_name,form_id&access_token=${encodeURIComponent(token)}`;
              const fRes = await fetch(formUrl, { signal: ctrl.signal });
              const fData = (await fRes.json().catch(() => ({}))) as any;
              if (fRes.ok && Array.isArray(fData?.data)) {
                leadsData = fData.data.filter((l: any) => !l.ad_id || String(l.ad_id) === String(adId));
                break;
              }
            } catch {
              // fallback best-effort
            }
          }
          continue;
        }
        leadsData = Array.isArray(data?.data) ? data.data : [];
        if (leadsData.length === 0 && fallbackFormId) {
          try {
            const formUrl = `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(fallbackFormId)}/leads?fields=id,created_time,field_data,ad_id,ad_name,form_id&access_token=${encodeURIComponent(token)}`;
            const fRes = await fetch(formUrl, { signal: ctrl.signal });
            const fData = (await fRes.json().catch(() => ({}))) as any;
            if (fRes.ok && Array.isArray(fData?.data) && fData.data.length > 0) {
              const matched = fData.data.filter((l: any) => !l.ad_id || String(l.ad_id) === String(adId));
              if (matched.length > 0) leadsData = matched;
            }
          } catch {
            // fallback best-effort
          }
        }
        break;
      } finally {
        clearTimeout(timer);
      }
    }

    if (!leadsData) {
      throw lastError || new Error('failed to fetch leads from Meta');
    }

    const leadIds = leadsData.map((l: any) => String(l.id));
    const { Lead } = await import('../../common/models/Lead');
    const existingLeads = await Lead.find({
      companyId,
      $or: [
        { 'externalIds.meta': { $in: leadIds } },
        { 'externalIds.META_LEAD_ADS': { $in: leadIds } },
        { 'metadata.leadgenId': { $in: leadIds } },
      ],
    }).select('_id externalIds metadata name email phone').lean();

    const existingMap = new Map<string, any>();
    for (const el of existingLeads) {
      const ext =
        (el as any).externalIds?.META_LEAD_ADS ||
        (el as any).externalIds?.meta ||
        (el as any).metadata?.leadgenId;
      if (ext) existingMap.set(String(ext), el);
    }

    return leadsData.map((raw: any) => {
      const mapped = mapMetaLeadToIngest(raw);
      const existing = existingMap.get(String(raw.id));
      return {
        id: raw.id,
        createdTime: raw.created_time,
        name: mapped.name || 'Unnamed Lead',
        email: mapped.email || '',
        phone: mapped.phone || '',
        company: mapped.company || '',
        message: mapped.message || '',
        adId: raw.ad_id,
        adName: raw.ad_name,
        formId: raw.form_id,
        customFields: mapped.meta?.customFields || {},
        fieldData: raw.field_data || [],
        inCrm: !!existing,
        crmLeadId: existing?._id?.toString() || null,
      };
    });
  }

  static async getCampaignLeads(campaignId: string, companyId: string): Promise<any[]> {
    const ads = await this.getCampaignAds(campaignId, companyId);
    if (!ads.length) return [];

    const leadsPromises = ads.map(async (ad: any) => {
      try {
        return await this.getAdLeads(ad.id, companyId, ad.leadGenFormId);
      } catch (err: any) {
        logger.warn(`Failed to fetch leads for ad ${ad.id}: ${err.message}`);
        return [];
      }
    });

    const results = await Promise.all(leadsPromises);
    const flattened = results.flat();
    return flattened.sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime());
  }

  static async importLeadToCrm(
    leadId: string,
    companyId: string,
    branchId?: string,
    extra?: {
      campaignId?: string;
      campaignName?: string;
      adId?: string;
      adName?: string;
      formId?: string;
      tags?: string[];
    },
  ): Promise<any> {
    const integrations = await MetaIntegration.find({ companyId, status: 'active' }).select('+accessToken');
    if (!integrations.length) throw new Error('no active Meta connection for this company');

    let leadData: any = null;
    let lastError: any = null;

    for (const integration of integrations) {
      const token = decryptToken(integration.accessToken);
      if (!token) continue;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), GRAPH_TIMEOUT_MS);
      try {
        const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(leadId)}?fields=id,created_time,field_data,ad_id,ad_name,form_id&access_token=${encodeURIComponent(token)}`;
        const res = await fetch(url, { signal: ctrl.signal });
        const data = (await res.json().catch(() => ({}))) as any;
        if (!res.ok) {
          lastError = new Error(data?.error?.message || 'failed to fetch lead');
          continue;
        }
        leadData = data;
        break;
      } finally {
        clearTimeout(timer);
      }
    }

    if (!leadData) throw lastError || new Error('lead not found on Meta');

    const mapped = mapMetaLeadToIngest(leadData);
    const customFields = (mapped.meta?.customFields as Record<string, unknown>) || {};
    const effectiveAdName = extra?.adName || leadData.ad_name;
    const effectiveCampaignName = extra?.campaignName;

    const tags = Array.from(
      new Set(
        [
          'Meta Ads',
          'Facebook Lead',
          effectiveCampaignName ? `Campaign: ${effectiveCampaignName}` : undefined,
          effectiveAdName ? `Ad: ${effectiveAdName}` : undefined,
          ...(Array.isArray(extra?.tags) ? extra.tags : []),
        ].filter(Boolean) as string[],
      ),
    );

    const ingestPayload: Record<string, unknown> = {
      name: mapped.name || 'Meta Lead',
      email: mapped.email,
      phone: mapped.phone,
      company: mapped.company,
      message: mapped.message,
      leadgenId: leadData.id,
      adId: leadData.ad_id || extra?.adId,
      adName: effectiveAdName,
      campaignId: extra?.campaignId,
      campaignName: effectiveCampaignName,
      formId: leadData.form_id || extra?.formId,
      tags,
      ...customFields,
    };

    let effectiveBranchId = branchId;
    if (!effectiveBranchId && extra?.campaignId) {
      const { MetaCampaign } = await import('../../common/models/MetaCampaign');
      const camp = await MetaCampaign.findOne({ companyId, campaignId: extra.campaignId }).lean();
      if (camp?.branchId) effectiveBranchId = camp.branchId.toString();
    }

    const result = await InboundLeadService.ingest({
      sourceType: 'META_LEAD_ADS',
      payload: ingestPayload,
      companyId,
      branchId: effectiveBranchId,
      externalId: String(leadData.id),
    });

    return result;
  }

  static async assignCampaign(
    campaignId: string,
    companyId: string,
    branchId?: string | null,
    extra?: { name?: string; adAccountId?: string; metaAdAccountId?: string }
  ): Promise<any> {
    const { MetaCampaign } = await import('../../common/models/MetaCampaign');
    const { Branch } = await import('../../common/models/Branch');
    if (branchId) {
      const branch = await Branch.findById(branchId);
      if (!branch || branch.companyId.toString() !== companyId) {
        throw new Error('Branch does not belong to this company');
      }
    }
    const updateDoc: any = {
      branchId: branchId || undefined,
    };
    if (extra?.name) updateDoc.name = extra.name;
    if (extra?.adAccountId) updateDoc.adAccountId = extra.adAccountId;
    if (extra?.metaAdAccountId) updateDoc.metaAdAccountId = extra.metaAdAccountId;

    const campaign = await MetaCampaign.findOneAndUpdate(
      { companyId, campaignId },
      { $set: updateDoc, $setOnInsert: { companyId, campaignId } },
      { upsert: true, new: true, runValidators: true }
    );
    return campaign;
  }

  static extractCostPerResult(costPerResult: any): string {
    if (!costPerResult) return '0';
    if (typeof costPerResult === 'number' || typeof costPerResult === 'string') return String(costPerResult);
    if (Array.isArray(costPerResult)) {
      const hit = costPerResult.find((c: any) => String(c?.action_type || '').includes('lead')) || costPerResult[0];
      if (hit?.value != null) return String(hit.value);
      if (typeof hit === 'string' || typeof hit === 'number') return String(hit);
      if (typeof hit === 'object') return hit.text || hit.name || JSON.stringify(hit);
    }
    if (typeof costPerResult === 'object') {
      if (costPerResult.value != null) return String(costPerResult.value);
      if (costPerResult.text != null) return String(costPerResult.text);
      return JSON.stringify(costPerResult);
    }
    return '0';
  }

  static async subscribePageToApp(pageId: string, pageAccessToken: string): Promise<boolean> {
    const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(pageId)}/subscribed_apps?subscribed_fields=leadgen&access_token=${encodeURIComponent(pageAccessToken)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), GRAPH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { method: 'POST', signal: ctrl.signal });
      const data = (await res.json().catch(() => ({}))) as any;
      const success = Boolean(data?.success);
      if (success) {
        await MetaPage.findOneAndUpdate({ metaPageId: pageId }, { $set: { subscribed: true } });
        logger.info(`Successfully linked app to Meta Page ${pageId} for leadgen webhooks`);
      } else {
        logger.warn(`Failed to link app to Meta Page ${pageId}:`, data?.error?.message);
      }
      return success;
    } catch (err: any) {
      logger.error(`Error linking app to Meta Page ${pageId}:`, err?.message);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  static async subscribeAdAccountToApp(adAccountId: string, userAccessToken: string): Promise<boolean> {
    const formatted = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
    const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(formatted)}/subscribed_apps?access_token=${encodeURIComponent(userAccessToken)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), GRAPH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { method: 'POST', signal: ctrl.signal });
      const data = (await res.json().catch(() => ({}))) as any;
      const success = Boolean(data?.success);
      if (success) {
        await MetaAdAccount.findOneAndUpdate({ metaAdAccountId: formatted }, { $set: { subscribed: true } });
        logger.info(`Successfully linked app to Meta Ad Account ${formatted} for ads_management webhooks`);
      } else {
        logger.warn(`Failed to link app to Meta Ad Account ${formatted}:`, data?.error?.message);
      }
      return success;
    } catch (err: any) {
      logger.error(`Error linking app to Meta Ad Account ${formatted}:`, err?.message);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  static async subscribeAllConnectedApps(companyId: string): Promise<{
    pagesSubscribed: number;
    adAccountsSubscribed: number;
  }> {
    const integrations = await MetaIntegration.find({ companyId, status: 'active' }).select('+accessToken');
    let pagesCount = 0;
    let adAccountsCount = 0;

    for (const integration of integrations) {
      const userToken = decryptToken(integration.accessToken);
      if (!userToken) continue;

      // 1. Subscribe all active Ad Accounts for this integration
      const accounts = await MetaAdAccount.find({ integrationId: integration._id, status: 'active' });
      for (const acc of accounts) {
        const ok = await this.subscribeAdAccountToApp(acc.metaAdAccountId, userToken);
        if (ok) adAccountsCount++;
      }

      // 2. Fetch pages and subscribe with Page Access Token
      try {
        const pagesRes = await fetch(
          `https://graph.facebook.com/${META_GRAPH_VERSION}/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(userToken)}`,
        );
        const pagesData = (await pagesRes.json().catch(() => ({}))) as any;
        if (Array.isArray(pagesData?.data)) {
          for (const p of pagesData.data) {
            const pageToken = p.access_token || userToken;
            const ok = await this.subscribePageToApp(String(p.id), pageToken);
            if (ok) pagesCount++;
          }
        }
      } catch (err: any) {
        logger.warn(`Failed to fetch pages for app subscription: ${err?.message}`);
      }
    }

    return { pagesSubscribed: pagesCount, adAccountsSubscribed: adAccountsCount };
  }

  static async syncSpecificCampaign(campaignId: string, companyId: string, integrationId: string): Promise<any> {
    const integration = await MetaIntegration.findById(integrationId).select('+accessToken');
    const token = decryptToken(integration?.accessToken);
    if (!token) throw new Error('No access token available for integration');

    const fields = 'name,status,objective,effective_status,account_id,insights.date_preset(last_30d){spend,reach,impressions,results,inline_link_clicks}';
    const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(campaignId)}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), GRAPH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      const c = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(c?.error?.message || 'Campaign fetch rejected by Meta');

      const campaignData = {
        id: c.id,
        name: c.name,
        status: c.status,
        effectiveStatus: c.effective_status,
        objective: c.objective,
        metrics: {
          spend: c.insights?.[0]?.spend || '0',
          reach: c.insights?.[0]?.reach || '0',
          impressions: c.insights?.[0]?.impressions || '0',
          leads: this.extractLeadsCount(c.insights?.[0]?.results),
        },
      };

      // Broadcast update live to CRM UI
      const { RealtimeService } = await import('../realtime/realtime.service');
      RealtimeService.broadcastToCompany(companyId, {
        type: 'CAMPAIGN_UPDATED',
        payload: campaignData,
      });

      return campaignData;
    } finally {
      clearTimeout(timer);
    }
  }

  static async verifyWebhookSignature(payload: string, signature: string): Promise<boolean> {
    const crypto = require('crypto');
    const expected = 'sha256=' + crypto.createHmac('sha256', process.env.META_APP_SECRET || '').update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }
}

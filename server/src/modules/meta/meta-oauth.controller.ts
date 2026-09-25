import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { MetaIntegration } from '../../common/models/MetaIntegration';
import { MetaAdAccount } from '../../common/models/MetaAdAccount';
import { MetaLeadForm } from '../../common/models/MetaLeadForm';
import { MetaPage } from '../../common/models/MetaPage';
import { Branch } from '../../common/models/Branch';
import { AuthRequest, isPrivilegedRole } from '../../common/middleware/auth';
import { recordAudit } from '../../common/services/audit';
import { logger } from '../../common/utils/logger';
import { MetaService, META_GRAPH_VERSION } from './meta.service';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const DEFAULT_SCOPES = [
  'ads_read',
  'ads_management',
  'leads_retrieval',
  'pages_manage_ads',
  'pages_manage_metadata',
  'pages_read_engagement',
  'pages_show_list',
  'whatsapp_business_messaging',
  'whatsapp_business_management',
  'business_management',
];

function backendUrl(): string {
  return (process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
}

function frontendUrl(): string {
  return (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
}

async function graphGet(url: string): Promise<{ ok: boolean; data: any }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  } finally {
    clearTimeout(timer);
  }
}

export class MetaOAuthController {
  static async start(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as AuthRequest).user;
      const companyId = user?.isSuperAdmin ? (req.query.companyId as string) : user?.companyId;
      if (!companyId) {
        res.status(400).json({ error: 'companyId is required', code: 'VALIDATION_ERROR' });
        return;
      }
      const appId = process.env.META_APP_ID;
      if (!appId) {
        res.status(500).json({ error: 'Meta app not configured on platform', code: 'OAUTH_NOT_CONFIGURED' });
        return;
      }
      const integrationId = (req.query.integrationId as string) || undefined;
      let existingIntegration: any = null;
      if (integrationId) {
        existingIntegration = await MetaIntegration.findById(integrationId);
      }

      let requestedScopes: string[];
      if (req.query.scopes) {
        requestedScopes = String(req.query.scopes).split(',').map((s) => s.trim()).filter(Boolean);
      } else if (existingIntegration?.desiredScopes?.length) {
        requestedScopes = existingIntegration.desiredScopes;
      } else if (existingIntegration?.scopes?.length) {
        requestedScopes = existingIntegration.scopes;
      } else {
        requestedScopes = (process.env.META_OAUTH_SCOPES || DEFAULT_SCOPES.join(',')).split(',').map((s) => s.trim());
      }

      // Check if there are declined scopes among requested scopes
      const declinedScopes: string[] = (existingIntegration?.metadata as any)?.declinedScopes || [];
      const hasDeclinedRequested = requestedScopes.some((s) => declinedScopes.includes(s));

      let authType = (req.query.auth_type as string) || (req.query.rerequest === 'true' ? 'rerequest' : undefined);
      if (!authType && hasDeclinedRequested) {
        authType = 'rerequest';
      }

      const state = jwt.sign(
        { purpose: 'meta-oauth', companyId, userId: user?.userId, integrationId, requestedScopes, nonce: Date.now().toString(36) },
        JWT_SECRET,
        { expiresIn: '10m' } as any,
      );

      const forceConfirmation = req.query.force_confirmation === 'true';

      let dialogUrl =
        `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth` +
        `?client_id=${encodeURIComponent(appId)}` +
        `&redirect_uri=${encodeURIComponent(`${backendUrl()}/api/meta/oauth/callback`)}` +
        `&scope=${encodeURIComponent(requestedScopes.join(','))}` +
        `&state=${encodeURIComponent(state)}`;
      if (authType) {
        dialogUrl += `&auth_type=${encodeURIComponent(authType)}`;
      }
      if (forceConfirmation) {
        dialogUrl += `&force_confirmation=true`;
      }
      res.json({ success: true, data: { dialogUrl, requestedScopes, authType } });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'OAUTH_ERROR' });
    }
  }

  static async callback(req: Request, res: Response): Promise<void> {
    const fail = (code: string) => res.redirect(`${frontendUrl()}/integrations/connected?error=${code}`);
    try {
      const { code, state } = req.query as { code?: string; state?: string };
      if (!code || !state) return fail('missing_params');
      let claims: any;
      try {
        claims = jwt.verify(state, JWT_SECRET) as any;
      } catch {
        return fail('invalid_state');
      }
      if (claims.purpose !== 'meta-oauth' || !claims.companyId) return fail('invalid_state');

      const appId = process.env.META_APP_ID || '';
      const appSecret = process.env.META_APP_SECRET || '';
      const redirectUri = `${backendUrl()}/api/meta/oauth/callback`;

      const shortRes = await graphGet(
        `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token` +
          `?client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}` +
          `&redirect_uri=${encodeURIComponent(redirectUri)}&code=${encodeURIComponent(code)}`,
      );
      if (!shortRes.ok || !shortRes.data.access_token) {
        const err = shortRes.data.error as { message?: string; code?: number } | undefined;
        logger.error('Meta OAuth code exchange failed', { code: err?.code, message: err?.message });
        return fail('code_exchange_failed');
      }

      const longRes = await graphGet(
        `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token` +
          `?grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}` +
          `&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(shortRes.data.access_token)}`,
      );
      if (!longRes.ok || !longRes.data.access_token) return fail('token_exchange_failed');
      const longToken = longRes.data.access_token as string;
      const expiresAt = longRes.data.expires_in
        ? new Date(Date.now() + Number(longRes.data.expires_in) * 1000)
        : undefined;

      // Audit granted permissions via /me/permissions
      const permRes = await graphGet(
        `https://graph.facebook.com/${META_GRAPH_VERSION}/me/permissions?access_token=${encodeURIComponent(longToken)}`,
      );
      const permissionsList = Array.isArray(permRes.data?.data) ? permRes.data.data : [];
      const grantedScopes = permissionsList
        .filter((p: any) => p.status === 'granted')
        .map((p: any) => p.permission);
      const declinedScopes = permissionsList
        .filter((p: any) => p.status === 'declined')
        .map((p: any) => p.permission);

      const effectiveScopes =
        grantedScopes.length > 0
          ? grantedScopes
          : (Array.isArray(claims.requestedScopes) ? claims.requestedScopes : DEFAULT_SCOPES);

      const pagesRes = await graphGet(
        `https://graph.facebook.com/${META_GRAPH_VERSION}/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(longToken)}`,
      );
      const pages = Array.isArray(pagesRes.data?.data) ? pagesRes.data.data : [];

      // Identify the portfolio (business) being connected so repeated connects
      // add rows instead of overwriting each other.
      const meRes = await graphGet(
        `https://graph.facebook.com/${META_GRAPH_VERSION}/me?fields=id,name&access_token=${encodeURIComponent(longToken)}`,
      );
      const portfolioBusinessId = meRes.data?.id ? String(meRes.data.id) : undefined;
      const portfolioLabel = meRes.data?.name ? String(meRes.data.name) : undefined;

      const companyBranches = await Branch.find({ companyId: claims.companyId, status: 'active' }).select('_id').lean();
      const autoBranchId = companyBranches.length === 1 ? companyBranches[0]._id.toString() : undefined;

      const { encryptToken } = await import('../../common/security/tokenCrypto');
      const integrationFilter = claims.integrationId
        ? { _id: claims.integrationId }
        : (portfolioBusinessId ? { companyId: claims.companyId, portfolioBusinessId } : { companyId: claims.companyId });

      const integration = await MetaIntegration.findOneAndUpdate(
        integrationFilter,
        {
          companyId: claims.companyId,
          portfolioBusinessId,
          label: portfolioLabel,
          appId,
          accessToken: encryptToken(longToken),
          tokenExpiresAt: expiresAt,
          scopes: effectiveScopes,
          desiredScopes: Array.isArray(claims.requestedScopes) ? claims.requestedScopes : effectiveScopes,
          status: 'active',
          'metadata.actionRequired': false,
          'metadata.lastSyncError': null,
          'metadata.lastSyncStatus': 'reconnected',
          'metadata.grantedScopes': grantedScopes,
          'metadata.declinedScopes': declinedScopes,
          'metadata.lastAuditAt': new Date(),
        },
        { upsert: true, new: true, runValidators: true },
      );

      for (const page of pages) {
        await MetaPage.findOneAndUpdate(
          { metaPageId: String(page.id) },
          {
            metaPageId: String(page.id),
            companyId: claims.companyId,
            branchId: autoBranchId,
            integrationId: integration._id,
            name: page.name,
            accessToken: page.access_token ? encryptToken(page.access_token) : undefined,
            status: autoBranchId ? 'active' : 'pending',
          },
          { upsert: true, runValidators: true },
        );
        // Automatically link app to page for real-time lead notifications
        MetaService.subscribePageToApp(String(page.id), page.access_token || longToken).catch((err: any) =>
          logger.warn(`Background page webhook subscription error: ${err?.message}`),
        );
      }

      // Automatically link app to connected ad accounts
      MetaService.subscribeAllConnectedApps(claims.companyId).catch((err: any) =>
        logger.warn(`Background ad accounts webhook subscription error: ${err?.message}`),
      );


      await recordAudit({
        actorId: claims.userId,
        action: 'META_CONNECTED',
        companyId: claims.companyId,
        metadata: { pages: pages.length },
      });
      res.redirect(`${frontendUrl()}/integrations/connected?ok=1&pages=${pages.length}`);
    } catch (error) {
      logger.error('Meta OAuth callback failed:', error);
      fail('callback_failed');
    }
  }

  static async disconnect(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as AuthRequest).user;
      const companyId = user?.isSuperAdmin ? (req.body.companyId as string || user?.companyId) : user?.companyId;
      if (!companyId) {
        res.status(400).json({ error: 'companyId is required', code: 'VALIDATION_ERROR' });
        return;
      }
      const { integrationId } = req.body as { integrationId?: string };
      if (integrationId) {
        const integration = await MetaIntegration.findById(integrationId);
        if (!integration || (!user?.isSuperAdmin && integration.companyId.toString() !== companyId)) {
          res.status(404).json({ error: 'Integration not found', code: 'NOT_FOUND' });
          return;
        }
        integration.accessToken = undefined;
        integration.tokenExpiresAt = undefined;
        integration.status = 'inactive';
        await integration.save();
        await MetaPage.updateMany({ integrationId: integration._id }, { status: 'inactive' });
        await MetaAdAccount.updateMany({ integrationId: integration._id }, { status: 'inactive' });
        await recordAudit({ actorId: user?.userId, action: 'META_DISCONNECTED', companyId, metadata: { integrationId } });
        res.json({ success: true, message: 'Portfolio disconnected' });
        return;
      }
      await MetaIntegration.updateMany(
        { companyId },
        { $set: { status: 'inactive' }, $unset: { accessToken: '', tokenExpiresAt: '' } },
      );
      await MetaPage.updateMany({ companyId }, { status: 'inactive' });
      await MetaAdAccount.updateMany({ companyId }, { status: 'inactive' });
      if ((req.body as any)?.purge === true) {
        const { MetaLeadForm } = await import('../../common/models/MetaLeadForm');
        const [pages, forms, integrations, accounts] = await Promise.all([
          MetaPage.deleteMany({ companyId }),
          MetaLeadForm.deleteMany({ companyId }),
          MetaIntegration.deleteMany({ companyId }),
          MetaAdAccount.deleteMany({ companyId }),
        ]);
        await recordAudit({
          actorId: user?.userId,
          action: 'META_PURGED',
          companyId,
          metadata: { pages: pages.deletedCount, forms: forms.deletedCount, integrations: integrations.deletedCount, accounts: accounts.deletedCount },
        });
      } else {
        await recordAudit({ actorId: user?.userId, action: 'META_DISCONNECTED', companyId });
      }
      res.json({ success: true, message: 'Meta disconnected' });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'DISCONNECT_ERROR' });
    }
  }

  static async refreshExpiring(): Promise<{ refreshed: number; expired: number }> {
    const soon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const due = await MetaIntegration.find({
      status: 'active',
      tokenExpiresAt: { $lte: soon },
    }).select('+accessToken');
    let refreshed = 0;
    let expired = 0;
    const { decryptToken } = await import('../../common/security/tokenCrypto');
    for (const integration of due) {
      try {
        const current = decryptToken(integration.accessToken);
        if (!current) throw new Error('no token');
        const res = await graphGet(
          `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token` +
            `?grant_type=fb_exchange_token&client_id=${encodeURIComponent(process.env.META_APP_ID || '')}` +
            `&client_secret=${encodeURIComponent(process.env.META_APP_SECRET || '')}` +
            `&fb_exchange_token=${encodeURIComponent(current)}`,
        );
        if (!res.ok || !res.data.access_token) throw new Error('refresh rejected');
        integration.accessToken = res.data.access_token as string;
        integration.tokenExpiresAt = res.data.expires_in
          ? new Date(Date.now() + Number(res.data.expires_in) * 1000)
          : undefined;
        await integration.save();
        refreshed++;
      } catch (error) {
        integration.status = 'expired';
        await integration.save();
        expired++;
        logger.error('Meta token refresh failed, marked expired', { integrationId: integration._id });
      }
    }
    return { refreshed, expired };
  }

  static async refresh(req: Request, res: Response): Promise<void> {
    try {
      const result = await MetaOAuthController.refreshExpiring();
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'REFRESH_ERROR' });
    }
  }

    static async getSyncSettings(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as AuthRequest).user;
      const companyId = user?.isSuperAdmin
        ? ((req.query.companyId as string) || undefined)
        : user?.companyId;
      if (!companyId) {
        res.status(400).json({ error: 'companyId is required', code: 'VALIDATION_ERROR' });
        return;
      }
      const { MetaSyncSetting } = await import('../../common/models/MetaSyncSetting');
      const setting = await MetaSyncSetting.findOne({ companyId }).lean();
      res.json({
        success: true,
        data: setting || { companyId, enabled: false, intervalMinutes: 30, lastRunAt: null, lastResult: null },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  static async putSyncSettings(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as AuthRequest).user;
      const companyId = user?.isSuperAdmin ? (req.body.companyId as string) : user?.companyId;
      if (!companyId) {
        res.status(400).json({ error: 'companyId is required', code: 'VALIDATION_ERROR' });
        return;
      }
      const enabled = (req.body as any).enabled !== false;
      const intervalMinutes = Number((req.body as any).intervalMinutes ?? 30);
      if (!Number.isInteger(intervalMinutes) || intervalMinutes < 5 || intervalMinutes > 1440) {
        res.status(400).json({ error: 'intervalMinutes must be an integer between 5 and 1440', code: 'VALIDATION_ERROR' });
        return;
      }
      const { MetaSyncSetting } = await import('../../common/models/MetaSyncSetting');
      const { scheduleMetaSync, removeMetaSync } = await import('../queue/queue.config');
      const setting = await MetaSyncSetting.findOneAndUpdate(
        { companyId },
        { companyId, enabled, intervalMinutes },
        { upsert: true, new: true, runValidators: true },
      );
      try {
        if (enabled) {
          await scheduleMetaSync(companyId, intervalMinutes);
        } else {
          await removeMetaSync(companyId);
        }
      } catch (queueError) {
        logger.warn('Sync schedule not registered (Redis unreachable); setting saved and will apply when workers run', { companyId });
      }
      await recordAudit({
        actorId: user?.userId,
        action: 'META_SYNC_SETTINGS_UPDATED',
        companyId,
        metadata: { enabled, intervalMinutes },
      });
      res.json({ success: true, data: setting });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'UPDATE_ERROR' });
    }
  }

  static async listAdAccounts(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as AuthRequest).user;
      const companyId = user?.isSuperAdmin
        ? ((req.query.companyId as string) || undefined)
        : user?.companyId;
      if (!companyId) {
        res.json({ success: true, data: [], meta: { activeIntegrations: [] } });
        return;
      }

      const includeInactive = req.query.includeInactive === 'true';
      const targetIntegrationId = req.query.integrationId as string | undefined;

      // 1. Fetch integrations for this company
      const allIntegrations = await MetaIntegration.find({ companyId }).lean();
      const activeIntegrations = allIntegrations.filter((i) => i.status === 'active');
      const integrationMap = new Map<string, any>(
        allIntegrations.map((i) => [i._id.toString(), i])
      );

      // 2. Auto-heal: mark any ad accounts belonging to inactive integrations as inactive
      const inactiveIntegrationIds = allIntegrations
        .filter((i) => i.status !== 'active')
        .map((i) => i._id);
      if (inactiveIntegrationIds.length > 0) {
        await MetaAdAccount.updateMany(
          { companyId, integrationId: { $in: inactiveIntegrationIds }, status: 'active' },
          { $set: { status: 'inactive' } }
        );
      }

      // 3. Build query filter
      const filter: Record<string, unknown> = { companyId };
      const isPrivilegedAdmin = user?.isSuperAdmin || isPrivilegedRole(user?.role);
      const activeBranch = user?.branchId || (req.query.branchId as string);

      if (activeBranch) {
        const { MetaCampaign } = await import('../../common/models/MetaCampaign');
        const branchCampaigns = await MetaCampaign.find({ companyId, branchId: activeBranch }).select('adAccountId metaAdAccountId').lean();
        const campaignAdAccountIds = branchCampaigns.map((c) => c.adAccountId).filter(Boolean);
        const campaignMetaAdAccountIds = branchCampaigns.map((c) => c.metaAdAccountId).filter(Boolean);

        const branchConditions: any[] = [
          { branchId: activeBranch },
        ];
        if (campaignAdAccountIds.length > 0) {
          branchConditions.push({ _id: { $in: campaignAdAccountIds } });
        }
        if (campaignMetaAdAccountIds.length > 0) {
          branchConditions.push({ metaAdAccountId: { $in: campaignMetaAdAccountIds } });
        }

        filter.$or = branchConditions;
      } else if (!isPrivilegedAdmin && user?.allowedBranchIds?.length) {
        const { MetaCampaign } = await import('../../common/models/MetaCampaign');
        const branchCampaigns = await MetaCampaign.find({ companyId, branchId: { $in: user.allowedBranchIds } }).select('adAccountId metaAdAccountId').lean();
        const campaignAdAccountIds = branchCampaigns.map((c) => c.adAccountId).filter(Boolean);
        const campaignMetaAdAccountIds = branchCampaigns.map((c) => c.metaAdAccountId).filter(Boolean);

        const branchConditions: any[] = [
          { branchId: { $in: user.allowedBranchIds } },
        ];
        if (campaignAdAccountIds.length > 0) {
          branchConditions.push({ _id: { $in: campaignAdAccountIds } });
        }
        if (campaignMetaAdAccountIds.length > 0) {
          branchConditions.push({ metaAdAccountId: { $in: campaignMetaAdAccountIds } });
        }

        filter.$or = branchConditions;
      } else if (!isPrivilegedAdmin) {
        filter.branchId = '000000000000000000000000';
      }
      if (targetIntegrationId) {
        filter.integrationId = targetIntegrationId;
      } else if (!includeInactive) {
        filter.integrationId = { $in: activeIntegrations.map((i) => i._id) };
        filter.status = 'active';
      }

      const accounts = await MetaAdAccount.find(filter).sort({ updatedAt: -1 }).lean();

      // 4. Enrich ad accounts with parent integration label and details
      const enrichedAccounts = accounts.map((acc: any) => {
        const parent = integrationMap.get(acc.integrationId?.toString());
        return {
          ...acc,
          integrationLabel: parent?.label || (parent?.portfolioBusinessId ? `Portfolio ${parent.portfolioBusinessId}` : undefined),
          integrationStatus: parent?.status || 'inactive',
          integrationScopes: parent?.scopes || [],
        };
      });

      res.json({
        success: true,
        data: enrichedAccounts,
        meta: {
          total: enrichedAccounts.length,
          activeIntegrationsCount: activeIntegrations.length,
          activeIntegrations: activeIntegrations.map((i) => ({
            id: i._id,
            label: i.label || (i.portfolioBusinessId ? `Portfolio ${i.portfolioBusinessId}` : 'Meta Integration'),
            portfolioBusinessId: i.portfolioBusinessId,
            scopes: i.scopes || [],
            hasAdScopes: (i.scopes || []).some((s: string) => s === 'ads_read' || s === 'ads_management'),
          })),
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  static async syncAdAccounts(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as AuthRequest).user;
      const companyId = user?.isSuperAdmin ? (req.body.companyId as string) : user?.companyId;
      if (!companyId) {
        res.status(400).json({ error: 'companyId is required', code: 'VALIDATION_ERROR' });
        return;
      }
      const integrationId = (req.body?.integrationId as string) || (req.query?.integrationId as string) || undefined;
      const { MetaService } = await import('./meta.service');
      const result = await MetaService.syncAdAccounts(companyId, integrationId);
      await recordAudit({ actorId: user?.userId, action: 'META_ADACCOUNTS_SYNCED', companyId, metadata: result as any });
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(400).json({ error: error.message, code: 'SYNC_FAILED' });
    }
  }

  static async debugToken(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as AuthRequest).user;
      const integrationId = (req.query.integrationId as string) || (req.body.integrationId as string);
      if (!integrationId) {
        res.status(400).json({ error: 'integrationId is required', code: 'VALIDATION_ERROR' });
        return;
      }
      const integration = await MetaIntegration.findById(integrationId);
      if (!integration || (!user?.isSuperAdmin && integration.companyId.toString() !== user?.companyId)) {
        res.status(404).json({ error: 'Integration not found', code: 'NOT_FOUND' });
        return;
      }
      const { MetaService } = await import('./meta.service');
      const result = await MetaService.debugToken(integrationId);
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'DEBUG_ERROR' });
    }
  }

  static async revokePermission(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as AuthRequest).user;
      const { integrationId, permission, permissions } = req.body as {
        integrationId?: string;
        permission?: string;
        permissions?: string[];
      };
      const targets = Array.isArray(permissions)
        ? permissions.filter(Boolean)
        : (permission ? [permission] : []);
      if (!integrationId || targets.length === 0) {
        res.status(400).json({ error: 'integrationId and permission(s) are required', code: 'VALIDATION_ERROR' });
        return;
      }
      const integration = await MetaIntegration.findById(integrationId).select('+accessToken');
      if (!integration) {
        res.status(404).json({ error: 'Integration not found', code: 'NOT_FOUND' });
        return;
      }
      if (!user?.isSuperAdmin && integration.companyId.toString() !== user?.companyId) {
        res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
        return;
      }
      const { decryptToken } = await import('../../common/security/tokenCrypto');
      const token = decryptToken(integration.accessToken);
      if (!token) {
        res.status(400).json({ error: 'Integration has no valid access token', code: 'NO_TOKEN' });
        return;
      }

      const revoked: string[] = [];
      const failed: Array<{ permission: string; error: string }> = [];

      for (const perm of targets) {
        const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/me/permissions/${encodeURIComponent(perm)}?access_token=${encodeURIComponent(token)}`;
        const metaRes = await fetch(url, { method: 'DELETE' });
        const metaData = (await metaRes.json().catch(() => ({}))) as any;
        if (metaRes.ok || metaData?.success) {
          revoked.push(perm);
        } else {
          failed.push({ permission: perm, error: metaData?.error?.message || 'Revocation rejected by Meta' });
        }
      }

      if (revoked.length > 0) {
        integration.scopes = (integration.scopes || []).filter((s: string) => !revoked.includes(s));
        const metaObj = (integration.metadata || {}) as Record<string, any>;
        const granted = Array.isArray(metaObj.grantedScopes)
          ? metaObj.grantedScopes.filter((s: string) => !revoked.includes(s))
          : [];
        const declined = Array.isArray(metaObj.declinedScopes) ? [...metaObj.declinedScopes] : [];
        for (const r of revoked) {
          if (!declined.includes(r)) declined.push(r);
        }
        integration.metadata = {
          ...metaObj,
          grantedScopes: granted,
          declinedScopes: declined,
          lastAuditAt: new Date(),
        };
        integration.markModified('metadata');
        await integration.save();

        await recordAudit({
          actorId: user?.userId,
          action: 'META_PERMISSION_REVOKED',
          companyId: integration.companyId.toString(),
          metadata: { integrationId, revoked, failed },
        });
      }

      if (failed.length > 0 && revoked.length === 0) {
        res.status(400).json({
          error: failed[0].error,
          code: 'META_REVOKE_FAILED',
          failed,
        });
        return;
      }

      res.json({
        success: true,
        message: `Revoked ${revoked.length} permission(s)${failed.length > 0 ? `, ${failed.length} failed` : ''}`,
        revoked,
        failed,
        scopes: integration.scopes,
        metadata: integration.metadata,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'REVOKE_ERROR' });
    }
  }

  static async auditPermissions(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as AuthRequest).user;
      const integrationId = (req.query.integrationId as string) || (req.body.integrationId as string);
      if (!integrationId) {
        res.status(400).json({ error: 'integrationId is required', code: 'VALIDATION_ERROR' });
        return;
      }
      const integration = await MetaIntegration.findById(integrationId).select('+accessToken');
      if (!integration) {
        res.status(404).json({ error: 'Integration not found', code: 'NOT_FOUND' });
        return;
      }
      if (!user?.isSuperAdmin && integration.companyId.toString() !== user?.companyId) {
        res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
        return;
      }
      const { decryptToken } = await import('../../common/security/tokenCrypto');
      const token = decryptToken(integration.accessToken);
      if (!token) {
        res.status(400).json({ error: 'Integration has no valid access token', code: 'NO_TOKEN' });
        return;
      }
      const permRes = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/me/permissions?access_token=${encodeURIComponent(token)}`);
      const permData = (await permRes.json().catch(() => ({}))) as any;
      if (!permRes.ok) {
        res.status(400).json({ error: permData?.error?.message || 'Failed to fetch permissions from Meta', code: 'META_API_ERROR' });
        return;
      }
      const perms = Array.isArray(permData?.data) ? permData.data : [];
      const grantedScopes = perms.filter((p: any) => p.status === 'granted').map((p: any) => p.permission);
      const declinedScopes = perms.filter((p: any) => p.status === 'declined').map((p: any) => p.permission);

      integration.scopes = grantedScopes;
      const metaObj = (integration.metadata || {}) as Record<string, any>;
      integration.metadata = {
        ...metaObj,
        grantedScopes,
        declinedScopes,
        lastAuditAt: new Date(),
      };
      integration.markModified('metadata');
      await integration.save();

      res.json({
        success: true,
        data: {
          permissions: perms,
          grantedScopes,
          declinedScopes,
          scopes: integration.scopes,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'AUDIT_ERROR' });
    }
  }

    static async listPages(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as AuthRequest).user;
      const companyId = user?.isSuperAdmin
        ? ((req.query.companyId as string) || undefined)
        : user?.companyId;
      const filter: Record<string, unknown> = {};
      if (companyId) filter.companyId = companyId;
      const { MetaPage } = await import('../../common/models/MetaPage');
      res.json({ success: true, data: await MetaPage.find(filter).sort({ updatedAt: -1 }).lean() });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  static async listForms(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as AuthRequest).user;
      const companyId = user?.isSuperAdmin
        ? ((req.query.companyId as string) || undefined)
        : user?.companyId;
      const filter: Record<string, unknown> = {};
      if (companyId) filter.companyId = companyId;
      res.json({ success: true, data: await MetaLeadForm.find(filter).sort({ updatedAt: -1 }).lean() });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  static async assignForm(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as AuthRequest).user;
      const form = await MetaLeadForm.findById(req.params.id);
      if (!form) {
        res.status(404).json({ error: 'Form mapping not found', code: 'NOT_FOUND' });
        return;
      }
      if (!user?.isSuperAdmin && form.companyId.toString() !== user?.companyId) {
        res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
        return;
      }
      const { branchId } = req.body;
      if (branchId) {
        const branch = await Branch.findById(branchId);
        if (!branch || branch.companyId.toString() !== form.companyId.toString()) {
          res.status(400).json({ error: 'Branch does not belong to this company', code: 'VALIDATION_ERROR' });
          return;
        }
      }
      form.branchId = branchId || undefined;
      form.status = branchId ? 'active' : 'inactive';
      await form.save();
      await recordAudit({
        actorId: user?.userId,
        action: 'META_FORM_ASSIGNED',
        companyId: form.companyId.toString(),
        branchId: branchId || undefined,
        metadata: { metaFormId: form.metaFormId },
      });
      res.json({ success: true, data: form });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'ASSIGN_ERROR' });
    }
  }

  static async assignPage(req: Request, res: Response): Promise<void> {    try {
      const user = (req as AuthRequest).user;
      const page = await MetaPage.findById(req.params.id);
      if (!page) {
        res.status(404).json({ error: 'Page mapping not found', code: 'NOT_FOUND' });
        return;
      }
      if (!user?.isSuperAdmin && page.companyId.toString() !== user?.companyId) {
        res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
        return;
      }
      const { branchId } = req.body;
      if (branchId) {
        const branch = await Branch.findById(branchId);
        if (!branch || branch.companyId.toString() !== page.companyId.toString()) {
          res.status(400).json({ error: 'Branch does not belong to this company', code: 'VALIDATION_ERROR' });
          return;
        }
      }
      page.branchId = branchId || undefined;
      page.status = branchId ? 'active' : 'pending';
      await page.save();
      await recordAudit({
        actorId: user?.userId,
        action: 'META_PAGE_ASSIGNED',
        companyId: page.companyId.toString(),
        branchId: branchId || undefined,
        metadata: { metaPageId: page.metaPageId },
      });
      res.json({ success: true, data: page });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'ASSIGN_ERROR' });
    }
  }

  static async assignAdAccount(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as AuthRequest).user;
      const account = await MetaAdAccount.findById(req.params.id);
      if (!account) {
        res.status(404).json({ error: 'Ad account not found', code: 'NOT_FOUND' });
        return;
      }
      if (!user?.isSuperAdmin && account.companyId.toString() !== user?.companyId) {
        res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
        return;
      }
      const { branchId } = req.body;
      if (branchId) {
        const branch = await Branch.findById(branchId);
        if (!branch || branch.companyId.toString() !== account.companyId.toString()) {
          res.status(400).json({ error: 'Branch does not belong to this company', code: 'VALIDATION_ERROR' });
          return;
        }
      }
      account.branchId = branchId || undefined;
      await account.save();
      await recordAudit({
        actorId: user?.userId,
        action: 'META_ADACCOUNT_ASSIGNED',
        companyId: account.companyId.toString(),
        branchId: branchId || undefined,
        metadata: { metaAdAccountId: account.metaAdAccountId, adAccountName: account.name },
      });
      res.json({ success: true, data: account });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'ASSIGN_ERROR' });
    }
  }

  static async syncScopes(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as AuthRequest).user;
      const integrationId = req.params.id;
      const { desiredScopes, authType } = req.body as { desiredScopes?: string[]; authType?: string };

      if (!Array.isArray(desiredScopes) || desiredScopes.length === 0) {
        res.status(400).json({ error: 'desiredScopes array with at least one scope is required', code: 'VALIDATION_ERROR' });
        return;
      }

      const integration = await MetaIntegration.findById(integrationId).select('+accessToken');
      if (!integration) {
        res.status(404).json({ error: 'Integration not found', code: 'NOT_FOUND' });
        return;
      }
      if (!user?.isSuperAdmin && integration.companyId.toString() !== user?.companyId) {
        res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
        return;
      }

      const { decryptToken } = await import('../../common/security/tokenCrypto');
      const token = decryptToken(integration.accessToken);

      // Save desiredScopes on integration
      integration.desiredScopes = desiredScopes;

      // Identify scopes to revoke vs scopes to add
      const currentGranted: string[] = (integration.metadata as any)?.grantedScopes || integration.scopes || [];
      const toRevoke = currentGranted.filter((s: string) => !desiredScopes.includes(s));
      const toAdd = desiredScopes.filter((s: string) => !currentGranted.includes(s));

      const revoked: string[] = [];
      const failedRevocations: Array<{ permission: string; error: string }> = [];

      // If we have token and permissions to revoke, execute programmatic DELETE directly on Meta
      if (token && toRevoke.length > 0) {
        for (const perm of toRevoke) {
          const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/me/permissions/${encodeURIComponent(perm)}?access_token=${encodeURIComponent(token)}`;
          const metaRes = await fetch(url, { method: 'DELETE' });
          const metaData = (await metaRes.json().catch(() => ({}))) as any;
          if (metaRes.ok || metaData?.success) {
            revoked.push(perm);
          } else {
            failedRevocations.push({ permission: perm, error: metaData?.error?.message || 'Revocation rejected' });
          }
        }

        if (revoked.length > 0) {
          integration.scopes = (integration.scopes || []).filter((s: string) => !revoked.includes(s));
          const metaObj = (integration.metadata || {}) as Record<string, any>;
          const granted = Array.isArray(metaObj.grantedScopes)
            ? metaObj.grantedScopes.filter((s: string) => !revoked.includes(s))
            : [];
          const declined = Array.isArray(metaObj.declinedScopes) ? [...metaObj.declinedScopes] : [];
          for (const r of revoked) {
            if (!declined.includes(r)) declined.push(r);
          }
          integration.metadata = {
            ...metaObj,
            grantedScopes: granted,
            declinedScopes: declined,
            lastAuditAt: new Date(),
          };
          integration.markModified('metadata');
        }
      }

      await integration.save();

      // If adding new scopes (or token missing), generate OAuth dialog URL with rerequest
      if (toAdd.length > 0 || !token) {
        const appId = process.env.META_APP_ID || integration.appId;
        if (!appId) {
          res.status(500).json({ error: 'Meta App ID not configured', code: 'OAUTH_NOT_CONFIGURED' });
          return;
        }

        const state = jwt.sign(
          {
            purpose: 'meta-oauth',
            companyId: integration.companyId.toString(),
            userId: user?.userId,
            integrationId: integration._id.toString(),
            requestedScopes: desiredScopes,
            nonce: Date.now().toString(36),
          },
          JWT_SECRET,
          { expiresIn: '10m' } as any,
        );

        const chosenAuthType = authType || 'rerequest';
        const dialogUrl =
          `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth` +
          `?client_id=${encodeURIComponent(appId)}` +
          `&redirect_uri=${encodeURIComponent(`${backendUrl()}/api/meta/oauth/callback`)}` +
          `&scope=${encodeURIComponent(desiredScopes.join(','))}` +
          `&state=${encodeURIComponent(state)}` +
          `&auth_type=${encodeURIComponent(chosenAuthType)}`;

        res.json({
          success: true,
          data: {
            needsOAuth: true,
            dialogUrl,
            revoked,
            toAdd,
            failedRevocations,
            scopes: integration.scopes,
            desiredScopes: integration.desiredScopes,
            message: `Revoked ${revoked.length} scope(s). Redirecting to Meta to authorize ${toAdd.length} scope(s).`,
          },
        });
        return;
      }

      res.json({
        success: true,
        data: {
          needsOAuth: false,
          revoked,
          failedRevocations,
          scopes: integration.scopes,
          desiredScopes: integration.desiredScopes,
          message: `Successfully synchronized scopes on Meta. Revoked ${revoked.length} permission(s) directly without re-login.`,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'SYNC_SCOPES_ERROR' });
    }
  }
}

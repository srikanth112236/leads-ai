import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { MetaIntegration } from '../../common/models/MetaIntegration';
import { MetaPage } from '../../common/models/MetaPage';
import { Branch } from '../../common/models/Branch';
import { AuthRequest } from '../../common/middleware/auth';
import { Role } from '../../common/types';
import { recordAudit } from '../../common/services/audit';
import { logger } from '../../common/utils/logger';
import { META_GRAPH_VERSION } from './meta.service';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const DEFAULT_SCOPES = [
  'ads_read',
  'leads_retrieval',
  'pages_manage_ads',
  'pages_manage_metadata',
  'pages_read_engagement',
  'pages_show_list',
  'whatsapp_business_messaging',
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
      const state = jwt.sign(
        { purpose: 'meta-oauth', companyId, userId: user?.userId, nonce: Date.now().toString(36) },
        JWT_SECRET,
        { expiresIn: '10m' } as any,
      );
      const scopes = (process.env.META_OAUTH_SCOPES || DEFAULT_SCOPES.join(',')).split(',').map((s) => s.trim());
      const dialogUrl =
        `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth` +
        `?client_id=${encodeURIComponent(appId)}` +
        `&redirect_uri=${encodeURIComponent(`${backendUrl()}/api/meta/oauth/callback`)}` +
        `&scope=${encodeURIComponent(scopes.join(','))}` +
        `&state=${encodeURIComponent(state)}`;
      res.json({ success: true, data: { dialogUrl } });
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
      if (!shortRes.ok || !shortRes.data.access_token) return fail('code_exchange_failed');

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

      const pagesRes = await graphGet(
        `https://graph.facebook.com/${META_GRAPH_VERSION}/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(longToken)}`,
      );
      const pages = Array.isArray(pagesRes.data?.data) ? pagesRes.data.data : [];

      const companyBranches = await Branch.find({ companyId: claims.companyId, status: 'active' }).select('_id').lean();
      const autoBranchId = companyBranches.length === 1 ? companyBranches[0]._id.toString() : undefined;

      const { encryptToken } = await import('../../common/security/tokenCrypto');
      const integration = await MetaIntegration.findOneAndUpdate(
        { companyId: claims.companyId },
        {
          companyId: claims.companyId,
          appId,
          accessToken: encryptToken(longToken),
          tokenExpiresAt: expiresAt,
          scopes: (process.env.META_OAUTH_SCOPES || DEFAULT_SCOPES.join(',')).split(',').map((s) => s.trim()),
          status: 'active',
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
            status: autoBranchId ? 'active' : 'pending',
          },
          { upsert: true, runValidators: true },
        );
      }

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
      const companyId = user?.isSuperAdmin ? (req.body.companyId as string) : user?.companyId;
      if (!companyId) {
        res.status(400).json({ error: 'companyId is required', code: 'VALIDATION_ERROR' });
        return;
      }
      await MetaIntegration.findOneAndUpdate(
        { companyId },
        { $set: { status: 'inactive' }, $unset: { accessToken: '', tokenExpiresAt: '' } },
      );
      await MetaPage.updateMany({ companyId }, { status: 'inactive' });
      await recordAudit({ actorId: user?.userId, action: 'META_DISCONNECTED', companyId });
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

  static async assignPage(req: Request, res: Response): Promise<void> {
    try {
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
}

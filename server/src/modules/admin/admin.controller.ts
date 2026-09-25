import { Request, Response } from 'express';
import { Company } from '../../common/models/Company';
import { Branch } from '../../common/models/Branch';
import { Lead } from '../../common/models/Lead';
import { MetaIntegration } from '../../common/models/MetaIntegration';
import { MetaPage } from '../../common/models/MetaPage';
import { MetaLeadForm } from '../../common/models/MetaLeadForm';
import { WhatsAppIntegration } from '../../common/models/WhatsAppIntegration';
import { WebsiteLeadForm } from '../../common/models/WebsiteLeadForm';
import { WebhookEvent } from '../../common/models/WebhookEvent';
import { AuditLog } from '../../common/models/AuditLog';
import { RetentionService } from './retention.service';
import { recordAudit } from '../../common/services/audit';
import { META_GRAPH_VERSION } from '../meta/meta.service';
import { BaseController } from '../../common/controllers/BaseController';

export class AdminController extends BaseController {
  static async getCompanies(req: Request, res: Response): Promise<void> {
    try {
      const companies = await Company.find({}).sort({ createdAt: -1 });
      res.json({ success: true, data: companies });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  static async getCompany(req: Request, res: Response): Promise<void> {
    try {
      const company = await Company.findById(req.params.id);
      if (!company) {
        res.status(404).json({ error: 'Company not found', code: 'NOT_FOUND' });
        return;
      }
      res.json({ success: true, data: company });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  static async getCompanyIntegrations(_req: Request, res: Response): Promise<void> {
    res.json({ success: true, data: [] });
  }

  static async getCompanyWebhooks(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt((req.query.page as string) || '1');
      const limit = Math.min(parseInt((req.query.limit as string) || '20'), 100);
      const filter: Record<string, unknown> = { companyId: req.params.id };
      if (req.query.provider) filter.provider = req.query.provider;
      if (req.query.status) filter.status = req.query.status;
      const [events, total] = await Promise.all([
        WebhookEvent.find(filter).sort({ receivedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        WebhookEvent.countDocuments(filter),
      ]);
      res.status(200).json({ success: true, data: events, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  static async getBranches(req: Request, res: Response): Promise<void> {
    try {
      const branches = await Branch.find({});
      res.json({ success: true, data: branches });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  static async getBranchLeads(req: Request, res: Response): Promise<void> {
    try {
      const leads = await Lead.find({ branchId: req.params.id }).sort({ createdAt: -1 }).limit(100).lean();
      res.json({ success: true, data: leads });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  static async getAuditLogs(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt((req.query.page as string) || '1');
      const limit = Math.min(parseInt((req.query.limit as string) || '20'), 100);
      const filter: Record<string, unknown> = {};
      if (req.query.companyId) filter.companyId = req.query.companyId;
      if (req.query.action) filter.action = req.query.action;
      const [logs, total] = await Promise.all([
        AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        AuditLog.countDocuments(filter),
      ]);
      res.status(200).json({ success: true, data: logs, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  static async getIntegrations(_req: Request, res: Response): Promise<void> {
    try {
      const [meta, whatsapp, websiteForms] = await Promise.all([
        MetaIntegration.find({}).lean(),
        WhatsAppIntegration.find({}).lean(),
        WebsiteLeadForm.find({}).lean(),
      ]);
      res.json({ success: true, data: { meta, whatsapp, websiteForms } });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  static async getMetaStatus(_req: Request, res: Response): Promise<void> {
    res.json({
      success: true,
      data: {
        appIdSet: !!process.env.META_APP_ID,
        appSecretSet: !!process.env.META_APP_SECRET,
        verifyTokenSet: !!process.env.META_WEBHOOK_VERIFY_TOKEN,
        tokenKeySet: !!process.env.META_TOKEN_KEY,
        graphVersion: META_GRAPH_VERSION,
        // Presence only — values are never returned.
      },
    });
  }

  static async exchangeMetaToken(req: Request, res: Response): Promise<void> {    try {
      const { shortToken } = req.body as { shortToken?: string };
      if (!shortToken) {
        res.status(400).json({ error: 'shortToken is required', code: 'VALIDATION_ERROR' });
        return;
      }
      const appId = process.env.META_APP_ID || '';
      const appSecret = process.env.META_APP_SECRET || '';
      if (!appId || !appSecret) {
        res.status(500).json({ error: 'Meta app not configured on platform', code: 'OAUTH_NOT_CONFIGURED' });
        return;
      }
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      try {
        const url =
          `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token` +
          `?grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}` +
          `&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(shortToken)}`;
        const apiRes = await fetch(url, { signal: ctrl.signal });
        const data = (await apiRes.json().catch(() => ({}))) as Record<string, unknown>;
        if (!apiRes.ok || !data.access_token) {
          const err = data.error as { message?: string; code?: number } | undefined;
          res.status(400).json({ error: err?.message || 'Exchange rejected by Meta', code: 'EXCHANGE_FAILED' });
          return;
        }
        // Returned ONCE for the operator to store in Render env. Never logged, never persisted.
        res.json({
          success: true,
          data: {
            access_token: data.access_token,
            expires_in: data.expires_in,
            token_type: data.token_type || 'bearer',
          },
        });
      } finally {
        clearTimeout(timer);
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'EXCHANGE_ERROR' });
    }
  }

  static async runRetention(req: Request, res: Response): Promise<void> {
    try {
      const days = Math.max(1, parseInt((req.body?.days as string) || '90'));
      const result = await RetentionService.run(days);
      await recordAudit({
        actorId: (req as any).user?.userId,
        action: 'RETENTION_RUN',
        metadata: { days, ...result },
      });
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'RETENTION_ERROR' });
    }
  }

  static async getMetaHealth(_req: Request, res: Response): Promise<void> {
    try {
      const backend = (process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [
        integrations,
        todayTotal,
        todayProcessed,
        todayFailed,
      ] = await Promise.all([
        MetaIntegration.find({}).select('companyId status tokenExpiresAt updatedAt metadata label portfolioBusinessId').lean(),
        WebhookEvent.countDocuments({ provider: { $in: ['meta', 'whatsapp'] }, receivedAt: { $gte: dayAgo } }),
        WebhookEvent.countDocuments({ provider: { $in: ['meta', 'whatsapp'] }, receivedAt: { $gte: dayAgo }, status: 'processed' }),
        WebhookEvent.countDocuments({ provider: { $in: ['meta', 'whatsapp'] }, receivedAt: { $gte: dayAgo }, status: 'failed' }),
      ]);
      const connectedCompanies = new Set(integrations.map((i: any) => i.companyId.toString())).size;
      const unhealthy = integrations
        .filter((i: any) => ['expired', 'failed'].includes(i.status))
        .map((i: any) => ({
          integrationId: i._id.toString(),
          companyId: i.companyId.toString(),
          label: i.label || i.portfolioBusinessId,
          status: i.status,
          lastHealthCheckAt: (i.metadata as any)?.lastHealthCheckAt || null,
          lastHealthError: (i.metadata as any)?.lastHealthError || null,
        }));
      res.json({
        success: true,
        data: {
          platform: {
            appConfigured: !!process.env.META_APP_ID && !!process.env.META_APP_SECRET,
            oauthCallbackUrl: `${backend}/api/meta/oauth/callback`,
            webhookUrl: `${backend}/api/webhooks/meta`,
            graphVersion: META_GRAPH_VERSION,
            capiSupported: true,
          },
          customers: {
            connectedCompanies,
            active: integrations.filter((i: any) => i.status === 'active').length,
            failed: integrations.filter((i: any) => ['expired', 'failed'].includes(i.status)).length,
          },
          webhooks24h: { total: todayTotal, processed: todayProcessed, failed: todayFailed },
          unhealthy,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'HEALTH_ERROR' });
    }
  }

  static async runMetaHealthCheck(req: Request, res: Response): Promise<void> {
    try {
      const { MetaHealthService } = await import('../meta/meta-health.service');
      const summary = await MetaHealthService.runHealthCheck();
      await recordAudit({
        actorId: (req as any).user?.userId,
        action: 'META_HEALTH_RUN',
        metadata: { ...summary },
      });
      res.json({ success: true, data: summary });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'HEALTH_RUN_ERROR' });
    }
  }

  static async getMetaCompanies(_req: Request, res: Response): Promise<void> {
    try {
      const companies = await Company.find({}).select('name status').sort({ name: 1 }).lean();
      const rows = await Promise.all(
        companies.map(async (c: any) => {
          const companyId = c._id.toString();
          const [integration, pages, forms, lastError, lastLead] = await Promise.all([
            MetaIntegration.findOne({ companyId }).select('status tokenExpiresAt updatedAt').lean(),
            MetaPage.countDocuments({ companyId }),
            MetaLeadForm.countDocuments({ companyId }),
            WebhookEvent.findOne({ companyId, provider: { $in: ['meta', 'whatsapp'] }, status: 'failed' })
              .sort({ receivedAt: -1 })
              .select('error receivedAt provider')
              .lean(),
            Lead.findOne({ companyId, source: { $in: ['META_LEAD_ADS', 'WHATSAPP'] } })
              .sort({ createdAt: -1 })
              .select('createdAt source')
              .lean(),
          ]);
          return {
            companyId,
            name: c.name,
            status: (integration as any)?.status || 'not_connected',
            pages,
            forms,
            lastError: lastError ? { message: (lastError as any).error, at: (lastError as any).receivedAt } : null,
            lastLeadAt: (lastLead as any)?.createdAt || null,
          };
        }),
      );
      res.json({ success: true, data: rows });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  static async testMetaPlatform(_req: Request, res: Response): Promise<void> {
    // Self-test: proves our own webhook endpoint answers the Meta handshake.
    // (It cannot prove Meta can reach us — that needs the Dashboard Verify button.)
    try {
      const backend = (process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      try {
        const apiRes = await fetch(
          `${backend}/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=__selftest__&hub.challenge=ping`,
          { signal: ctrl.signal },
        );
        const reachable = apiRes.status === 403; // 403 = route live, token rejected as designed
        res.json({ success: true, data: { endpointReachable: reachable, appConfigured: !!process.env.META_APP_ID } });
      } finally {
        clearTimeout(timer);
      }
    } catch (error: any) {
      res.json({ success: true, data: { endpointReachable: false, error: error.message } });
    }
  }
}

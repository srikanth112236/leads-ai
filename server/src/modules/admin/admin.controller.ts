import { Request, Response } from 'express';
import { Company } from '../../common/models/Company';
import { Branch } from '../../common/models/Branch';
import { Lead } from '../../common/models/Lead';
import { MetaIntegration } from '../../common/models/MetaIntegration';
import { WhatsAppIntegration } from '../../common/models/WhatsAppIntegration';
import { WebsiteLeadForm } from '../../common/models/WebsiteLeadForm';
import { WebhookEvent } from '../../common/models/WebhookEvent';
import { AuditLog } from '../../common/models/AuditLog';
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

  static async exchangeMetaToken(req: Request, res: Response): Promise<void> {
    try {
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
}

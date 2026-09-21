import { Request, Response } from 'express';
import { Company } from '../../common/models/Company';
import { Branch } from '../../common/models/Branch';
import { Lead } from '../../common/models/Lead';
import { MetaIntegration } from '../../common/models/MetaIntegration';
import { WhatsAppIntegration } from '../../common/models/WhatsAppIntegration';
import { WebsiteLeadForm } from '../../common/models/WebsiteLeadForm';
import { WebhookEvent } from '../../common/models/WebhookEvent';
import { AuditLog } from '../../common/models/AuditLog';
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
}

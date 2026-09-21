import { Request, Response } from 'express';
import { Lead } from '../../common/models/Lead';
import { LeadSource } from '../../common/models/LeadSource';
import { BaseController } from '../../common/controllers/BaseController';
import { TenantContextService } from '../../common/services/TenantContextService';
import { AuthRequest } from '../../common/middleware/auth';

async function tenantLeadIds(req: Request) {
  const filter = TenantContextService.getTenantFilter(req as AuthRequest);
  const leads = await Lead.find(filter).select('_id').lean();
  return leads.map((l) => l._id);
}

export class LeadSourceController extends BaseController {
  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      const sources = await LeadSource.find({ leadId: { $in: await tenantLeadIds(req) } }).sort({ createdAt: -1 });
      res.json({ success: true, data: sources });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  static async getByLead(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as AuthRequest).user;
      const lead = await Lead.findById(req.params.leadId);
      if (!lead) {
        res.status(404).json({ error: 'Lead not found', code: 'NOT_FOUND' });
        return;
      }
      if (!user?.isSuperAdmin && lead.companyId.toString() !== user?.companyId) {
        res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
        return;
      }
      const sources = await LeadSource.find({ leadId: lead._id });
      res.json({ success: true, data: sources });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }
}

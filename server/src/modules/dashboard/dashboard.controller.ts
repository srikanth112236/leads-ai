import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Lead } from '../../common/models/Lead';
import { Branch } from '../../common/models/Branch';
import { User } from '../../common/models/User';
import { MetaIntegration } from '../../common/models/MetaIntegration';
import { MetaAdAccount } from '../../common/models/MetaAdAccount';
import { WebhookEvent } from '../../common/models/WebhookEvent';
import { BaseController } from '../../common/controllers/BaseController';
import { TenantContextService } from '../../common/services/TenantContextService';
import { AuthRequest } from '../../common/middleware/auth';

export class DashboardController extends BaseController {
  static async getSummary(req: Request, res: Response): Promise<void> {
    try {
      const filter = TenantContextService.getTenantFilter(req as AuthRequest);
      const match: Record<string, unknown> = { ...filter };
      if (typeof match.companyId === 'string') {
        try {
          match.companyId = new mongoose.Types.ObjectId(match.companyId);
        } catch {
          // leave as-is; queries will simply match nothing
        }
      }
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const companyScope: Record<string, unknown> = {};
      if (filter.companyId) companyScope.companyId = filter.companyId;

      const branchScope = filter.branchId;
      const adAccountScope: Record<string, unknown> = { ...(companyScope as any), status: 'active' };
      if (branchScope) {
        const { MetaCampaign } = await import('../../common/models/MetaCampaign');
        const branchCampaigns = await MetaCampaign.find({ companyId: filter.companyId, branchId: branchScope }).select('adAccountId metaAdAccountId').lean();
        const campaignAdAccountIds = branchCampaigns.map((c) => c.adAccountId).filter(Boolean);
        const campaignMetaAdAccountIds = branchCampaigns.map((c) => c.metaAdAccountId).filter(Boolean);
        adAccountScope.$or = [
          { branchId: branchScope },
          ...(campaignAdAccountIds.length > 0 ? [{ _id: { $in: campaignAdAccountIds } }] : []),
          ...(campaignMetaAdAccountIds.length > 0 ? [{ metaAdAccountId: { $in: campaignMetaAdAccountIds } }] : []),
        ];
      }

      const [
        leadsTotal,
        byStatus,
        bySource,
        converted,
        users,
        branches,
        integrations,
        accounts,
        failedWebhooks,
      ] = await Promise.all([
        Lead.countDocuments(filter),
        Lead.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
        Lead.aggregate([{ $match: match }, { $group: { _id: '$source', count: { $sum: 1 } } }]),
        Lead.countDocuments({ ...filter, status: 'converted' }),
        User.countDocuments(filter.companyId ? { companyId: filter.companyId } : {}),
        Branch.countDocuments(filter.companyId ? { companyId: filter.companyId } : {}),
        MetaIntegration.countDocuments({ ...(companyScope as any), status: 'active' }),
        MetaAdAccount.find(adAccountScope).select('name metaAdAccountId amountSpent currency accountStatus').lean(),
        WebhookEvent.countDocuments({ ...(companyScope as any), status: 'failed', receivedAt: { $gte: dayAgo } }),
      ]);

      const totalSpend = accounts.reduce((sum, a: any) => sum + (parseFloat(a.amountSpent) || 0), 0);
      res.json({
        success: true,
        data: {
          leads: {
            total: leadsTotal,
            converted,
            conversionRate: leadsTotal > 0 ? Math.round((converted / leadsTotal) * 1000) / 10 : 0,
            byStatus: Object.fromEntries(byStatus.map((s: any) => [s._id || 'unknown', s.count])),
            bySource: Object.fromEntries(bySource.map((s: any) => [s._id || 'unknown', s.count])),
          },
          portfolios: {
            connected: integrations,
            adAccounts: accounts.length,
            totalSpend: Math.round(totalSpend * 100) / 100,
            currency: accounts[0]?.currency,
            accounts: accounts.map((a: any) => ({
              id: a._id,
              name: a.name,
              metaAdAccountId: a.metaAdAccountId,
              amountSpent: a.amountSpent,
              currency: a.currency,
              accountStatus: a.accountStatus,
            })),
          },
          team: { users, branches },
          webhooks: { failed24h: failedWebhooks },
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'SUMMARY_ERROR' });
    }
  }
}

import { Request, Response } from 'express';
import { MetaAdAccount } from '../../common/models/MetaAdAccount';
import { MetaLeadForm } from '../../common/models/MetaLeadForm';
import { Lead } from '../../common/models/Lead';
import { AuthRequest, isPrivilegedRole } from '../../common/middleware/auth';
import { canAccessBranch } from '../../common/middleware/tenant';
import { recordAudit } from '../../common/services/audit';
import { CampaignAccessService } from '../../common/services/CampaignAccessService';
import { logger } from '../../common/utils/logger';
import { MetaService, MetaPermanentError } from './meta.service';
import { MetaCapiService } from './meta-capi.service';

async function loadScopedAccount(req: Request, res: Response) {
  const account = await MetaAdAccount.findById(req.params.id);
  if (!account) {
    res.status(404).json({ error: 'Ad account not found', code: 'NOT_FOUND' });
    return null;
  }
  const user = (req as AuthRequest).user;
  if (!user?.isSuperAdmin && account.companyId.toString() !== user?.companyId) {
    res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
    return null;
  }
  // Branch-scoped: accounts assigned to another branch are invisible to
  // restricted users. Unassigned accounts stay visible (assignment queue).
  if (!user?.isSuperAdmin && !isPrivilegedRole(user?.role)) {
    const accountBranch = (account.branchId as any)?.toString();
    if (accountBranch && !canAccessBranch(user, accountBranch)) {
      res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
      return null;
    }
  }
  return { account, user };
}

export class MetaAdsController {
  static async getOverview(req: Request, res: Response): Promise<void> {
    try {
      const scoped = await loadScopedAccount(req, res);
      if (!scoped) return;
      const { account } = scoped;
      const user = (req as AuthRequest).user;
      const isPrivileged = user?.isSuperAdmin || isPrivilegedRole(user?.role);
      const branchScope = user?.branchId || (req.query.branchId as string);
      const companyId = account.companyId.toString();
      const datePreset = (req.query.datePreset as string) || 'maximum';
      const since = req.query.since as string | undefined;
      const until = req.query.until as string | undefined;
      const timeRange = since && until ? { since, until } : undefined;

      // Effective branch scope: explicit scope first, then the membership
      // allow-list for restricted users (prevents company-wide leakage when a
      // multi-branch user has no single primary branchId).
      const scopeBranchIds = branchScope
        ? [branchScope]
        : (!isPrivileged && user?.allowedBranchIds?.length ? user.allowedBranchIds : null);
      const branchFilter = scopeBranchIds ? { branchId: { $in: scopeBranchIds } } : {};

      const [rawCampaigns, forms, recentLeads] = await Promise.all([
        MetaService.getCampaigns(account._id.toString(), companyId, datePreset, timeRange),
        MetaLeadForm.find({ companyId, ...branchFilter }).sort({ updatedAt: -1 }).lean(),
        Lead.find({ companyId, source: 'META_LEAD_ADS', ...branchFilter }).sort({ createdAt: -1 }).limit(10).select('name email phone status createdAt branchId').lean(),
      ]);

      // Strict zero-leakage campaign filtering
      let campaigns = rawCampaigns;
      if (branchScope) {
        campaigns = rawCampaigns.filter((c: any) => c.branchId === branchScope);
      } else if (!isPrivileged && user?.allowedBranchIds?.length) {
        campaigns = rawCampaigns.filter((c: any) => c.branchId && user.allowedBranchIds.includes(c.branchId));
      } else if (!isPrivileged) {
        campaigns = [];
      }

      // Tier-3 grant narrowing (per branch): branches WITH explicit grants
      // show exactly those campaigns; other branches inherit branch scope.
      let grantNarrowed = false;
      if (!isPrivileged && user?.userId) {
        const before = campaigns.length;
        campaigns = await CampaignAccessService.filterCampaignsByGrant(user, companyId, campaigns);
        grantNarrowed = campaigns.length !== before;
      }
      campaigns = campaigns.map((c: any) => ({ ...c, granted: true, grantNarrowed }));

      await recordAudit({
        actorId: (req as AuthRequest).user?.userId,
        action: 'META_ADACCOUNT_VIEWED',
        companyId,
        metadata: { metaAdAccountId: account.metaAdAccountId, datePreset, timeRange, branchScope },
      });
      res.json({ success: true, data: { account, campaigns, forms, recentLeads, datePreset, timeRange } });
    } catch (error: any) {
      res.status(400).json({ error: error.message, code: 'OVERVIEW_FAILED' });
    }
  }

  static async getCampaignAds(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as AuthRequest).user;
      const { campaignId, datePreset = 'maximum', since, until } = req.query as {
        campaignId?: string;
        datePreset?: string;
        since?: string;
        until?: string;
      };
      let companyId = user?.isSuperAdmin ? ((req.query.companyId as string) || user?.companyId) : user?.companyId;
      if (!companyId && req.query.companyId) {
        companyId = req.query.companyId as string;
      }
      if (!companyId) {
        const acc = await MetaAdAccount.findOne({ status: 'active' });
        companyId = acc?.companyId?.toString();
      }
      if (!campaignId) {
        res.status(400).json({ error: 'campaignId is required', code: 'VALIDATION_ERROR' });
        return;
      }
      if (!companyId) {
        res.status(400).json({ error: 'companyId is required', code: 'VALIDATION_ERROR' });
        return;
      }

      const isPrivileged = user?.isSuperAdmin || isPrivilegedRole(user?.role);
      if (!isPrivileged) {
        const { MetaCampaign } = await import('../../common/models/MetaCampaign');
        const camp = await MetaCampaign.findOne({ companyId, campaignId }).lean();
        if (camp?.branchId && !canAccessBranch(user, camp.branchId.toString())) {
          res.status(403).json({ error: 'Access denied: campaign belongs to a different branch', code: 'FORBIDDEN' });
          return;
        }
        const visible = await CampaignAccessService.filterCampaignsByGrant(user, companyId, [
          { campaignId, branchId: camp?.branchId?.toString() },
        ]);
        if (visible.length === 0) {
          res.status(403).json({ error: 'Access denied: no grant for this campaign', code: 'CAMPAIGN_FORBIDDEN' });
          return;
        }
      }

      const timeRange = since && until ? { since, until } : undefined;
      const ads = await MetaService.getCampaignAds(campaignId, companyId, datePreset, timeRange);
      res.json({ success: true, data: ads });
    } catch (error: any) {
      res.status(400).json({ error: error.message, code: 'ADS_FAILED' });
    }
  }

  static async subscribeWebhooks(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as AuthRequest).user;
      const companyId = user?.isSuperAdmin ? ((req.body.companyId as string) || user?.companyId) : user?.companyId;
      if (!companyId) {
        res.status(400).json({ error: 'companyId is required', code: 'VALIDATION_ERROR' });
        return;
      }
      const result = await MetaService.subscribeAllConnectedApps(companyId);
      await recordAudit({
        actorId: user?.userId,
        action: 'META_WEBHOOKS_SUBSCRIBED',
        companyId,
        metadata: result,
      });
      res.json({
        success: true,
        message: `Linked app to ${result.pagesSubscribed} Pages and ${result.adAccountsSubscribed} Ad Accounts for real-time webhooks`,
        data: result,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'SUBSCRIPTION_FAILED' });
    }
  }

  static async getCampaignLeads(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as AuthRequest).user;
      const { campaignId } = req.query as { campaignId?: string };
      let companyId = user?.isSuperAdmin ? ((req.query.companyId as string) || user?.companyId) : user?.companyId;
      if (!companyId && req.query.companyId) companyId = req.query.companyId as string;
      if (!companyId) {
        const acc = await MetaAdAccount.findOne({ status: 'active' });
        companyId = acc?.companyId?.toString();
      }
      if (!campaignId) {
        res.status(400).json({ error: 'campaignId is required', code: 'VALIDATION_ERROR' });
        return;
      }
      if (!companyId) {
        res.status(400).json({ error: 'companyId is required', code: 'VALIDATION_ERROR' });
        return;
      }
      const isPrivileged = user?.isSuperAdmin || isPrivilegedRole(user?.role);
      if (!isPrivileged) {
        const { MetaCampaign } = await import('../../common/models/MetaCampaign');
        const camp = await MetaCampaign.findOne({ companyId, campaignId }).lean();
        if (camp?.branchId && !canAccessBranch(user, camp.branchId.toString())) {
          res.status(403).json({ error: 'Access denied: campaign belongs to a different branch', code: 'FORBIDDEN' });
          return;
        }
        const visible = await CampaignAccessService.filterCampaignsByGrant(user, companyId, [
          { campaignId, branchId: camp?.branchId?.toString() },
        ]);
        if (visible.length === 0) {
          res.status(403).json({ error: 'Access denied: no grant for this campaign', code: 'CAMPAIGN_FORBIDDEN' });
          return;
        }
      }
      const leads = await MetaService.getCampaignLeads(campaignId, companyId);
      res.json({ success: true, data: leads });
    } catch (error: any) {
      res.status(400).json({ error: error.message, code: 'CAMPAIGN_LEADS_FAILED' });
    }
  }

  static async assignCampaign(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as AuthRequest).user;
      const { campaignId } = req.params;
      const { branchId, name, adAccountId, metaAdAccountId } = req.body;
      let companyId = user?.isSuperAdmin ? ((req.body.companyId as string) || user?.companyId) : user?.companyId;
      if (!companyId) {
        const acc = await MetaAdAccount.findOne({ status: 'active' });
        companyId = acc?.companyId?.toString();
      }
      if (!campaignId) {
        res.status(400).json({ error: 'campaignId is required', code: 'VALIDATION_ERROR' });
        return;
      }
      if (!companyId) {
        res.status(400).json({ error: 'companyId is required', code: 'VALIDATION_ERROR' });
        return;
      }

      if (user && !user.isSuperAdmin && !isPrivilegedRole(user.role)) {
        const allowed = user.allowedBranchIds || [];
        if (!branchId || (allowed.length > 0 && !allowed.includes(branchId))) {
          res.status(403).json({ error: 'Cannot assign campaign to an unauthorized branch', code: 'FORBIDDEN' });
          return;
        }
        const { MetaCampaign } = await import('../../common/models/MetaCampaign');
        const existingCampaign = await MetaCampaign.findOne({ campaignId, companyId }).lean();
        if (existingCampaign?.branchId && !allowed.includes(existingCampaign.branchId.toString())) {
          res.status(403).json({ error: 'Cannot reassign a campaign belonging to another branch', code: 'FORBIDDEN' });
          return;
        }
        // Tier-3: with explicit grants in the campaign's branch, managing
        // needs a live 'manage' grant. Branches without grants inherit.
        const mayManage = await CampaignAccessService.canManageCampaign(
          user,
          companyId,
          campaignId,
          existingCampaign?.branchId?.toString() || branchId || undefined,
        );
        if (!mayManage) {
          res.status(403).json({ error: 'Requires a manage grant for this campaign', code: 'CAMPAIGN_FORBIDDEN' });
          return;
        }
      }

      const campaign = await MetaService.assignCampaign(campaignId, companyId, branchId, {
        name,
        adAccountId,
        metaAdAccountId,
      });
      await recordAudit({
        actorId: user?.userId,
        action: 'META_CAMPAIGN_ASSIGNED',
        companyId,
        branchId: branchId || undefined,
        metadata: { campaignId, campaignName: name },
      });
      res.json({ success: true, data: campaign });
    } catch (error: any) {
      res.status(400).json({ error: error.message, code: 'ASSIGN_ERROR' });
    }
  }

  static async getAdLeads(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as AuthRequest).user;
      const { adId } = req.params;
      let companyId = user?.isSuperAdmin ? ((req.query.companyId as string) || user?.companyId) : user?.companyId;
      if (!companyId && req.query.companyId) companyId = req.query.companyId as string;
      if (!companyId) {
        const acc = await MetaAdAccount.findOne({ status: 'active' });
        companyId = acc?.companyId?.toString();
      }
      if (!adId) {
        res.status(400).json({ error: 'adId is required', code: 'VALIDATION_ERROR' });
        return;
      }
      if (!companyId) {
        res.status(400).json({ error: 'companyId is required', code: 'VALIDATION_ERROR' });
        return;
      }
      const formId = req.query.formId as string | undefined;
      const campaignId = req.query.campaignId as string | undefined;
      // Ad-level reads are scoped through the parent campaign: restricted
      // users must name an accessible campaign (the UI always supplies it).
      if (!user?.isSuperAdmin && !isPrivilegedRole(user?.role)) {
        if (!campaignId) {
          res.status(400).json({ error: 'campaignId is required to scope ad leads', code: 'VALIDATION_ERROR' });
          return;
        }
        const { MetaCampaign } = await import('../../common/models/MetaCampaign');
        const camp = await MetaCampaign.findOne({ companyId, campaignId }).lean();
        if (camp?.branchId && !canAccessBranch(user, camp.branchId.toString())) {
          res.status(403).json({ error: 'Access denied: campaign belongs to a different branch', code: 'FORBIDDEN' });
          return;
        }
        const visible = await CampaignAccessService.filterCampaignsByGrant(user, companyId, [
          { campaignId, branchId: camp?.branchId?.toString() },
        ]);
        if (visible.length === 0) {
          res.status(403).json({ error: 'Access denied: no grant for this campaign', code: 'CAMPAIGN_FORBIDDEN' });
          return;
        }
      }
      const leads = await MetaService.getAdLeads(adId, companyId, formId);
      res.json({ success: true, data: leads });
    } catch (error: any) {
      res.status(400).json({ error: error.message, code: 'AD_LEADS_FAILED' });
    }
  }

  static async importLeadToCrm(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as AuthRequest).user;
      const { leadId, branchId, campaignId, campaignName, adId, adName, formId, tags } = req.body;
      let companyId = user?.isSuperAdmin ? ((req.body.companyId as string) || user?.companyId) : user?.companyId;
      if (!companyId) {
        const acc = await MetaAdAccount.findOne({ status: 'active' });
        companyId = acc?.companyId?.toString();
      }
      if (!leadId) {
        res.status(400).json({ error: 'leadId is required', code: 'VALIDATION_ERROR' });
        return;
      }
      if (!companyId) {
        res.status(400).json({ error: 'companyId is required', code: 'VALIDATION_ERROR' });
        return;
      }
      if (user && !user.isSuperAdmin && !isPrivilegedRole(user.role) && branchId) {
        const allowed = user.allowedBranchIds || [];
        if (allowed.length > 0 && !allowed.includes(branchId)) {
          res.status(403).json({ error: 'Cannot import lead into unauthorized branch', code: 'FORBIDDEN' });
          return;
        }
      }
      if (campaignId && user && !user.isSuperAdmin && !isPrivilegedRole(user.role)) {
        const mayManage = await CampaignAccessService.canManageCampaign(
          user,
          companyId,
          String(campaignId),
          branchId || undefined,
        );
        if (!mayManage) {
          res.status(403).json({ error: 'Requires a manage grant for this campaign', code: 'CAMPAIGN_FORBIDDEN' });
          return;
        }
      }
      const result = await MetaService.importLeadToCrm(leadId, companyId, branchId, {
        campaignId,
        campaignName,
        adId,
        adName,
        formId,
        tags,
      });
      await recordAudit({
        actorId: user?.userId,
        action: 'META_LEAD_IMPORTED',
        companyId,
        metadata: { leadId, result },
      });
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(400).json({ error: error.message, code: 'IMPORT_LEAD_FAILED' });
    }
  }

  static async getBranchSpend(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as AuthRequest).user;
      const { branchId } = req.params;
      const datePreset = (req.query.datePreset as string) || 'maximum';
      const since = req.query.since as string | undefined;
      const until = req.query.until as string | undefined;
      const timeRange = since && until ? { since, until } : undefined;

      let companyId = user?.isSuperAdmin ? ((req.query.companyId as string) || user?.companyId) : user?.companyId;
      if (!companyId) {
        const { Branch } = await import('../../common/models/Branch');
        const b = await Branch.findById(branchId).lean();
        companyId = b?.companyId?.toString();
      }

      if (!branchId || !companyId) {
        res.status(400).json({ error: 'branchId and companyId are required', code: 'VALIDATION_ERROR' });
        return;
      }

      if (user && !user.isSuperAdmin && !isPrivilegedRole(user.role)) {
        const allowed = user.allowedBranchIds || [];
        if (!allowed.includes(branchId) && user.branchId !== branchId) {
          res.status(403).json({ error: 'Access denied to this branch', code: 'FORBIDDEN' });
          return;
        }
      }

      const { MetaCampaign } = await import('../../common/models/MetaCampaign');
      let campaigns = await MetaCampaign.find({ companyId, branchId }).lean();

      // Tier-3 grant narrowing for restricted users.
      if (user && !user.isSuperAdmin && !isPrivilegedRole(user.role)) {
        campaigns = await CampaignAccessService.filterCampaignsByGrant(
          user,
          companyId,
          campaigns.map((c: any) => ({ ...c, campaignId: c.campaignId })),
        );
      }

      if (campaigns.length === 0) {
        res.json({
          success: true,
          data: {
            branchId,
            companyId,
            totalSpend: 0,
            currency: 'INR',
            campaignCount: 0,
            campaigns: [],
          },
        });
        return;
      }

      const adAccountIds = Array.from(new Set(campaigns.map((c) => c.adAccountId?.toString()).filter(Boolean)));
      const campaignIdsSet = new Set(campaigns.map((c) => c.campaignId));

      let totalSpend = 0;
      const detailedCampaigns: any[] = [];

      for (const adAccountDbId of adAccountIds) {
        try {
          const rawCampaigns = await MetaService.getCampaigns(adAccountDbId!, companyId, datePreset, timeRange);
          for (const rc of rawCampaigns) {
            if (campaignIdsSet.has(String(rc.id))) {
              const spendVal = parseFloat(rc.insights?.spend || '0') || 0;
              totalSpend += spendVal;
              detailedCampaigns.push({
                campaignId: String(rc.id),
                name: rc.name,
                status: rc.status,
                spend: spendVal,
                insights: rc.insights,
                adAccountId: rc.adAccountId,
                metaAdAccountId: rc.metaAdAccountId,
              });
            }
          }
        } catch (fetchErr) {
          logger.warn('Failed to fetch live insights for ad account in branch spend', { adAccountDbId, error: fetchErr });
        }
      }

      const foundIds = new Set(detailedCampaigns.map((dc) => dc.campaignId));
      for (const c of campaigns) {
        if (!foundIds.has(c.campaignId)) {
          detailedCampaigns.push({
            campaignId: c.campaignId,
            name: c.name,
            status: c.status || 'UNKNOWN',
            spend: 0,
            adAccountId: c.adAccountId,
            metaAdAccountId: c.metaAdAccountId,
          });
        }
      }

      res.json({
        success: true,
        data: {
          branchId,
          companyId,
          totalSpend: Math.round(totalSpend * 100) / 100,
          currency: 'INR',
          campaignCount: detailedCampaigns.length,
          campaigns: detailedCampaigns,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'BRANCH_SPEND_FAILED' });
    }
  }

  /**
   * POST /api/meta/capi/events – send a downstream conversion event to Meta
   * (Conversions API). Used for funnel feedback, e.g. BookingRequested →
   * TestDriveCompleted → Purchase, so Meta optimizes for quality bookings.
   * Body: { companyId?, eventName, eventTime?, eventId?, leadId?, userData?,
   *         customData?, eventSourceUrl?, actionSource?, testEventCode? }
   */
  static async sendCapiEvent(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as AuthRequest).user;
      const companyId = user?.isSuperAdmin ? ((req.body.companyId as string) || user?.companyId) : user?.companyId;
      if (!companyId) {
        res.status(400).json({ error: 'companyId is required', code: 'VALIDATION_ERROR' });
        return;
      }
      const result = await MetaCapiService.sendEvent({
        companyId,
        eventName: req.body.eventName,
        eventTime: req.body.eventTime,
        eventId: req.body.eventId,
        leadId: req.body.leadId,
        userData: req.body.userData,
        customData: req.body.customData,
        eventSourceUrl: req.body.eventSourceUrl,
        actionSource: req.body.actionSource,
        testEventCode: req.body.testEventCode,
      });
      await recordAudit({
        actorId: user?.userId,
        action: 'CAPI_EVENT_SENT',
        companyId,
        metadata: { eventName: req.body.eventName, eventId: result.eventId, leadId: req.body.leadId },
      });
      res.json({ success: true, data: result });
    } catch (error: any) {
      if (error instanceof MetaPermanentError) {
        res.status(400).json({ error: error.message, code: error.code });
        return;
      }
      res.status(502).json({ error: error.message, code: 'CAPI_SEND_FAILED' });
    }
  }
}

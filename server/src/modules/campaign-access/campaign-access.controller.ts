import { Response } from 'express';
import { AuthRequest } from '../../common/middleware/auth';
import { isPrivilegedRole } from '../../common/middleware/auth';
import { canAccessBranch } from '../../common/middleware/tenant';
import { CampaignAccessService, GrantInput } from '../../common/services/CampaignAccessService';
import { MetaCampaign } from '../../common/models/MetaCampaign';
import { MetaAdAccount } from '../../common/models/MetaAdAccount';
import { Branch } from '../../common/models/Branch';
import { User } from '../../common/models/User';
import { AuthController } from '../auth/auth.controller';

/**
 * Branch isolation for own-grant listings. A restricted user scoped to one
 * branch (header-selected or primary) must never see another branch's rows.
 * Privileged company roles and super admins keep the unfiltered view.
 */
function scopeGrantsToActiveBranch(user: AuthRequest['user'], grants: any[]): any[] {
  if (!user || user.isSuperAdmin || isPrivilegedRole(user.role) || !user.branchId) return grants;
  return grants.filter((g) => String(g.branchId) === String(user.branchId));
}

async function loadTargetUser(req: AuthRequest, res: Response) {
  const target = await User.findById(req.params.userId);
  if (!target) {
    res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' });
    return null;
  }
  const me = req.user;
  if (!me?.isSuperAdmin && target.companyId?.toString() !== me?.companyId) {
    res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
    return null;
  }
  return { target, me };
}

export class CampaignAccessController {
  /**
   * GET /api/campaign-access/mine – own live grants (for "My access" UI).
   * Branch-restricted users with an active branch context (validated
   * x-branch-id header → req.user.branchId) see only that branch's grants –
   * no branch-to-branch leakage. Company-wide roles keep the full view.
   */
  static async myGrants(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required', code: 'NO_AUTH' });
        return;
      }
      const companyId = req.user.companyId;
      if (!companyId) {
        res.json({ success: true, data: [] });
        return;
      }
      const grants = await CampaignAccessService.getActiveGrants(companyId, req.user.userId);
      res.json({ success: true, data: scopeGrantsToActiveBranch(req.user, grants) });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  /**
   * GET /api/campaign-access/mine/detailed – own grants enriched for the
   * My Campaigns workspace: Meta campaign data (status/objective), branch
   * name and ad-account linkage used for metrics, preview, leads and links.
   */
  static async myDetailedGrants(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required', code: 'NO_AUTH' });
        return;
      }
      const companyId = req.user.companyId;
      if (!companyId) {
        res.json({ success: true, data: [] });
        return;
      }
      const grants = scopeGrantsToActiveBranch(
        req.user,
        await CampaignAccessService.getActiveGrants(companyId, req.user.userId),
      );
      if (grants.length === 0) {
        res.json({ success: true, data: [] });
        return;
      }
      const campaignIds = [...new Set(grants.map((g) => String(g.campaignId)))];
      const docs = await MetaCampaign.find({ companyId, campaignId: { $in: campaignIds } })
        .select('campaignId name status effectiveStatus objective branchId adAccountId metaAdAccountId')
        .lean();
      const docById = new Map(docs.map((d: any) => [String(d.campaignId), d]));
      const branchIds = [...new Set(docs.map((d: any) => d.branchId).filter(Boolean).map(String))];
      const accountIds = [...new Set(docs.map((d: any) => d.adAccountId).filter(Boolean).map(String))];
      const [branches, accounts] = await Promise.all([
        branchIds.length > 0
          ? Branch.find({ _id: { $in: branchIds } }).select('name branchCode').lean()
          : Promise.resolve([]),
        accountIds.length > 0
          ? MetaAdAccount.find({ _id: { $in: accountIds } }).select('name metaAdAccountId').lean()
          : Promise.resolve([]),
      ]);
      const branchById = new Map((branches as any[]).map((b: any) => [String(b._id), b]));
      const accountById = new Map((accounts as any[]).map((a: any) => [String(a._id), a]));
      const data = grants.map((g: any) => {
        const doc = docById.get(String(g.campaignId));
        const branch = doc?.branchId ? branchById.get(String(doc.branchId)) : undefined;
        const account = doc?.adAccountId ? accountById.get(String(doc.adAccountId)) : undefined;
        return {
          ...g,
          campaignName: g.campaignName || doc?.name || String(g.campaignId),
          status: doc?.status,
          effectiveStatus: doc?.effectiveStatus,
          objective: doc?.objective,
          branchName: branch?.name,
          branchCode: branch?.branchCode,
          adAccountId: doc?.adAccountId,
          adAccountName: account?.name || doc?.metaAdAccountId,
          metaAdAccountId: doc?.metaAdAccountId,
        };
      });
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  /**
   * GET /api/campaign-access/user/:userId – live grants of a team member.
   * Restricted requesters only see grants inside their own branches.
   */
  static async userGrants(req: AuthRequest, res: Response): Promise<void> {
    try {
      const scoped = await loadTargetUser(req, res);
      if (!scoped) return;
      const { target, me } = scoped;
      const companyId = target.companyId!.toString();
      let grants = await CampaignAccessService.getActiveGrants(companyId, target._id.toString());
      if (!me?.isSuperAdmin && !isPrivilegedRole(me?.role)) {
        const allowed = new Set((me?.allowedBranchIds || []).map(String));
        grants = grants.filter((g) => !g.branchId || allowed.has(g.branchId.toString()));
      }
      res.json({ success: true, data: grants });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  /**
   * PUT /api/campaign-access/user/:userId – replace grants inside one branch.
   * Body: { branchId, grants: [{ campaignId, access?, expiresAt? }] }
   * The target user must hold membership in the branch (no orphan grants).
   */
  static async replaceUserGrants(req: AuthRequest, res: Response): Promise<void> {
    try {
      const scoped = await loadTargetUser(req, res);
      if (!scoped) return;
      const { target, me } = scoped;
      const companyId = target.companyId!.toString();
      const { branchId, grants } = req.body as { branchId?: string; grants?: GrantInput[] };

      if (!branchId) {
        res.status(400).json({ error: 'branchId is required', code: 'VALIDATION_ERROR' });
        return;
      }
      if (grants !== undefined && !Array.isArray(grants)) {
        res.status(400).json({ error: 'grants must be an array', code: 'VALIDATION_ERROR' });
        return;
      }

      // Target must belong to the branch – grants without membership leak nothing but are meaningless.
      const targetBranches = await AuthController.resolveAllowedBranchIds(target._id.toString());
      if (!targetBranches.map(String).includes(String(branchId))) {
        res.status(400).json({
          error: 'Target user has no membership in this branch. Assign the branch first.',
          code: 'TARGET_NOT_IN_BRANCH',
        });
        return;
      }

      const created = await CampaignAccessService.replaceBranchGrants(
        companyId,
        String(branchId),
        target._id.toString(),
        grants || [],
        me?.userId,
      );
      res.json({ success: true, data: created });
    } catch (error: any) {
      res.status(400).json({ error: error.message, code: 'GRANT_ERROR' });
    }
  }

  /**
   * GET /api/campaign-access/branch/:branchId/campaigns – checklist source:
   * MetaCampaign docs synced for the branch. Optional query filters narrow to
   * one ad account: ?adAccountId=<mongo id> or ?metaAdAccountId=<act_...>.
   */
  static async branchCampaigns(req: AuthRequest, res: Response): Promise<void> {
    try {
      const me = req.user;
      const branchId = String(req.params.branchId);
      if (!me?.isSuperAdmin && !canAccessBranch(me, branchId)) {
        res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
        return;
      }
      const filter: Record<string, unknown> = { branchId };
      if (me?.companyId) filter.companyId = me.companyId;
      const adAccountId = req.query.adAccountId as string | undefined;
      const metaAdAccountId = req.query.metaAdAccountId as string | undefined;
      if (adAccountId) filter.adAccountId = adAccountId;
      if (metaAdAccountId) filter.metaAdAccountId = metaAdAccountId;
      const campaigns = await MetaCampaign.find(filter)
        .select('campaignId name status effectiveStatus objective branchId metaAdAccountId adAccountId updatedAt')
        .sort({ name: 1 })
        .lean();
      res.json({ success: true, data: campaigns });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  /**
   * GET /api/campaign-access/branch/:branchId/adaccounts – second step of the
   * assignment flow: ad accounts visible in this branch (directly assigned OR
   * referenced by the branch's synced campaigns), each with its campaign count.
   */
  static async branchAdAccounts(req: AuthRequest, res: Response): Promise<void> {
    try {
      const me = req.user;
      const branchId = String(req.params.branchId);
      if (!me?.isSuperAdmin && !canAccessBranch(me, branchId)) {
        res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
        return;
      }
      const companyFilter: Record<string, unknown> = { branchId };
      if (me?.companyId) companyFilter.companyId = me.companyId;

      const campaigns = await MetaCampaign.find(companyFilter)
        .select('adAccountId metaAdAccountId')
        .lean();

      const byMongoId = new Map<string, { count: number; metaIds: Set<string> }>();
      const orphanMetaIds = new Map<string, number>();
      for (const c of campaigns) {
        const mongoId = (c as any).adAccountId ? String((c as any).adAccountId) : '';
        const metaId = (c as any).metaAdAccountId ? String((c as any).metaAdAccountId) : '';
        if (mongoId) {
          if (!byMongoId.has(mongoId)) byMongoId.set(mongoId, { count: 0, metaIds: new Set() });
          byMongoId.get(mongoId)!.count += 1;
          if (metaId) byMongoId.get(mongoId)!.metaIds.add(metaId);
        } else if (metaId) {
          orphanMetaIds.set(metaId, (orphanMetaIds.get(metaId) || 0) + 1);
        }
      }

      const accountFilter: Record<string, unknown> = {};
      if (me?.companyId) accountFilter.companyId = me.companyId;
      const or: Record<string, unknown>[] = [{ branchId }];
      if (byMongoId.size > 0) or.push({ _id: { $in: [...byMongoId.keys()] } });
      if (orphanMetaIds.size > 0) or.push({ metaAdAccountId: { $in: [...orphanMetaIds.keys()] } });
      accountFilter.$or = or;

      const accounts = await MetaAdAccount.find(accountFilter)
        .select('_id name metaAdAccountId companyId branchId status')
        .sort({ name: 1 })
        .lean();

      const data = accounts.map((a: any) => {
        const id = String(a._id);
        const viaCampaigns = byMongoId.get(id)?.count || 0;
        const viaMeta = a.metaAdAccountId ? orphanMetaIds.get(String(a.metaAdAccountId)) || 0 : 0;
        return {
          _id: a._id,
          name: a.name || a.metaAdAccountId,
          metaAdAccountId: a.metaAdAccountId,
          companyId: a.companyId,
          branchId: a.branchId,
          status: a.status,
          campaignCount: viaCampaigns + viaMeta,
        };
      });
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }
}

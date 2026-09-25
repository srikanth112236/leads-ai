import { Types } from 'mongoose';
import { CampaignAssignment, ICampaignAssignmentDoc } from '../models/CampaignAssignment';
import { MetaCampaign } from '../models/MetaCampaign';
import { Branch } from '../models/Branch';
import { isPrivilegedRole } from '../middleware/auth';
import { recordAudit } from './audit';

export interface GrantInput {
  campaignId: string;
  campaignName?: string;
  /** Defaults to 'view'. */
  access?: 'view' | 'manage';
  /** Optional ISO date string – grant auto-expires afterwards. */
  expiresAt?: string;
}

interface AccessUser {
  userId: string;
  role?: string;
  isSuperAdmin?: boolean;
}

function isGrantLive(row: ICampaignAssignmentDoc): boolean {
  if (!row.isActive) return false;
  if (row.expiresAt && new Date(row.expiresAt).getTime() <= Date.now()) return false;
  return true;
}

export class CampaignAccessService {
  /**
   * All live (active + unexpired) grant rows for a user in a company.
   */
  static async getActiveGrants(companyId: string, userId: string): Promise<ICampaignAssignmentDoc[]> {
    const rows = await CampaignAssignment.find({
      companyId: new Types.ObjectId(companyId),
      userId: new Types.ObjectId(userId),
      isActive: true,
      $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    })
      .sort({ campaignId: 1 })
      .lean();
    return rows as unknown as ICampaignAssignmentDoc[];
  }

  static async getGrantedCampaignIds(
    companyId: string,
    userId: string,
    branchId?: string,
  ): Promise<string[]> {
    const rows = await this.getActiveGrants(companyId, userId);
    const scoped = branchId ? rows.filter((r) => String(r.branchId) === String(branchId)) : rows;
    return [...new Set(scoped.map((r) => String(r.campaignId)))];
  }

  static async hasManageGrant(companyId: string, userId: string, campaignId: string): Promise<boolean> {
    const count = await CampaignAssignment.countDocuments({
      companyId: new Types.ObjectId(companyId),
      userId: new Types.ObjectId(userId),
      campaignId: String(campaignId),
      access: 'manage',
      isActive: true,
      $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    });
    return count > 0;
  }

  /**
   * Narrow a campaign list to what the user may VIEW – per branch.
   * Privileged roles see everything. For each branch represented in the list:
   * branches WITH grants narrow to exactly the granted ids; branches WITHOUT
   * grants inherit branch scoping (applied by the caller). Items whose branch
   * is unknown inherit (unassigned/live-unsynced policy).
   */
  static async filterCampaignsByGrant<T extends { campaignId?: any; id?: any; branchId?: any }>(
    user: AccessUser | undefined,
    companyId: string,
    campaigns: T[],
  ): Promise<T[]> {
    if (!user || user.isSuperAdmin || isPrivilegedRole(user.role)) return campaigns;
    const rows = await this.getActiveGrants(companyId, user.userId);
    if (rows.length === 0) return campaigns;
    const byBranch = new Map<string, Set<string>>();
    for (const r of rows) {
      const key = r.branchId ? String(r.branchId) : 'unassigned';
      if (!byBranch.has(key)) byBranch.set(key, new Set());
      byBranch.get(key)!.add(String(r.campaignId));
    }
    return campaigns.filter((c) => {
      const branchKey = (c as any).branchId ? String((c as any).branchId) : 'unknown';
      if (branchKey === 'unknown') return true;
      const branchGrants = byBranch.get(branchKey);
      if (!branchGrants || branchGrants.size === 0) return true;
      return branchGrants.has(String((c as any).campaignId ?? (c as any).id));
    });
  }

  /**
   * Whether the user may MANAGE (assign branch / import leads for) a campaign.
   * Requires the branch gate to have passed already; this adds the grant tier:
   * when the user holds grants IN THE CAMPAIGN'S BRANCH, the campaign must
   * carry a live 'manage' grant. Branches without grants inherit.
   */
  static async canManageCampaign(
    user: AccessUser | undefined,
    companyId: string,
    campaignId: string,
    branchId?: string,
  ): Promise<boolean> {
    if (!user || user.isSuperAdmin || isPrivilegedRole(user.role)) return true;
    const rows = await this.getActiveGrants(companyId, user.userId);
    if (rows.length === 0) return true;
    if (branchId) {
      const inBranch = rows.filter((r) => String(r.branchId) === String(branchId));
      if (inBranch.length === 0) return true;
      const now = Date.now();
      return inBranch.some(
        (r) =>
          String(r.campaignId) === String(campaignId) &&
          r.access === 'manage' &&
          (!r.expiresAt || new Date(r.expiresAt).getTime() > now),
      );
    }
    return this.hasManageGrant(companyId, user.userId, campaignId);
  }

  /**
   * Replace all grants of a user inside one branch (PUT semantics).
   * Validates: branch belongs to company, campaigns exist in the company.
   */
  static async replaceBranchGrants(
    companyId: string,
    branchId: string,
    targetUserId: string,
    grants: GrantInput[],
    actorId?: string,
  ): Promise<ICampaignAssignmentDoc[]> {
    const branch = await Branch.findById(branchId).lean();
    if (!branch || branch.companyId.toString() !== String(companyId)) {
      throw new Error('Branch does not belong to this company');
    }

    const wanted = new Map<string, GrantInput>();
    for (const g of grants || []) {
      const id = String(g.campaignId || '').trim();
      if (id) wanted.set(id, g);
    }

    if (wanted.size > 0) {
      const known = await MetaCampaign.find({
        companyId: new Types.ObjectId(companyId),
        campaignId: { $in: [...wanted.keys()] },
      })
        .select('campaignId')
        .lean();
      const knownIds = new Set(known.map((k) => String(k.campaignId)));
      const unknown = [...wanted.keys()].filter((id) => !knownIds.has(id));
      if (unknown.length > 0) {
        throw new Error(`Unknown campaigns for this company: ${unknown.slice(0, 5).join(', ')}`);
      }
    }

    const companyObj = new Types.ObjectId(companyId);
    const branchObj = new Types.ObjectId(branchId);
    const userObj = new Types.ObjectId(targetUserId);

    await CampaignAssignment.deleteMany({ companyId: companyObj, branchId: branchObj, userId: userObj });

    const docs = [...wanted.entries()].map(([campaignId, g]) => ({
      companyId: companyObj,
      branchId: branchObj,
      campaignId,
      campaignName: g.campaignName,
      userId: userObj,
      access: g.access === 'manage' ? 'manage' : 'view',
      grantedBy: actorId ? new Types.ObjectId(actorId) : undefined,
      expiresAt: g.expiresAt ? new Date(g.expiresAt) : undefined,
      isActive: true,
    }));

    const created = docs.length > 0 ? await CampaignAssignment.insertMany(docs) : [];

    await recordAudit({
      actorId,
      action: 'CAMPAIGN_ACCESS_GRANTED',
      companyId,
      branchId,
      metadata: {
        targetUserId,
        grants: [...wanted.entries()].map(([campaignId, g]) => ({
          campaignId,
          access: g.access === 'manage' ? 'manage' : 'view',
          expiresAt: g.expiresAt,
        })),
      },
    });

    return created as unknown as ICampaignAssignmentDoc[];
  }

  /**
   * Hard-delete expired / deactivated rows (called from retention + tests).
   * Returns the number of removed rows.
   */
  static async purgeExpired(companyId?: string): Promise<number> {
    const filter: Record<string, unknown> = {
      $or: [{ expiresAt: { $lte: new Date() } }, { isActive: false }],
    };
    if (companyId) filter.companyId = new Types.ObjectId(companyId);
    const res = await CampaignAssignment.deleteMany(filter);
    return res.deletedCount || 0;
  }
}

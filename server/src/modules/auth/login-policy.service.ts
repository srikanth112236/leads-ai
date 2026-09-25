import { User } from '../../common/models/User';
import { Branch } from '../../common/models/Branch';
import { RoleModel } from '../../common/models/RoleModel';
import { CompanyMembership } from '../../common/models/CompanyMembership';
import { Role } from '../../common/types';
import { logger } from '../../common/utils/logger';

/** Access windows (days) for the 90-day rolling account access. */
export const ACCESS_VALIDITY_DAYS = 90;
export const ACCESS_WARNING_DAYS = 3;
export const REAUTH_GRACE_HOURS = 24;

/** Company-level accounts: 3 devices of any kind. */
export const COMPANY_TIER_MAX = 3;
/** Branch-level accounts (any role): 1 web + 1 mobile. */
export const BRANCH_TIER_MAX_PER_KIND = 1;

export type DeviceKind = 'web' | 'mobile';

export function detectDeviceKind(userAgent?: string): DeviceKind {
  const ua = userAgent || '';
  return /Mobile|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) ? 'mobile' : 'web';
}

const COMPANY_TIER_ROLES = [Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.COMPANY_MANAGER, 'SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER'];

/** Branch tier applies to everyone except company-level system roles. */
export function isBranchTier(role?: string): boolean {
  return !COMPANY_TIER_ROLES.includes(String(role || ''));
}

export function accessWindow(from: Date = new Date()): Date {
  return new Date(from.getTime() + ACCESS_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
}

export function accessDaysLeft(expiresAt?: Date | null): number | null {
  if (!expiresAt) return null;
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

export interface ApproverInfo {
  userId: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

export class LoginPolicyService {
  /** The company's default (main business) branch – oldest marked, else oldest created. */
  static async getDefaultBranch(companyId: string): Promise<any | null> {
    const marked = await Branch.findOne({ companyId, isDefault: true }).lean();
    if (marked) return marked;
    return Branch.findOne({ companyId }).sort({ createdAt: 1 }).lean();
  }

  /**
   * Idempotent backfill: existing accounts get a 90-day window from deploy
   * so nobody is locked out by the new enforcement.
   */
  static async backfillAccessWindows(): Promise<number> {
    const cutoff = accessWindow();
    const result = await User.updateMany(
      { $or: [{ accessExpiresAt: { $exists: false } }, { accessExpiresAt: null }] },
      { $set: { accessExpiresAt: cutoff } },
    );
    const count = (result as any).modifiedCount || 0;
    if (count > 0) logger.info('Access-window backfill complete', { count });
    return count;
  }

  /** Idempotent backfill: every company ends up with exactly one default branch and default admin attached. */
  static async backfillDefaults(): Promise<number> {
    const { Company } = await import('../../common/models/Company');
    const { BranchMembership } = await import('../../common/models/BranchMembership');
    const companies = await Company.find({});
    let fixed = 0;
    for (const c of companies) {
      const companyId = String((c as any)._id);
      let defaultBranch = await Branch.findOne({ companyId, isDefault: true }).sort({ createdAt: 1 });
      if (!defaultBranch) {
        defaultBranch = await Branch.findOne({ companyId }).sort({ createdAt: 1 });
        if (defaultBranch) {
          defaultBranch.isDefault = true;
          await defaultBranch.save();
          fixed += 1;
        }
      }

      if (defaultBranch) {
        // 1. Ensure company.defaultBranchId is set
        if (String(c.defaultBranchId || '') !== String(defaultBranch._id)) {
          c.defaultBranchId = defaultBranch._id as any;
          await c.save();
          fixed += 1;
        }

        // 2. Ensure other branches are not marked isDefault
        const unmarkRes = await Branch.updateMany(
          { companyId, _id: { $ne: defaultBranch._id }, isDefault: true },
          { $set: { isDefault: false } }
        );
        if (unmarkRes.modifiedCount > 0) fixed += unmarkRes.modifiedCount;

        // 3. Ensure the company's admin(s) have branchId pointing to this default branch
        const admins = await User.find({
          companyId,
          role: { $in: [Role.COMPANY_ADMIN, 'COMPANY_ADMIN', 'company_admin'] },
        }).sort({ createdAt: 1 });

        for (const admin of admins) {
          if (!admin.branchId) {
            admin.branchId = defaultBranch._id as any;
            await admin.save();
            fixed += 1;
          }

          // Ensure CompanyMembership includes the default branch
          await CompanyMembership.findOneAndUpdate(
            { userId: admin._id, companyId },
            {
              $addToSet: { branchIds: defaultBranch._id },
              $setOnInsert: { role: Role.COMPANY_ADMIN, isActive: true },
            },
            { upsert: true }
          );

          // Ensure BranchMembership exists
          const existingBm = await BranchMembership.findOne({
            userId: admin._id,
            branchId: defaultBranch._id,
          });
          if (!existingBm) {
            await BranchMembership.create({
              userId: admin._id,
              branchId: defaultBranch._id,
              role: Role.COMPANY_ADMIN,
              accessLevel: 'full_manage',
              isActive: true,
            });
            fixed += 1;
          }
        }
      }
    }
    if (fixed > 0) logger.info('Default-branch and default-admin backfill complete', { fixed });
    return fixed;
  }

  /**
   * Who may approve device logins for a company: company admins of the
   * default branch first, then any company admin, then custom roles holding
   * the logins:approve permission. Deduplicated, active users only.
   */
  static async resolveApprovers(companyId: string): Promise<ApproverInfo[]> {
    const [admins, approvalRoles] = await Promise.all([
      User.find({ companyId, role: Role.COMPANY_ADMIN, isActive: true })
        .select('_id email firstName lastName branchId')
        .lean(),
      RoleModel.find({
        permissions: 'logins:approve',
        isActive: true,
        $or: [{ companyId }, { companyId: null }],
      }).select('_id').lean(),
    ]);
    const roleIds = approvalRoles.map((r: any) => r._id);
    const customHolders = roleIds.length > 0
      ? await User.find({ companyId, roleId: { $in: roleIds }, isActive: true })
        .select('_id email firstName lastName branchId')
        .lean()
      : [];

    const seen = new Set<string>();
    const out: ApproverInfo[] = [];
    const push = (u: any) => {
      const id = String(u._id);
      if (seen.has(id)) return;
      seen.add(id);
      out.push({ userId: id, email: u.email, firstName: u.firstName, lastName: u.lastName });
    };

    const def = await this.getDefaultBranch(companyId);
    if (def) {
      const defId = String((def as any)._id);
      const memberships = await CompanyMembership.find({ companyId, isActive: true }).select('userId branchIds role').lean();
      const inDefault = new Set(
        memberships.filter((m: any) => (m.branchIds || []).map(String).includes(defId)).map((m: any) => String(m.userId)),
      );
      for (const a of admins) {
        const primary = (a as any).branchId ? String((a as any).branchId) : '';
        if (primary === defId || inDefault.has(String((a as any)._id))) push(a);
      }
    }
    for (const a of admins) push(a);
    for (const u of customHolders) push(u);
    return out;
  }
}

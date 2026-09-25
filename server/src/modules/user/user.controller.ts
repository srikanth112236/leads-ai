import { Request, Response } from 'express';
import { User } from '../../common/models/User';
import { BaseController } from '../../common/controllers/BaseController';
import { TenantContextService } from '../../common/services/TenantContextService';
import { AuthRequest, hasAnyRole } from '../../common/middleware/auth';
import { hashPassword } from '../../common/security/hash';
import { recordAudit } from '../../common/services/audit';
import { Role } from '../../common/types';

import { Branch } from '../../common/models/Branch';
import { BranchMembership } from '../../common/models/BranchMembership';
import { CompanyMembership } from '../../common/models/CompanyMembership';
import { RoleModel } from '../../common/models/RoleModel';

const SAFE_FIELDS = 'email firstName lastName role roleId customPermissions companyId branchId phone isActive lastLoginAt createdAt accessId onboardingStatus';

const RANK: Record<string, number> = {
  [Role.SALES_AGENT]: 1,
  [Role.BRANCH_MANAGER]: 2,
  [Role.COMPANY_MANAGER]: 3,
  [Role.COMPANY_ADMIN]: 4,
  [Role.SUPER_ADMIN]: 5,
};

async function resolveRoleAndValidateRank(
  roleInput: string | undefined,
  roleIdInput: string | undefined,
  me: any,
  companyId?: string
): Promise<{ role: string; roleId?: any; error?: string; status?: number }> {
  if (!roleInput && !roleIdInput) {
    return { role: Role.SALES_AGENT };
  }

  let roleSlug = roleInput;
  let roleDoc: any = null;

  if (roleIdInput) {
    roleDoc = await RoleModel.findById(roleIdInput);
    if (!roleDoc) {
      return { error: 'Specified role not found', status: 400, role: '' };
    }
    const upper = (roleDoc.slug || '').toUpperCase();
    if (Object.values(Role).includes(upper as Role)) {
      roleSlug = upper;
    } else {
      roleSlug = roleDoc.slug;
    }
  } else if (roleInput) {
    const upper = roleInput.toUpperCase();
    if (Object.values(Role).includes(upper as Role)) {
      roleSlug = upper;
      roleDoc = await RoleModel.findOne({ slug: roleInput.toLowerCase(), companyId: null });
    } else {
      roleDoc = await RoleModel.findOne({
        slug: roleInput.toLowerCase(),
        $or: [{ companyId }, { companyId: null }],
      });
      if (!roleDoc) {
        return { error: 'Invalid role', status: 400, role: '' };
      }
      roleSlug = roleDoc.slug;
    }
  }

  if (!me?.isSuperAdmin) {
    if (roleSlug && Object.values(Role).includes(roleSlug as Role)) {
      if ((RANK[roleSlug] || 0) >= (RANK[me?.role || Role.SALES_AGENT] || 0)) {
        return { error: 'Cannot create or grant a user at or above your own role', status: 403, role: '' };
      }
    } else if (roleSlug === 'super_admin' || roleSlug === Role.SUPER_ADMIN) {
      return { error: 'Cannot create or grant Super Admin', status: 403, role: '' };
    } else if (me?.role === Role.BRANCH_MANAGER) {
      if (roleDoc && roleDoc.rank <= 30) {
        return { error: 'Cannot grant a managerial role', status: 403, role: '' };
      }
    }
  }

  return {
    role: roleSlug || Role.SALES_AGENT,
    roleId: roleDoc?._id || undefined,
  };
}

async function loadScopedUser(req: Request, res: Response) {
  const target = await User.findById(req.params.id);
  if (!target) {
    res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' });
    return null;
  }
  const me = (req as AuthRequest).user;
  if (!me?.isSuperAdmin && target.companyId?.toString() !== me?.companyId) {
    res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
    return null;
  }
  return { target, me };
}

export class UserController extends BaseController {
  static async getOne(req: Request, res: Response): Promise<void> {
    try {
      const scoped = await loadScopedUser(req, res);
      if (!scoped) return;
      const { target } = scoped;
      const safe = await User.findById(target._id).select(SAFE_FIELDS).populate('roleId', 'name slug permissions rank isSystem').lean();
      if (!safe) {
        res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' });
        return;
      }
      const allMemberships = await BranchMembership.find({ userId: target._id, isActive: true })
        .populate('branchId', 'name branchCode isDefault')
        .lean();
      let branches = allMemberships.map((m: any) => ({
        id: (m.branchId as any)?._id?.toString() || m.branchId?.toString(),
        name: (m.branchId as any)?.name || 'Branch',
        branchCode: (m.branchId as any)?.branchCode,
        isDefault: Boolean((m.branchId as any)?.isDefault),
      }));

      // Fallback for primary/default branch if membership record is not yet generated
      if (branches.length === 0 && safe.branchId) {
        const { Branch } = await import('../../common/models/Branch');
        const b = await Branch.findById(safe.branchId).select('name branchCode isDefault').lean();
        if (b) {
          branches.push({
            id: b._id.toString(),
            name: b.name,
            branchCode: b.branchCode,
            isDefault: Boolean(b.isDefault),
          });
        }
      } else if (branches.length === 0 && (safe.role === 'COMPANY_ADMIN' || safe.role === Role.COMPANY_ADMIN) && safe.companyId) {
        const { Branch } = await import('../../common/models/Branch');
        const b = await Branch.findOne({ companyId: safe.companyId, isDefault: true }).select('name branchCode isDefault').lean();
        if (b) {
          branches.push({
            id: b._id.toString(),
            name: b.name,
            branchCode: b.branchCode,
            isDefault: true,
          });
        }
      }

      const safeObj = safe as any;
      safeObj.branches = branches;
      safeObj.branchCount = branches.length;
      safeObj.branchIds = branches.map((b: any) => b.id);
      res.json({ success: true, data: safeObj });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as AuthRequest).user;
      const scope = req.query.scope as string | undefined;
      if (scope === 'staff' && !user?.isSuperAdmin) {
        res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
        return;
      }
      const filter: any = scope === 'staff'
        ? { $or: [{ companyId: { $exists: false } }, { companyId: null }] }
        : TenantContextService.getTenantFilter(req as AuthRequest);

      // If Branch Manager (any case) or restricted branch user, limit user visibility to team members in their branches
      if (user && hasAnyRole(user.role, Role.BRANCH_MANAGER) && user.allowedBranchIds.length > 0 && !filter.branchId) {
        const branchMembers = await BranchMembership.find({ branchId: { $in: user.allowedBranchIds }, isActive: true }).select('userId').lean();
        const memberUserIds = branchMembers.map((m) => m.userId);
        filter.$or = [
          { branchId: { $in: user.allowedBranchIds } },
          { _id: { $in: memberUserIds } },
        ];
      } else if (filter.branchId) {
        const targetBranchId = filter.branchId;
        delete filter.branchId;
        const branchMembers = await BranchMembership.find({ branchId: targetBranchId, isActive: true }).select('userId').lean();
        const memberUserIds = branchMembers.map((m) => m.userId);
        filter.$or = [
          { branchId: targetBranchId },
          { _id: { $in: memberUserIds } },
        ];
      }

      const users = await User.find(filter).select(SAFE_FIELDS).populate('roleId', 'name slug permissions rank isSystem').sort({ createdAt: -1 }).lean();
      const userIds = users.map((u) => u._id);

      // Fetch all branch memberships to show accurate multi-branch associations
      const memberships = await BranchMembership.find({ userId: { $in: userIds }, isActive: true })
        .populate('branchId', 'name branchCode isDefault')
        .lean();

      const userBranchMap = new Map<string, any[]>();
      for (const m of memberships) {
        const uid = m.userId.toString();
        if (!userBranchMap.has(uid)) userBranchMap.set(uid, []);
        if (m.branchId) {
          userBranchMap.get(uid)!.push({
            id: (m.branchId as any)._id?.toString() || m.branchId.toString(),
            name: (m.branchId as any).name || 'Branch',
            branchCode: (m.branchId as any).branchCode,
            isDefault: Boolean((m.branchId as any).isDefault),
          });
        }
      }

      // Also ensure primary branch is included if membership is missing
      const primaryBranchIds = users.map((u) => u.branchId).filter(Boolean);
      const companyIds = users.map((u) => u.companyId).filter(Boolean);
      const branches = await Branch.find({
        $or: [{ _id: { $in: primaryBranchIds } }, { companyId: { $in: companyIds }, isDefault: true }],
      }).select('name branchCode isDefault companyId').lean();
      const branchLookup = new Map(branches.map((b) => [b._id.toString(), b]));
      const defaultBranchByCompany = new Map(
        branches.filter((b) => b.isDefault).map((b) => [b.companyId.toString(), b])
      );

      const enriched = users.map((u: any) => {
        let assigned = userBranchMap.get(u._id.toString()) || [];
        if (assigned.length === 0 && u.branchId) {
          const b = branchLookup.get(u.branchId.toString());
          if (b) {
            assigned.push({
              id: b._id.toString(),
              name: b.name,
              branchCode: b.branchCode,
              isDefault: Boolean(b.isDefault),
            });
          }
        }
        // Fallback for company admin if branchId is empty
        if (assigned.length === 0 && (u.role === 'COMPANY_ADMIN' || u.role === Role.COMPANY_ADMIN) && u.companyId) {
          const defB = defaultBranchByCompany.get(u.companyId.toString());
          if (defB) {
            assigned.push({
              id: defB._id.toString(),
              name: defB.name,
              branchCode: defB.branchCode,
              isDefault: true,
            });
          }
        }
        // Ensure isDefault is tagged if matches branchLookup
        assigned = assigned.map((b: any) => {
          const bDoc = branchLookup.get(b.id);
          return {
            ...b,
            isDefault: Boolean(b.isDefault || bDoc?.isDefault),
          };
        });

        return {
          ...u,
          branches: assigned,
          branchCount: assigned.length,
          branchIds: assigned.map((b) => b.id),
        };
      });

      res.json({ success: true, data: enriched });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const me = (req as AuthRequest).user;
      const { email, password, firstName, lastName, role, roleId, branchId, branchIds, phone, companyId } = req.body;
      if (!email || !password || !firstName || !lastName || (!role && !roleId)) {
        res.status(400).json({ error: 'email, password, firstName, lastName and role are required', code: 'VALIDATION_ERROR' });
        return;
      }

      const ownerCompanyId = me?.isSuperAdmin ? companyId || me?.companyId : me?.companyId;
      if (!ownerCompanyId && role !== Role.SUPER_ADMIN) {
        res.status(400).json({ error: 'companyId is required', code: 'VALIDATION_ERROR' });
        return;
      }

      const roleRes = await resolveRoleAndValidateRank(role, roleId, me, ownerCompanyId);
      if (roleRes.error) {
        res.status(roleRes.status || 400).json({ error: roleRes.error, code: 'FORBIDDEN' });
        return;
      }
      const finalRole = roleRes.role;
      const finalRoleId = roleRes.roleId;

      // Resolve branch IDs
      let resolvedBranchIds: string[] = [];
      if (Array.isArray(branchIds)) {
        resolvedBranchIds = branchIds.map(String).filter(Boolean);
      } else if (branchId) {
        resolvedBranchIds = [String(branchId)];
      }

      // If Branch Manager is creating the user, restrict to their managed branches
      if (me?.role === Role.BRANCH_MANAGER) {
        for (const bId of resolvedBranchIds) {
          if (!me.allowedBranchIds.includes(bId)) {
            res.status(403).json({ error: 'Cannot assign a branch outside your managed branches', code: 'FORBIDDEN' });
            return;
          }
        }
      }

      // If company admin has no explicit branch assigned, attach the company's default branch as primary
      if ((finalRole === Role.COMPANY_ADMIN || finalRole === 'COMPANY_ADMIN') && resolvedBranchIds.length === 0 && ownerCompanyId) {
        const { Branch } = await import('../../common/models/Branch');
        const defB = await Branch.findOne({ companyId: ownerCompanyId, isDefault: true }).lean()
          || await Branch.findOne({ companyId: ownerCompanyId }).sort({ createdAt: 1 }).lean();
        if (defB) {
          resolvedBranchIds = [defB._id.toString()];
        }
      }

      const primaryBranchId = resolvedBranchIds[0] || branchId || undefined;
      const { accessWindow } = await import('../auth/login-policy.service');
      const user = new User({
        email,
        password: await hashPassword(password),
        firstName,
        lastName,
        role: finalRole,
        roleId: finalRoleId,
        companyId: ownerCompanyId,
        branchId: primaryBranchId,
        phone,
        isActive: true,
        // Admin-provisioned (temporary) password – must be replaced on first login.
        mustChangePassword: true,
        accessExpiresAt: accessWindow(),
      });
      await user.save();

      // Create BranchMembership records for all associated branches
      if (resolvedBranchIds.length > 0) {
        await BranchMembership.insertMany(
          resolvedBranchIds.map((bId) => ({
            userId: user._id,
            branchId: bId,
            role: finalRole,
            accessLevel: 'full_manage',
            isActive: true,
          }))
        );
        await CompanyMembership.findOneAndUpdate(
          { userId: user._id, companyId: ownerCompanyId },
          { userId: user._id, companyId: ownerCompanyId, role: finalRole, branchIds: resolvedBranchIds, isActive: true },
          { upsert: true }
        );
      }

      await recordAudit({
        actorId: me?.userId,
        action: 'USER_CREATED',
        companyId: ownerCompanyId,
        metadata: { userId: user._id.toString(), role, branchIds: resolvedBranchIds },
      });

      const safe: any = await User.findById(user._id).select(SAFE_FIELDS).lean();
      const populatedBranches = await Branch.find({ _id: { $in: resolvedBranchIds } }).select('name branchCode').lean();
      safe.branches = populatedBranches.map((b) => ({ id: b._id.toString(), name: b.name, branchCode: b.branchCode }));
      safe.branchCount = safe.branches.length;
      safe.branchIds = resolvedBranchIds;

      res.status(201).json({ success: true, data: safe });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'CREATE_ERROR' });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const scoped = await loadScopedUser(req, res);
      if (!scoped) return;
      const { target, me } = scoped;
      const { firstName, lastName, phone, role, roleId, branchId, branchIds, isActive } = req.body;
      if (target._id.toString() === me?.userId && (role || roleId || isActive === false)) {
        res.status(403).json({ error: 'Cannot change your own role or deactivate yourself', code: 'FORBIDDEN' });
        return;
      }
      if (target.role === Role.SUPER_ADMIN && !me?.isSuperAdmin) {
        res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
        return;
      }

      const patch: Record<string, unknown> = {};
      if (role !== undefined || roleId !== undefined) {
        const roleRes = await resolveRoleAndValidateRank(role, roleId, me, target.companyId?.toString());
        if (roleRes.error) {
          res.status(roleRes.status || 400).json({ error: roleRes.error, code: 'FORBIDDEN' });
          return;
        }
        patch.role = roleRes.role;
        patch.roleId = roleRes.roleId || null;
      }

      // Check resolved branchIds if passed
      let newBranchIds: string[] | undefined;
      if (Array.isArray(branchIds)) {
        newBranchIds = branchIds.map(String).filter(Boolean);
      } else if (branchId !== undefined) {
        newBranchIds = branchId ? [String(branchId)] : [];
      }

      if (me?.role === Role.BRANCH_MANAGER && newBranchIds) {
        for (const bId of newBranchIds) {
          if (!me.allowedBranchIds.includes(bId)) {
            res.status(403).json({ error: 'Cannot assign a branch outside your managed branches', code: 'FORBIDDEN' });
            return;
          }
        }
      }

      if (firstName !== undefined) patch.firstName = firstName;
      if (lastName !== undefined) patch.lastName = lastName;
      if (phone !== undefined) patch.phone = phone;
      if (newBranchIds !== undefined) {
        patch.branchId = newBranchIds[0] || null;
      }
      if (isActive !== undefined) patch.isActive = isActive;

      const updated: any = await User.findByIdAndUpdate(target._id, patch, { new: true, runValidators: true })
        .select(SAFE_FIELDS)
        .populate('roleId', 'name slug permissions rank isSystem')
        .lean();

      // Sync BranchMembership and CompanyMembership if branch assignments or role were updated
      const finalEffectiveRole = (patch.role as string) || target.role;

      if (newBranchIds !== undefined) {
        await BranchMembership.deleteMany({ userId: target._id });
        if (newBranchIds.length > 0) {
          await BranchMembership.insertMany(
            newBranchIds.map((bId) => ({
              userId: target._id,
              branchId: bId,
              role: finalEffectiveRole,
              accessLevel: 'full_manage',
              isActive: true,
            }))
          );
        }
        await CompanyMembership.findOneAndUpdate(
          { userId: target._id, companyId: target.companyId },
          { $set: { branchIds: newBranchIds, role: finalEffectiveRole } }
        );
      } else if (patch.role !== undefined) {
        await BranchMembership.updateMany(
          { userId: target._id },
          { $set: { role: finalEffectiveRole } }
        );
        await CompanyMembership.findOneAndUpdate(
          { userId: target._id, companyId: target.companyId },
          { $set: { role: finalEffectiveRole } }
        );
      }

      const allMemberships = await BranchMembership.find({ userId: target._id, isActive: true })
        .populate('branchId', 'name branchCode')
        .lean();
      updated.branches = allMemberships.map((m) => ({
        id: (m.branchId as any)?._id?.toString() || m.branchId?.toString(),
        name: (m.branchId as any)?.name || 'Branch',
        branchCode: (m.branchId as any)?.branchCode,
      }));
      updated.branchCount = updated.branches.length;
      updated.branchIds = updated.branches.map((b: any) => b.id);

      await recordAudit({
        actorId: me?.userId,
        action: 'USER_UPDATED',
        companyId: target.companyId?.toString(),
        metadata: { userId: target._id.toString(), patch: Object.keys(patch) },
      });
      res.json({ success: true, data: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'UPDATE_ERROR' });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const scoped = await loadScopedUser(req, res);
      if (!scoped) return;
      const { target, me } = scoped;
      if (target._id.toString() === me?.userId) {
        res.status(403).json({ error: 'Cannot deactivate yourself', code: 'FORBIDDEN' });
        return;
      }
      if (target.role === Role.SUPER_ADMIN && !me?.isSuperAdmin) {
        res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
        return;
      }
      target.isActive = false;
      await target.save();
      await recordAudit({
        actorId: me?.userId,
        action: 'USER_DEACTIVATED',
        companyId: target.companyId?.toString(),
        metadata: { userId: target._id.toString() },
      });
      res.json({ success: true, message: 'User deactivated' });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'DELETE_ERROR' });
    }
  }
}

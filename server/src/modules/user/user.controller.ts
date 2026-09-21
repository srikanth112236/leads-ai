import { Request, Response } from 'express';
import { User } from '../../common/models/User';
import { BaseController } from '../../common/controllers/BaseController';
import { TenantContextService } from '../../common/services/TenantContextService';
import { AuthRequest } from '../../common/middleware/auth';
import { hashPassword } from '../../common/security/hash';
import { recordAudit } from '../../common/services/audit';
import { Role } from '../../common/types';

const SAFE_FIELDS = 'email firstName lastName role companyId branchId phone isActive lastLoginAt createdAt';

const RANK: Record<string, number> = {
  [Role.SALES_AGENT]: 1,
  [Role.BRANCH_MANAGER]: 2,
  [Role.COMPANY_MANAGER]: 3,
  [Role.COMPANY_ADMIN]: 4,
  [Role.SUPER_ADMIN]: 5,
};

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
  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as AuthRequest).user;
      const scope = req.query.scope as string | undefined;
      if (scope === 'staff' && !user?.isSuperAdmin) {
        res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
        return;
      }
      const filter = scope === 'staff'
        ? { $or: [{ companyId: { $exists: false } }, { companyId: null }] }
        : TenantContextService.getTenantFilter(req as AuthRequest);
      const users = await User.find(filter).select(SAFE_FIELDS).sort({ createdAt: -1 });
      res.json({ success: true, data: users });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const me = (req as AuthRequest).user;
      const { email, password, firstName, lastName, role, branchId, phone, companyId } = req.body;
      if (!email || !password || !firstName || !lastName || !role) {
        res.status(400).json({ error: 'email, password, firstName, lastName and role are required', code: 'VALIDATION_ERROR' });
        return;
      }
      if (!Object.values(Role).includes(role)) {
        res.status(400).json({ error: 'Invalid role', code: 'VALIDATION_ERROR' });
        return;
      }
      if (!me?.isSuperAdmin && (RANK[role] || 0) >= (RANK[me?.role || Role.SALES_AGENT] || 0)) {
        res.status(403).json({ error: 'Cannot create a user at or above your own role', code: 'FORBIDDEN' });
        return;
      }
      const ownerCompanyId = me?.isSuperAdmin ? companyId || me?.companyId : me?.companyId;
      if (!ownerCompanyId && role !== Role.SUPER_ADMIN) {
        res.status(400).json({ error: 'companyId is required', code: 'VALIDATION_ERROR' });
        return;
      }
      const existing = await User.findOne({ email });
      if (existing) {
        res.status(409).json({ error: 'User already exists', code: 'USER_EXISTS' });
        return;
      }
      const user = new User({
        email,
        password: await hashPassword(password),
        firstName,
        lastName,
        role,
        companyId: ownerCompanyId,
        branchId,
        phone,
        isActive: true,
      });
      await user.save();
      await recordAudit({
        actorId: me?.userId,
        action: 'USER_CREATED',
        companyId: ownerCompanyId,
        metadata: { userId: user._id.toString(), role },
      });
      const safe = await User.findById(user._id).select(SAFE_FIELDS);
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
      const { firstName, lastName, phone, role, branchId, isActive } = req.body;
      if (target._id.toString() === me?.userId && (role || isActive === false)) {
        res.status(403).json({ error: 'Cannot change your own role or deactivate yourself', code: 'FORBIDDEN' });
        return;
      }
      if (role && !Object.values(Role).includes(role)) {
        res.status(400).json({ error: 'Invalid role', code: 'VALIDATION_ERROR' });
        return;
      }
      if (role && !me?.isSuperAdmin && (RANK[role] || 0) >= (RANK[me?.role || Role.SALES_AGENT] || 0)) {
        res.status(403).json({ error: 'Cannot grant a role at or above your own', code: 'FORBIDDEN' });
        return;
      }
      if (target.role === Role.SUPER_ADMIN && !me?.isSuperAdmin) {
        res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
        return;
      }
      const patch: Record<string, unknown> = {};
      if (firstName !== undefined) patch.firstName = firstName;
      if (lastName !== undefined) patch.lastName = lastName;
      if (phone !== undefined) patch.phone = phone;
      if (role !== undefined) patch.role = role;
      if (branchId !== undefined) patch.branchId = branchId || undefined;
      if (isActive !== undefined) patch.isActive = isActive;
      const updated = await User.findByIdAndUpdate(target._id, patch, { new: true, runValidators: true }).select(SAFE_FIELDS);
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

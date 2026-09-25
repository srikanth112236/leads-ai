import { randomBytes } from 'crypto';
import { Request, Response } from 'express';
import { Branch, BranchType } from '../../common/models/Branch';
import { nextBranchCode } from '../../common/models/BranchCounter';
import { User } from '../../common/models/User';
import { Company } from '../../common/models/Company';
import { CompanyMembership } from '../../common/models/CompanyMembership';
import { BranchMembership } from '../../common/models/BranchMembership';
import { MetaPage } from '../../common/models/MetaPage';
import { MetaLeadForm } from '../../common/models/MetaLeadForm';
import { AuthRequest } from '../../common/middleware/auth';
import { hashPassword } from '../../common/security/hash';
import { recordAudit } from '../../common/services/audit';
import { Role } from '../../common/types';
import { BaseController } from '../../common/controllers/BaseController';

const BRANCH_TYPES: BranchType[] = ['hq', 'regional_hub', 'sales_office', 'franchise'];
const PROVISION_ROLES: Record<string, Role> = {
  ads_manager: Role.COMPANY_MANAGER,
  sales_executive: Role.SALES_AGENT,
};
const ROLE_PREFIX: Record<string, string> = {
  [Role.COMPANY_MANAGER]: 'AM',
  [Role.SALES_AGENT]: 'SE',
};

async function generateAccessId(role: Role, branchCode: string): Promise<string> {
  const prefix = ROLE_PREFIX[role] || 'US';
  for (let attempt = 0; attempt < 10; attempt++) {
    const accessId = `${prefix}-${branchCode}-${randomBytes(2).toString('hex').toUpperCase().slice(0, 4)}`;
    if (!(await User.findOne({ accessId }))) return accessId;
  }
  return `${prefix}-${branchCode}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
}

export class BranchController extends BaseController {
  static async loadScopedBranch(req: Request, res: Response) {
    const branch = await Branch.findById(req.params.id);
    if (!branch) {
      res.status(404).json({ error: 'Branch not found', code: 'NOT_FOUND' });
      return null;
    }
    const user = (req as AuthRequest).user;
    if (!user?.isSuperAdmin && branch.companyId.toString() !== user?.companyId) {
      res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
      return null;
    }
    if (user?.role === Role.BRANCH_MANAGER) {
      const allowed = user.allowedBranchIds || [];
      const branchIdStr = branch._id.toString();
      if (!allowed.includes(branchIdStr) && user.branchId !== branchIdStr) {
        res.status(403).json({ error: 'Access denied to this branch', code: 'FORBIDDEN' });
        return null;
      }
    }
    return branch;
  }

  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      const filter: Record<string, unknown> = {};
      const authReq = req as AuthRequest;
      const queryCompanyId = req.query.companyId as string | undefined;
      if (authReq.user?.isSuperAdmin) {
        if (queryCompanyId) {
          filter.companyId = queryCompanyId;
        }
      } else if (authReq.user?.companyId) {
        if (queryCompanyId && queryCompanyId !== authReq.user.companyId) {
          res.status(403).json({ error: 'Cross-tenant access denied', code: 'TENANT_VIOLATION' });
          return;
        }
        filter.companyId = authReq.user.companyId;
      }

      if (req.query.branchId) {
        filter._id = req.query.branchId;
      } else if (authReq.user?.role === Role.BRANCH_MANAGER) {
        if (authReq.user.branchId) {
          filter._id = authReq.user.branchId;
        } else {
          const allowed = authReq.user.allowedBranchIds || [];
          if (allowed.length > 0) {
            filter._id = { $in: allowed };
          }
        }
      }

      const branches = await Branch.find(filter).sort({ createdAt: -1 });
      res.json({ success: true, data: branches });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const branch = await BranchController.loadScopedBranch(req, res);
      if (!branch) return;
      res.json({ success: true, data: branch });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as AuthRequest).user;
      const {
        name, location, status = 'active', branchCode, parentBranchId,
        branchType = 'sales_office', timezone = 'UTC',
        portfolioPageIds = [], portfolioIntegrationIds = [],
        users = [], existingUserIds = [],
      } = req.body;
      const companyId = user?.isSuperAdmin ? req.body.companyId : user?.companyId;
      if (!companyId) {
        res.status(400).json({ error: 'companyId is required', code: 'VALIDATION_ERROR' });
        return;
      }
      if (!name) {
        res.status(400).json({ error: 'name is required', code: 'VALIDATION_ERROR' });
        return;
      }
      if (branchType && !BRANCH_TYPES.includes(branchType)) {
        res.status(400).json({ error: `branchType must be one of ${BRANCH_TYPES.join(', ')}`, code: 'VALIDATION_ERROR' });
        return;
      }
      const company = await Company.findById(companyId);
      if (!company) {
        res.status(404).json({ error: 'Company not found', code: 'NOT_FOUND' });
        return;
      }
      if (parentBranchId) {
        const parent = await Branch.findById(parentBranchId);
        if (!parent || parent.companyId.toString() !== companyId.toString()) {
          res.status(400).json({ error: 'Parent branch must belong to the same company', code: 'VALIDATION_ERROR' });
          return;
        }
      }
      let finalBranchCode = branchCode ? String(branchCode).trim().toUpperCase() : await nextBranchCode(companyId.toString(), company.name);
      let clash = await Branch.findOne({ companyId, branchCode: finalBranchCode });
      if (clash) {
        let counter = 1;
        while (await Branch.findOne({ companyId, branchCode: `${finalBranchCode}-${counter}` })) {
          counter++;
        }
        finalBranchCode = `${finalBranchCode}-${counter}`;
      }

      for (const u of users) {
        if (!u.firstName || !u.lastName || !u.email || !u.role || !PROVISION_ROLES[u.role]) {
          res.status(400).json({ error: 'Each user needs firstName, lastName, email and role ads_manager|sales_executive', code: 'VALIDATION_ERROR' });
          return;
        }
        if (await User.findOne({ email: u.email })) {
          res.status(409).json({ error: `User email already exists: ${u.email}`, code: 'USER_EXISTS' });
          return;
        }
      }

      // First branch of a company automatically becomes the default (main) branch.
      const existingCount = await Branch.countDocuments({ companyId });
      const isFirstBranch = existingCount === 0;
      const branch = new Branch({
        companyId,
        branchCode: finalBranchCode,
        name,
        location,
        parentBranchId: parentBranchId || undefined,
        branchType,
        timezone,
        status,
        isDefault: isFirstBranch,
      });
      await branch.save();

      // If this is the company's first/default branch, bind it to company and admins
      if (isFirstBranch) {
        await Company.findByIdAndUpdate(companyId, { defaultBranchId: branch._id });

        const admins = await User.find({
          companyId,
          role: { $in: [Role.COMPANY_ADMIN, 'COMPANY_ADMIN', 'company_admin'] },
        });

        for (const a of admins) {
          if (!a.branchId) {
            a.branchId = branch._id as any;
            await a.save();
          }
          await CompanyMembership.findOneAndUpdate(
            { userId: a._id, companyId },
            { $addToSet: { branchIds: branch._id } },
            { upsert: true }
          );
          await BranchMembership.findOneAndUpdate(
            { userId: a._id, branchId: branch._id },
            {
              $setOnInsert: {
                role: Role.COMPANY_ADMIN,
                accessLevel: 'full_manage',
                isActive: true,
              },
            },
            { upsert: true }
          );
        }
      }

      // Bind Meta portfolios so the branch sees relevant data immediately.
      let portfoliosBound = 0;
      if (portfolioPageIds.length > 0) {
        const r = await MetaPage.updateMany(
          { _id: { $in: portfolioPageIds }, companyId },
          { branchId: branch._id, status: 'active' },
        );
        portfoliosBound += r.modifiedCount;
      }
      if (portfolioIntegrationIds.length > 0) {
        const r = await MetaLeadForm.updateMany(
          { integrationId: { $in: portfolioIntegrationIds }, companyId },
          { branchId: branch._id, status: 'active' },
        );
        portfoliosBound += r.modifiedCount;
      }

      // Assign existing company team members if selected
      let existingAssigned = 0;
      if (Array.isArray(existingUserIds) && existingUserIds.length > 0) {
        const existingUsers = await User.find({ _id: { $in: existingUserIds }, companyId });
        for (const eu of existingUsers) {
          if (!eu.branchId) {
            eu.branchId = branch._id.toString();
            await eu.save();
          }
          await BranchMembership.findOneAndUpdate(
            { userId: eu._id, branchId: branch._id },
            { userId: eu._id, branchId: branch._id, role: eu.role || Role.SALES_AGENT, accessLevel: 'full_manage', isActive: true },
            { upsert: true }
          );
          await CompanyMembership.findOneAndUpdate(
            { userId: eu._id, companyId },
            { $addToSet: { branchIds: branch._id.toString() } },
            { upsert: true }
          );
          existingAssigned++;
        }
      }

      // Provision initial team. Credentials are returned ONCE below.
      const provisioned: Array<{ email: string; accessId: string; tempPassword: string; role: Role }> = [];
      for (const u of users) {
        const role = PROVISION_ROLES[u.role];
        const tempPassword = randomBytes(9).toString('base64url');
        const { accessWindow } = await import('../auth/login-policy.service');
        const newUser = new User({
          email: u.email,
          password: await hashPassword(tempPassword),
          firstName: u.firstName,
          lastName: u.lastName,
          phone: u.phone,
          role,
          companyId,
          branchId: branch._id,
          onboardingStatus: 'pending_onboarding',
          isActive: true,
          mustChangePassword: true,
          accessExpiresAt: accessWindow(),
        });
        await newUser.save();
        const accessId = await generateAccessId(role, branch.branchCode);
        newUser.accessId = accessId;
        await newUser.save();
        const secondaryIds: string[] = Array.isArray(u.secondaryBranchIds) ? u.secondaryBranchIds : [];
        const validSecondary = await Branch.find({ _id: { $in: secondaryIds }, companyId }).select('_id').lean();
        const allBranchIds = [branch._id.toString(), ...validSecondary.map((b) => b._id.toString())];
        const userAccessLevel = u.accessLevel === 'view_only' ? 'view_only' : 'full_manage';
        await BranchMembership.create(
          allBranchIds.map((bid) => ({
            userId: newUser._id,
            branchId: bid,
            role,
            accessLevel: bid === branch._id.toString() ? 'full_manage' : userAccessLevel,
            isActive: true,
          })),
        );
        await CompanyMembership.findOneAndUpdate(
          { userId: newUser._id, companyId },
          { userId: newUser._id, companyId, role, branchIds: allBranchIds, isActive: true },
          { upsert: true },
        );
        provisioned.push({ email: newUser.email, accessId, tempPassword, role });
      }

      await recordAudit({
        actorId: (req as AuthRequest).user?.userId,
        action: 'BRANCH_CREATED',
        companyId: branch.companyId.toString(),
        branchId: branch._id.toString(),
        metadata: { name, users: provisioned.length, existingAssigned, portfoliosBound },
      });

      const branchObj = branch.toObject();
      res.status(201).json({
        success: true,
        data: {
          ...branchObj,
          branch,
          provisioned,
          existingAssigned,
          portfoliosBound,
        },
      });
    } catch (error: any) {
      if (error?.code === 11000) {
        res.status(409).json({ error: 'Duplicate key', code: 'DUPLICATE_ERROR' });
        return;
      }
      res.status(500).json({ error: error.message, code: 'CREATE_ERROR' });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const existing = await BranchController.loadScopedBranch(req, res);
      if (!existing) return;
      const { name, location, status, branchType, timezone, parentBranchId, isDefault } = req.body;
      if (branchType && !BRANCH_TYPES.includes(branchType)) {
        res.status(400).json({ error: `branchType must be one of ${BRANCH_TYPES.join(', ')}`, code: 'VALIDATION_ERROR' });
        return;
      }
      // Transferring the default flag keeps exactly one default per company.
      if (isDefault === true) {
        await Branch.updateMany(
          { companyId: existing.companyId, _id: { $ne: existing._id } },
          { $set: { isDefault: false } },
        );
      }
      if (parentBranchId) {
        const parent = await Branch.findById(parentBranchId);
        if (!parent || parent.companyId.toString() !== existing.companyId.toString() || parent._id.toString() === existing._id.toString()) {
          res.status(400).json({ error: 'Parent branch must belong to the same company', code: 'VALIDATION_ERROR' });
          return;
        }
      }
      const branch = await Branch.findByIdAndUpdate(
        existing._id,
        {
          name,
          location,
          status,
          branchType,
          timezone,
          parentBranchId: parentBranchId || undefined,
          ...(isDefault === true ? { isDefault: true } : {}),
          ...(isDefault === false ? { isDefault: false } : {}),
        },
        { new: true, runValidators: true },
      );
      if (!branch) {
        res.status(404).json({ error: 'Branch not found', code: 'NOT_FOUND' });
        return;
      }
      await recordAudit({
        actorId: (req as AuthRequest).user?.userId,
        action: 'BRANCH_UPDATED',
        companyId: branch.companyId.toString(),
        branchId: branch._id.toString(),
        metadata: { name, status },
      });
      res.json({ success: true, data: branch });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'UPDATE_ERROR' });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const existing = await BranchController.loadScopedBranch(req, res);
      if (!existing) return;
      await Branch.findByIdAndDelete(existing._id);
      res.json({ success: true, message: 'Branch deleted' });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'DELETE_ERROR' });
    }
  }

  static async getUsers(req: Request, res: Response): Promise<void> {
    try {
      const branch = await BranchController.loadScopedBranch(req, res);
      if (!branch) return;

      const memberships = await BranchMembership.find({ branchId: branch._id, isActive: { $ne: false } }).lean();
      const memberUserIds = memberships.map((m) => m.userId);

      const rawUsers = await User.find({
        $or: [
          { branchId: branch._id },
          { _id: { $in: memberUserIds } },
        ],
        isActive: true,
      })
        .select('email firstName lastName role phone isActive accessId onboardingStatus')
        .lean();

      const membershipMap = new Map(memberships.map((m) => [m.userId.toString(), m.accessLevel]));
      const membershipRoleMap = new Map(memberships.map((m) => [m.userId.toString(), m.role]));

      const users = rawUsers.map((u) => ({
        ...u,
        role: membershipRoleMap.get(u._id.toString()) || u.role,
        accessLevel: membershipMap.get(u._id.toString()) || 'full_manage',
      }));
      res.json({ success: true, data: users });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  static async addUsers(req: Request, res: Response): Promise<void> {
    try {
      const branch = await BranchController.loadScopedBranch(req, res);
      if (!branch) return;
      const { emails = [], userIds = [], role: userRole, accessLevel = 'full_manage' } = req.body as {
        emails?: string[];
        userIds?: string[];
        role?: string;
        accessLevel?: string;
      };

      const hasEmails = Array.isArray(emails) && emails.length > 0;
      const hasUserIds = Array.isArray(userIds) && userIds.length > 0;

      if (!hasEmails && !hasUserIds) {
        res.status(400).json({ error: 'Either emails or userIds array is required', code: 'VALIDATION_ERROR' });
        return;
      }
      const role = (userRole && PROVISION_ROLES[userRole]) || Role.SALES_AGENT;
      const userAccessLevel = accessLevel === 'view_only' ? 'view_only' : 'full_manage';
      const provisioned: Array<{ email: string; accessId: string; tempPassword: string; role: Role }> = [];
      let assignedCount = 0;

      // 1. Assign existing company users
      if (hasUserIds) {
        const existingUsers = await User.find({ _id: { $in: userIds }, companyId: branch.companyId });
        for (const eu of existingUsers) {
          if (!eu.branchId) {
            eu.branchId = branch._id.toString();
            await eu.save();
          }
          await BranchMembership.findOneAndUpdate(
            { userId: eu._id, branchId: branch._id },
            { userId: eu._id, branchId: branch._id, role: eu.role || role, accessLevel: userAccessLevel, isActive: true },
            { upsert: true }
          );
          await CompanyMembership.findOneAndUpdate(
            { userId: eu._id, companyId: branch.companyId },
            { $addToSet: { branchIds: branch._id.toString() } },
            { upsert: true }
          );
          assignedCount++;
        }
      }

      // 2. Provision new users
      if (hasEmails) {
        for (const email of emails) {
          const existing = await User.findOne({ email });
          if (existing) {
            if (existing.companyId?.toString() === branch.companyId.toString()) {
              if (!existing.branchId) {
                existing.branchId = branch._id.toString();
                await existing.save();
              }
              await BranchMembership.findOneAndUpdate(
                { userId: existing._id, branchId: branch._id },
                { userId: existing._id, branchId: branch._id, role: existing.role || role, accessLevel: userAccessLevel, isActive: true },
                { upsert: true }
              );
              await CompanyMembership.findOneAndUpdate(
                { userId: existing._id, companyId: branch.companyId },
                { $addToSet: { branchIds: branch._id.toString() } },
                { upsert: true }
              );
              assignedCount++;
              continue;
            }
            res.status(409).json({ error: `User already exists: ${email}`, code: 'USER_EXISTS' });
            return;
          }
          const tempPassword = randomBytes(9).toString('base64url');
          const { accessWindow } = await import('../auth/login-policy.service');
          const newUser = new User({
            email,
            password: await hashPassword(tempPassword),
            firstName: '',
            lastName: '',
            role,
            companyId: branch.companyId,
            branchId: branch._id,
            onboardingStatus: 'pending_onboarding',
            isActive: true,
            mustChangePassword: true,
            accessExpiresAt: accessWindow(),
          });
          await newUser.save();
          const accessId = await generateAccessId(role, branch.branchCode);
          newUser.accessId = accessId;
          await newUser.save();
          await BranchMembership.create({ userId: newUser._id, branchId: branch._id, role, accessLevel: userAccessLevel, isActive: true });
          await CompanyMembership.findOneAndUpdate(
            { userId: newUser._id, companyId: branch.companyId },
            { userId: newUser._id, companyId: branch.companyId, role, branchIds: [branch._id.toString()], isActive: true },
            { upsert: true },
          );
          provisioned.push({ email, accessId, tempPassword, role });
        }
      }

      res.status(201).json({ success: true, data: { provisioned, assignedCount } });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'ADD_USERS_ERROR' });
    }
  }

  static async getLeads(req: Request, res: Response): Promise<void> {
    res.json({ success: true, data: [] });
  }

  static async getStats(req: Request, res: Response): Promise<void> {
    res.json({ success: true, data: { totalLeads: 0, newLeads: 0, convertedLeads: 0 } });
  }
}

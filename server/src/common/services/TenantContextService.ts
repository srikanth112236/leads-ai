import { AuthRequest } from '../middleware/auth';

export class TenantContextService {
  static getContext(req: AuthRequest) {
    if (!req.user) {
      throw new Error('No tenant context available');
    }
    return {
      userId: req.user.userId,
      role: req.user.role,
      companyId: req.user.companyId,
      branchId: req.user.branchId,
      allowedBranchIds: req.user.allowedBranchIds,
      isSuperAdmin: req.user.isSuperAdmin,
    };
  }

  static getCompanyFilter(req: AuthRequest): Record<string, unknown> {
    const ctx = this.getContext(req);
    if (ctx.isSuperAdmin) {
      return {};
    }
    return { companyId: ctx.companyId };
  }

  static getBranchFilter(req: AuthRequest): Record<string, unknown> {
    const ctx = this.getContext(req);
    if (ctx.isSuperAdmin) {
      return {};
    }
    if (ctx.branchId) {
      return { branchId: ctx.branchId };
    }
    if (ctx.allowedBranchIds.length > 0) {
      return { branchId: { $in: ctx.allowedBranchIds } };
    }
    return { companyId: ctx.companyId };
  }

  static getTenantFilter(req: AuthRequest): Record<string, unknown> {
    const ctx = this.getContext(req);
    if (ctx.isSuperAdmin) {
      return {};
    }
    const filter: Record<string, unknown> = { companyId: ctx.companyId };
    if (ctx.branchId) {
      filter.branchId = ctx.branchId;
    } else if (ctx.allowedBranchIds.length > 0) {
      filter.branchId = { $in: ctx.allowedBranchIds };
    }
    return filter;
  }
}

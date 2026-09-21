import { Request, Response } from 'express';
import { Branch } from '../../common/models/Branch';
import { AuthRequest } from '../../common/middleware/auth';
import { recordAudit } from '../../common/services/audit';
import { BaseController } from '../../common/controllers/BaseController';

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
    return branch;
  }

  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      const filter: Record<string, unknown> = {};
      const authReq = req as AuthRequest;
      if (!authReq.user?.isSuperAdmin && authReq.user?.companyId) {
        filter.companyId = authReq.user.companyId;
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
      const { name, location, status = 'active' } = req.body;
      const companyId = user?.isSuperAdmin ? req.body.companyId : user?.companyId;
      if (!companyId) {
        res.status(400).json({ error: 'companyId is required', code: 'VALIDATION_ERROR' });
        return;
      }
      if (!name) {
        res.status(400).json({ error: 'name is required', code: 'VALIDATION_ERROR' });
        return;
      }
      const branch = new Branch({ companyId, name, location, status });
      await branch.save();
      await recordAudit({
        actorId: (req as AuthRequest).user?.userId,
        action: 'BRANCH_CREATED',
        companyId: branch.companyId.toString(),
        branchId: branch._id.toString(),
        metadata: { name },
      });
      res.status(201).json({ success: true, data: branch });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'CREATE_ERROR' });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const existing = await BranchController.loadScopedBranch(req, res);
      if (!existing) return;
      const { name, location, status } = req.body;
      const branch = await Branch.findByIdAndUpdate(existing._id, { name, location, status }, { new: true, runValidators: true });
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
    res.json({ success: true, data: [] });
  }

  static async getLeads(req: Request, res: Response): Promise<void> {
    res.json({ success: true, data: [] });
  }

  static async getStats(req: Request, res: Response): Promise<void> {
    res.json({ success: true, data: { totalLeads: 0, newLeads: 0, convertedLeads: 0 } });
  }
}

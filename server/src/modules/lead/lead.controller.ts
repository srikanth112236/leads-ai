import { Request, Response } from 'express';
import { Lead } from '../../common/models/Lead';
import { LeadSource } from '../../common/models/LeadSource';
import { TrackerEvent } from '../../common/models/TrackerEvent';
import { Conversation } from '../../common/models/Conversation';
import { Message } from '../../common/models/Message';
import { LeadNote } from '../../common/models/LeadNote';
import { LeadActivity } from '../../common/models/LeadActivity';
import { logger } from '../../common/utils/logger';
import { BaseController } from '../../common/controllers/BaseController';
import { TenantContextService } from '../../common/services/TenantContextService';
import { recordAudit } from '../../common/services/audit';
import { AuthRequest } from '../../common/middleware/auth';
import { Role } from '../../common/types';

const authReq = (req: Request): AuthRequest => req as AuthRequest;

async function loadScopedLead(req: Request, res: Response) {
  const lead = await Lead.findById(req.params.id);
  if (!lead) {
    res.status(404).json({ error: 'Lead not found', code: 'NOT_FOUND' });
    return null;
  }
  const u = authReq(req).user;
  if (!u?.isSuperAdmin) {
    if (lead.companyId.toString() !== u?.companyId) {
      res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
      return null;
    }
    const leadBranch = lead.branchId?.toString();
    if (leadBranch && u?.branchId && leadBranch !== u.branchId) {
      const privileged = u.role === Role.COMPANY_ADMIN || u.role === Role.COMPANY_MANAGER;
      if (!privileged || (u.allowedBranchIds.length > 0 && !u.allowedBranchIds.includes(leadBranch))) {
        res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
        return null;
      }
    }
  }
  return lead;
}

export class LeadController extends BaseController {
  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      const filter = TenantContextService.getTenantFilter(authReq(req));
      const page = parseInt((req.query.page as string) || '1');
      const limit = parseInt((req.query.limit as string) || '20');
      const sort = (req.query.sort as string) || '-createdAt';
      const leads = await Lead.find(filter).sort(sort as string).skip((page - 1) * limit).limit(limit);
      const total = await Lead.countDocuments(filter);
      res.status(200).json({ success: true, data: leads, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const lead = await loadScopedLead(req, res);
      if (!lead) return;
      res.json({ success: true, data: lead });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const { name, email, phone, company, message, branchId, metadata, source } = req.body;
      const lead = new Lead({
        companyId: authReq(req).user?.companyId,
        branchId: authReq(req).user?.branchId || branchId,
        name, email, phone, company, message,
        source,
        metadata,
        normalizedPhone: phone ? phone.replace(/[\s\-\(\)]/g, '') : undefined,
        normalizedEmail: email ? email.trim().toLowerCase() : undefined,
      });
      await lead.save();
      res.status(201).json({ success: true, data: lead });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'CREATE_ERROR' });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const existing = await loadScopedLead(req, res);
      if (!existing) return;
      const { name, email, phone, status, priority, assignedTo } = req.body;
      const lead = await Lead.findByIdAndUpdate(existing._id, { name, email, phone, status, priority, assignedTo }, { new: true, runValidators: true });
      res.json({ success: true, data: lead });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'UPDATE_ERROR' });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const existing = await loadScopedLead(req, res);
      if (!existing) return;
      await Lead.findByIdAndDelete(existing._id);
      res.json({ success: true, message: 'Lead deleted' });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'DELETE_ERROR' });
    }
  }

  static async getSources(req: Request, res: Response): Promise<void> {
    try {
      const lead = await loadScopedLead(req, res);
      if (!lead) return;
      const sources = await LeadSource.find({ leadId: lead._id });
      res.json({ success: true, data: sources });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  static async getTrackerEvents(req: Request, res: Response): Promise<void> {
    try {
      const lead = await loadScopedLead(req, res);
      if (!lead) return;
      const [tracker, activity] = await Promise.all([
        TrackerEvent.find({ leadId: lead._id }).sort({ createdAt: 1 }).lean(),
        LeadActivity.find({ leadId: lead._id }).sort({ createdAt: 1 }).lean(),
      ]);
      const timeline = [
        ...tracker.map((t: any) => ({ kind: 'tracker', at: t.createdAt, ...t })),
        ...activity.map((a: any) => ({ kind: 'activity', at: a.createdAt, ...a })),
      ].sort((x: any, y: any) => new Date(x.at).getTime() - new Date(y.at).getTime());
      res.json({ success: true, data: timeline });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  static async assign(req: Request, res: Response): Promise<void> {
    try {
      const existing = await loadScopedLead(req, res);
      if (!existing) return;
      const { assignedTo } = req.body;
      const lead = await Lead.findByIdAndUpdate(existing._id, { assignedTo }, { new: true });
      await recordAudit({
        actorId: authReq(req).user?.userId,
        action: 'LEAD_ASSIGNED',
        companyId: existing.companyId.toString(),
        branchId: existing.branchId?.toString(),
        metadata: { leadId: existing._id.toString(), assignedTo },
      });
      res.json({ success: true, data: lead });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'UPDATE_ERROR' });
    }
  }

  static async getConversations(req: Request, res: Response): Promise<void> {
    try {
      const lead = await loadScopedLead(req, res);
      if (!lead) return;
      const conversations = await Conversation.find({ leadId: lead._id }).sort({ updatedAt: -1 }).lean();
      const withMessages = await Promise.all(
        conversations.map(async (c: any) => ({
          ...c,
          messages: await Message.find({ conversationId: c._id }).sort({ createdAt: 1 }).lean(),
        })),
      );
      res.json({ success: true, data: withMessages });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  static async export(_req: Request, res: Response): Promise<void> {
    res.json({ success: true, data: [] });
  }

  static async getNotes(req: Request, res: Response): Promise<void> {
    try {
      const lead = await Lead.findById(req.params.id);
      if (!lead) {
        res.status(404).json({ error: 'Lead not found', code: 'NOT_FOUND' });
        return;
      }
      const ctx = authReq(req);
      if (!ctx.user?.isSuperAdmin && lead.companyId.toString() !== ctx.user?.companyId) {
        res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
        return;
      }
      const notes = await LeadNote.find({ leadId: lead._id }).sort({ createdAt: -1 });
      res.json({ success: true, data: notes });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  static async addNote(req: Request, res: Response): Promise<void> {
    try {
      const { body } = req.body;
      if (!body || typeof body !== 'string' || !body.trim()) {
        res.status(400).json({ error: 'Note body is required', code: 'VALIDATION_ERROR' });
        return;
      }
      const lead = await Lead.findById(req.params.id);
      if (!lead) {
        res.status(404).json({ error: 'Lead not found', code: 'NOT_FOUND' });
        return;
      }
      const ctx = authReq(req);
      if (!ctx.user?.isSuperAdmin && lead.companyId.toString() !== ctx.user?.companyId) {
        res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
        return;
      }
      const note = new LeadNote({
        leadId: lead._id,
        companyId: lead.companyId,
        branchId: lead.branchId,
        authorId: ctx.user!.userId,
        body: body.trim(),
      });
      await note.save();
      await LeadActivity.create({
        leadId: lead._id,
        companyId: lead.companyId,
        branchId: lead.branchId,
        actorId: ctx.user!.userId,
        action: 'NOTE_ADDED',
        metadata: { noteId: note._id.toString() },
      });
      res.status(201).json({ success: true, data: note });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'NOTE_ERROR' });
    }
  }
}

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
import { AuthRequest, isPrivilegedRole } from '../../common/middleware/auth';
import { canAccessBranch } from '../../common/middleware/tenant';
import { Role } from '../../common/types';
import { RealtimeService } from '../realtime/realtime.service';

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
    // Branch-scoped: membership allow-list governs (works with or without a
    // primary branchId). Unassigned (null-branch) leads stay visible as the
    // claim pool; every branched lead outside the allow-list is denied.
    const leadBranch = lead.branchId?.toString();
    if (leadBranch && !canAccessBranch(u, leadBranch)) {
      res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
      return null;
    }
  }
  return lead;
}

export class LeadController extends BaseController {
  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      const filter: any = TenantContextService.getTenantFilter(authReq(req));
      const page = parseInt((req.query.page as string) || '1');
      const limit = parseInt((req.query.limit as string) || '50');
      const sort = (req.query.sort as string) || '-createdAt';

      if (req.query.status) {
        filter.status = req.query.status;
      }
      if (req.query.branchId) {
        filter.branchId = req.query.branchId;
      }
      if (req.query.assignedTo) {
        if (req.query.assignedTo === 'unassigned') {
          filter.assignedTo = { $in: [null, undefined] };
        } else {
          filter.assignedTo = req.query.assignedTo;
        }
      }
      if (req.query.source) {
        filter.source = req.query.source;
      }
      if (req.query.search) {
        const q = String(req.query.search).trim();
        filter.$or = [
          { name: { $regex: q, $options: 'i' } },
          { email: { $regex: q, $options: 'i' } },
          { phone: { $regex: q, $options: 'i' } },
          { company: { $regex: q, $options: 'i' } },
        ];
      }

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
      const u = authReq(req).user;
      const { name, email, phone, company, message, branchId, metadata, source, score, priority, status, assignedTo } = req.body;

      const roleUpper = String(u?.role || '').toUpperCase();
      let effectiveBranchId = branchId || u?.branchId;
      if (u && !u.isSuperAdmin && (roleUpper === 'BRANCH_MANAGER' || roleUpper === 'SALES_AGENT')) {
        if (branchId && u.allowedBranchIds && u.allowedBranchIds.length > 0 && !u.allowedBranchIds.includes(branchId)) {
          res.status(403).json({ error: 'Cannot create lead in unauthorized branch', code: 'FORBIDDEN' });
          return;
        }
        effectiveBranchId = branchId || u.branchId || (u.allowedBranchIds && u.allowedBranchIds.length === 1 ? u.allowedBranchIds[0] : undefined);
      }

      const lead = new Lead({
        companyId: u?.companyId,
        branchId: effectiveBranchId,
        name,
        email,
        phone,
        company,
        message,
        source,
        status: status || 'new',
        assignedTo: assignedTo || undefined,
        score: score ? Number(score) : 50,
        priority: priority || 'medium',
        metadata,
        normalizedPhone: phone ? phone.replace(/[\s\-\(\)\+]/g, '') : undefined,
        normalizedEmail: email ? email.trim().toLowerCase() : undefined,
      });
      await lead.save();
      RealtimeService.broadcastToCompany(lead.companyId.toString(), {
        type: 'LEAD_CREATED',
        payload: lead,
      });
      res.status(201).json({ success: true, data: lead });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'CREATE_ERROR' });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const existing = await loadScopedLead(req, res);
      if (!existing) return;
      const u = authReq(req).user;
      const { name, email, phone, company, status, priority, assignedTo, branchId, score, metadata } = req.body;

      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (email !== undefined) {
        updateData.email = email;
        updateData.normalizedEmail = email ? email.trim().toLowerCase() : undefined;
      }
      if (phone !== undefined) {
        updateData.phone = phone;
        updateData.normalizedPhone = phone ? phone.replace(/[\s\-\(\)\+]/g, '') : undefined;
      }
      if (company !== undefined) updateData.company = company;
      if (status !== undefined) updateData.status = status;
      if (priority !== undefined) updateData.priority = priority;
      if (assignedTo !== undefined) updateData.assignedTo = assignedTo || null;
      if (branchId !== undefined) {
        if (u && !u.isSuperAdmin && !isPrivilegedRole(u.role)) {
          if (branchId && !canAccessBranch(u, String(branchId))) {
            res.status(403).json({ error: 'Cannot move lead to unauthorized branch', code: 'FORBIDDEN' });
            return;
          }
        }
        updateData.branchId = branchId || null;
      }
      if (score !== undefined) updateData.score = Number(score);
      if (metadata !== undefined) updateData.metadata = metadata;

      const lead = await Lead.findByIdAndUpdate(existing._id, updateData, { new: true, runValidators: true });

      const actorId = authReq(req).user?.userId;
      if (status && status !== existing.status) {
        await LeadActivity.create({
          leadId: existing._id,
          companyId: existing.companyId,
          branchId: existing.branchId,
          actorId,
          action: 'STATUS_CHANGED',
          metadata: { from: existing.status, to: status },
        }).catch(() => {});
      }
      if (assignedTo !== undefined && String(assignedTo) !== String(existing.assignedTo)) {
        await LeadActivity.create({
          leadId: existing._id,
          companyId: existing.companyId,
          branchId: existing.branchId,
          actorId,
          action: 'LEAD_ASSIGNED',
          metadata: { assignedTo },
        }).catch(() => {});
      }

      RealtimeService.broadcastToCompany(existing.companyId.toString(), {
        type: 'LEAD_UPDATED',
        payload: lead,
      });

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
      if (!ctx.user?.isSuperAdmin && lead.branchId && !canAccessBranch(ctx.user, lead.branchId.toString())) {
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
      if (!ctx.user?.isSuperAdmin && lead.branchId && !canAccessBranch(ctx.user, lead.branchId.toString())) {
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

  static async batchAssign(req: Request, res: Response): Promise<void> {
    try {
      const { leadIds, assignedTo, branchId } = req.body;
      if (!Array.isArray(leadIds) || leadIds.length === 0) {
        res.status(400).json({ error: 'leadIds array is required', code: 'VALIDATION_ERROR' });
        return;
      }

      const u = authReq(req).user;
      const filter: any = { _id: { $in: leadIds } };
      if (!u?.isSuperAdmin) {
        filter.companyId = u?.companyId;
        if (!isPrivilegedRole(u?.role)) {
          const allowed = (u?.allowedBranchIds || []).map(String);
          if (u?.branchId) allowed.push(String(u.branchId));
          filter.branchId = { $in: [...new Set(allowed)] };
        }
      }

      const updateData: any = {};
      if (assignedTo !== undefined) updateData.assignedTo = assignedTo || null;
      if (branchId) updateData.branchId = branchId;

      const result = await Lead.updateMany(filter, { $set: updateData });

      for (const id of leadIds) {
        await LeadActivity.create({
          leadId: id,
          companyId: u?.companyId,
          branchId: branchId || u?.branchId,
          actorId: u?.userId,
          action: 'BATCH_ASSIGNED',
          metadata: { assignedTo, branchId },
        }).catch(() => {});
      }

      await recordAudit({
        actorId: u?.userId,
        action: 'LEADS_BATCH_ASSIGNED',
        companyId: u?.companyId,
        metadata: { count: result.modifiedCount, assignedTo, branchId },
      });

      if (u?.companyId) {
        RealtimeService.broadcastToCompany(u.companyId.toString(), {
          type: 'LEAD_UPDATED',
          payload: { action: 'BATCH_ASSIGN', modifiedCount: result.modifiedCount, assignedTo, branchId },
        });
      }

      res.json({
        success: true,
        modifiedCount: result.modifiedCount,
        message: `Successfully assigned ${result.modifiedCount} lead(s).`,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'BATCH_ASSIGN_ERROR' });
    }
  }

  static async seedDemoLeads(req: Request, res: Response): Promise<void> {
    try {
      const u = authReq(req).user;
      const companyId = u?.companyId || req.body.companyId;
      if (!companyId) {
        res.status(400).json({ error: 'Company ID is required to seed leads', code: 'VALIDATION_ERROR' });
        return;
      }

      const { Branch } = await import('../../common/models/Branch');
      const { User } = await import('../../common/models/User');

      const branches = await Branch.find({ companyId });
      const users = await User.find({
        companyId,
        role: { $in: [Role.SALES_AGENT, Role.BRANCH_MANAGER, Role.COMPANY_MANAGER] },
      });

      const defaultBranchId = branches[0]?._id;
      const defaultUserId = users[0]?._id;

      const demoLeadsData = [
        {
          name: 'Sarah Jenkins',
          email: 'sarah.jenkins@techcorp.io',
          phone: '+1 (555) 234-8901',
          company: 'TechCorp Solutions',
          status: 'new',
          priority: 'urgent',
          score: 94,
          source: 'meta_ads',
          message: 'Interested in enterprise multi-tenant rollout for 5 branches. Need immediate demo and quotation.',
          metadata: {
            budget: '$50,000 - $100,000',
            timeline: 'Immediate (within 14 days)',
            scoringFactors: ['High budget ($50k+)', 'Decision maker', 'Immediate timeline'],
            followUp: {
              scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
              type: 'call',
              note: 'Initial discovery call and enterprise architecture demo',
              completed: false,
            },
          },
        },
        {
          name: 'Michael Chang',
          email: 'mchang@summitgroup.com',
          phone: '+1 (555) 345-6789',
          company: 'Summit Capital Partners',
          status: 'contacted',
          priority: 'high',
          score: 86,
          source: 'meta_ads',
          message: 'Looking for automated WhatsApp routing and Facebook Lead Ads synchronization.',
          metadata: {
            budget: '$25,000 - $50,000',
            timeline: '1 Month',
            scoringFactors: ['Qualified company', 'Meta ads ad-spend active', 'Responsive phone'],
            followUp: {
              scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
              type: 'meeting',
              note: 'Demonstrate Meta OAuth and webhook auto-sync feature',
              completed: false,
            },
          },
        },
        {
          name: 'Elena Rostova',
          email: 'elena@vanguardproperties.ae',
          phone: '+971 50 123 4567',
          company: 'Vanguard Luxury Properties',
          status: 'qualified',
          priority: 'urgent',
          score: 98,
          source: 'whatsapp',
          message: 'Need 12 branches connected with separate agent pools and phone numbers.',
          metadata: {
            budget: '$100,000+',
            timeline: 'Immediate',
            scoringFactors: ['Luxury sector', 'Multi-branch requirement', 'WhatsApp direct outreach'],
            followUp: {
              scheduledAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
              type: 'call',
              note: 'Urgent follow-up on custom SLA terms',
              completed: false,
            },
          },
        },
        {
          name: 'David Miller',
          email: 'david.miller@apexlogistics.com',
          phone: '+1 (555) 789-0123',
          company: 'Apex Logistics Global',
          status: 'proposal',
          priority: 'high',
          score: 89,
          source: 'website_form',
          message: 'Proposal received. Board review scheduled for Thursday afternoon.',
          metadata: {
            budget: '$45,000',
            timeline: '2 Weeks',
            scoringFactors: ['Proposal submitted', 'Executive sponsorship', 'Security compliance approved'],
            followUp: {
              scheduledAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
              type: 'meeting',
              note: 'Post-board review contract alignment call',
              completed: false,
            },
          },
        },
        {
          name: 'Aisha Al-Mansoor',
          email: 'aisha@gulfenterprises.qa',
          phone: '+974 3312 8765',
          company: 'Gulf Commerce Holding',
          status: 'converted',
          priority: 'medium',
          score: 95,
          source: 'referral',
          message: 'Contract signed. Onboarding starts next Monday with Branch #1.',
          metadata: {
            budget: '$75,000',
            timeline: 'Closed',
            scoringFactors: ['Closed won', 'Annual prepay contract'],
            followUp: {
              scheduledAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
              type: 'email',
              note: 'Sent welcome packet and onboarding credentials',
              completed: true,
              completedAt: new Date().toISOString(),
              outcome: 'Customer activated',
            },
          },
        },
        {
          name: 'Robert Vance',
          email: 'rvance@vancerefrigeration.com',
          phone: '+1 (555) 901-2345',
          company: 'Vance Refrigeration',
          status: 'new',
          priority: 'medium',
          score: 62,
          source: 'website_form',
          message: 'Requested general pricing sheet for 3 commercial sales reps.',
          metadata: {
            budget: '$10,000 - $20,000',
            timeline: '1-3 Months',
            scoringFactors: ['Standard company size', 'Website organic inbound'],
          },
        },
        {
          name: 'Claire Dupont',
          email: 'claire@dupontretail.fr',
          phone: '+33 1 42 68 55 00',
          company: 'Dupont Luxury Retail',
          status: 'contacted',
          priority: 'medium',
          score: 74,
          source: 'meta_ads',
          message: 'Inquired about Facebook carousel lead ads auto-capture.',
          metadata: {
            budget: '$30,000',
            timeline: 'Next quarter',
            scoringFactors: ['European retail', 'Meta ads inquiry'],
            followUp: {
              scheduledAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
              type: 'call',
              note: 'Check if European privacy / GDPR requirements sheet was reviewed',
              completed: false,
            },
          },
        },
        {
          name: 'Marcus Brody',
          email: 'mbrody@brodyautomotive.com',
          phone: '+1 (555) 456-7890',
          company: 'Brody Auto Dealerships',
          status: 'qualified',
          priority: 'high',
          score: 82,
          source: 'google_ads',
          message: '3 dealership locations. Need round-robin dispatching to on-duty sales floor agents.',
          metadata: {
            budget: '$35,000',
            timeline: '3 Weeks',
            scoringFactors: ['Multi-location retail', 'High inbound lead volume'],
            followUp: {
              scheduledAt: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
              type: 'meeting',
              note: 'Show round-robin lead allocation demo',
              completed: false,
            },
          },
        },
        {
          name: 'Liam O\'Connor',
          email: 'liam@dublinfintech.ie',
          phone: '+353 1 496 0123',
          company: 'Emerald FinTech Labs',
          status: 'proposal',
          priority: 'urgent',
          score: 91,
          source: 'meta_ads',
          message: 'Final proposal sent. Reviewing data protection addendum.',
          metadata: {
            budget: '$60,000',
            timeline: 'End of month',
            scoringFactors: ['Fast-growing startup', 'Executive decision maker', 'High engagement'],
            followUp: {
              scheduledAt: new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString(),
              type: 'email',
              note: 'Follow up on DPA legal sign-off',
              completed: false,
            },
          },
        },
        {
          name: 'Sofia Martinez',
          email: 'sofia@martinezlaw.com',
          phone: '+1 (555) 678-9012',
          company: 'Martinez Legal Associates',
          status: 'lost',
          priority: 'low',
          score: 38,
          source: 'website_form',
          message: 'Decided to renew with existing legacy software for another year.',
          metadata: {
            budget: 'Under $5,000',
            timeline: 'Deferred',
            scoringFactors: ['Budget mismatch', 'Legacy software renewal'],
            lostReason: 'Budget constraints & renewed existing vendor',
          },
        },
        {
          name: 'Rajesh Patel',
          email: 'rajesh@patelconsulting.in',
          phone: '+91 98200 12345',
          company: 'Patel Enterprise Consulting',
          status: 'new',
          priority: 'high',
          score: 85,
          source: 'whatsapp',
          message: 'Need CRM integration with our custom ERP via webhooks.',
          metadata: {
            budget: '$25,000',
            timeline: '1 Month',
            scoringFactors: ['WhatsApp verified', 'Technical requirements defined'],
          },
        },
        {
          name: 'Hannah Abbott',
          email: 'hannah@abbottbiotech.co.uk',
          phone: '+44 20 7946 0912',
          company: 'Abbott BioTech Health',
          status: 'converted',
          priority: 'high',
          score: 96,
          source: 'meta_ads',
          message: 'Paid annual subscription. Active account.',
          metadata: {
            budget: '$80,000',
            timeline: 'Closed',
            scoringFactors: ['Healthcare enterprise', 'Full deployment'],
          },
        },
      ];

      const createdLeads = [];
      for (let i = 0; i < demoLeadsData.length; i++) {
        const item = demoLeadsData[i];
        const branch = branches.length > 0 ? branches[i % branches.length]._id : defaultBranchId;
        const assignedAgent = (i % 3 === 0) ? null : (users.length > 0 ? users[i % users.length]._id : defaultUserId);

        const lead = new Lead({
          ...item,
          companyId,
          branchId: branch,
          assignedTo: assignedAgent,
          normalizedPhone: item.phone.replace(/[\s\-\(\)\+]/g, ''),
          normalizedEmail: item.email.toLowerCase(),
        });
        await lead.save();
        createdLeads.push(lead);

        await LeadNote.create({
          leadId: lead._id,
          companyId,
          branchId: branch,
          authorId: u?.userId,
          body: `Inbound capture from ${item.source.replace('_', ' ').toUpperCase()}. Lead Score evaluated at ${item.score}/100.`,
        }).catch(() => {});
      }

      await recordAudit({
        actorId: u?.userId,
        action: 'DEMO_LEADS_SEEDED',
        companyId: companyId.toString(),
        metadata: { count: createdLeads.length },
      });

      RealtimeService.broadcastToCompany(companyId.toString(), {
        type: 'LEAD_CREATED',
        payload: { action: 'SEED_DEMO', count: createdLeads.length },
      });

      res.status(201).json({
        success: true,
        count: createdLeads.length,
        data: createdLeads,
        message: `Successfully seeded ${createdLeads.length} rich demo leads with scores, stages, and follow-ups.`,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'SEED_ERROR' });
    }
  }
}

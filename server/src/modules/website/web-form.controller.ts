import { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { WebsiteLeadForm } from '../../common/models/WebsiteLeadForm';
import { Branch } from '../../common/models/Branch';
import { AuthRequest } from '../../common/middleware/auth';
import { recordAudit } from '../../common/services/audit';
import { BaseController } from '../../common/controllers/BaseController';

export class WebFormController extends BaseController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as AuthRequest).user;
      const companyId = user?.companyId;
      if (!companyId) {
        res.status(400).json({ error: 'Company ID required', code: 'MISSING_COMPANY' });
        return;
      }

      const query: any = { companyId };
      if (user.branchId && !['SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER'].includes(user.role)) {
        query.branchId = user.branchId;
      }

      const forms = await WebsiteLeadForm.find(query)
        .populate('branchId', 'name location')
        .sort({ createdAt: -1 })
        .lean();

      res.json({ success: true, data: forms });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as AuthRequest).user;
      const form = await WebsiteLeadForm.findById(req.params.id)
        .populate('branchId', 'name location')
        .lean();

      if (!form) {
        res.status(404).json({ error: 'Form not found', code: 'NOT_FOUND' });
        return;
      }

      if (!user?.isSuperAdmin && String(form.companyId) !== String(user?.companyId)) {
        res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
        return;
      }

      res.json({ success: true, data: form });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as AuthRequest).user;
      const companyId = user?.companyId;
      if (!companyId) {
        res.status(400).json({ error: 'Company ID required', code: 'MISSING_COMPANY' });
        return;
      }

      const {
        name,
        description,
        branchId,
        fields,
        submitButtonText,
        successMessage,
        tags,
        allowedDomains,
      } = req.body;

      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Form name is required', code: 'VALIDATION_ERROR' });
        return;
      }

      // Validate branch belongs to company if provided
      if (branchId) {
        const branch = await Branch.findOne({ _id: branchId, companyId });
        if (!branch) {
          res.status(400).json({ error: 'Invalid branch ID for this company', code: 'INVALID_BRANCH' });
          return;
        }
      }

      const publicKey = `wf_${randomBytes(16).toString('hex')}`;

      // Default fields if none provided
      const initialFields = Array.isArray(fields) && fields.length > 0
        ? fields
        : [
            { id: 'full_name', label: 'Full Name', type: 'text', placeholder: 'Enter your full name', required: true, order: 0 },
            { id: 'phone', label: 'Phone Number', type: 'phone', placeholder: '+1 555 123 4567', required: true, order: 1 },
            { id: 'email', label: 'Email Address', type: 'email', placeholder: 'name@example.com', required: false, order: 2 },
            { id: 'message', label: 'Message / Details', type: 'textarea', placeholder: 'How can we help you?', required: false, order: 3 },
          ];

      const form = new WebsiteLeadForm({
        companyId,
        branchId: branchId || null,
        name: name.trim(),
        description: (description || '').trim(),
        publicKey,
        fields: initialFields,
        submitButtonText: submitButtonText || 'Submit Inquiry',
        successMessage: successMessage || 'Thank you! Your request has been received. Our team will contact you shortly.',
        tags: Array.isArray(tags) && tags.length > 0 ? tags : ['Website Form'],
        allowedDomains: Array.isArray(allowedDomains) ? allowedDomains : [],
        status: 'active',
        submissionsCount: 0,
      });

      await form.save();

      await recordAudit({
        actorId: user?.userId,
        action: 'WEB_FORM_CREATED',
        companyId: String(companyId),
        branchId: branchId || undefined,
        metadata: { formId: form._id.toString(), name: form.name, publicKey: form.publicKey },
      });

      res.status(201).json({ success: true, data: form });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'CREATE_ERROR' });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as AuthRequest).user;
      const form = await WebsiteLeadForm.findById(req.params.id);
      if (!form) {
        res.status(404).json({ error: 'Form not found', code: 'NOT_FOUND' });
        return;
      }

      if (!user?.isSuperAdmin && String(form.companyId) !== String(user?.companyId)) {
        res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
        return;
      }

      const {
        name,
        description,
        branchId,
        fields,
        submitButtonText,
        successMessage,
        tags,
        allowedDomains,
        status,
      } = req.body;

      if (name !== undefined) form.name = String(name).trim();
      if (description !== undefined) form.description = String(description).trim();
      if (branchId !== undefined) {
        if (branchId) {
          const branch = await Branch.findOne({ _id: branchId, companyId: form.companyId });
          if (!branch) {
            res.status(400).json({ error: 'Invalid branch ID', code: 'INVALID_BRANCH' });
            return;
          }
          form.branchId = branchId;
        } else {
          form.branchId = undefined;
        }
      }
      if (Array.isArray(fields)) form.fields = fields;
      if (submitButtonText !== undefined) form.submitButtonText = submitButtonText;
      if (successMessage !== undefined) form.successMessage = successMessage;
      if (Array.isArray(tags)) form.tags = tags;
      if (Array.isArray(allowedDomains)) form.allowedDomains = allowedDomains;
      if (status && ['active', 'inactive'].includes(status)) form.status = status;

      await form.save();

      await recordAudit({
        actorId: user?.userId,
        action: 'WEB_FORM_UPDATED',
        companyId: String(form.companyId),
        branchId: form.branchId || undefined,
        metadata: { formId: form._id.toString(), name: form.name },
      });

      res.json({ success: true, data: form });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'UPDATE_ERROR' });
    }
  }

  static async toggleStatus(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as AuthRequest).user;
      const form = await WebsiteLeadForm.findById(req.params.id);
      if (!form) {
        res.status(404).json({ error: 'Form not found', code: 'NOT_FOUND' });
        return;
      }

      if (!user?.isSuperAdmin && String(form.companyId) !== String(user?.companyId)) {
        res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
        return;
      }

      form.status = form.status === 'active' ? 'inactive' : 'active';
      await form.save();

      res.json({ success: true, data: form });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'UPDATE_ERROR' });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as AuthRequest).user;
      const form = await WebsiteLeadForm.findById(req.params.id);
      if (!form) {
        res.status(404).json({ error: 'Form not found', code: 'NOT_FOUND' });
        return;
      }

      if (!user?.isSuperAdmin && String(form.companyId) !== String(user?.companyId)) {
        res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
        return;
      }

      await WebsiteLeadForm.findByIdAndDelete(req.params.id);

      await recordAudit({
        actorId: user?.userId,
        action: 'WEB_FORM_DELETED',
        companyId: String(form.companyId),
        metadata: { formId: req.params.id, name: form.name },
      });

      res.json({ success: true, message: 'Form deleted successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'DELETE_ERROR' });
    }
  }
}

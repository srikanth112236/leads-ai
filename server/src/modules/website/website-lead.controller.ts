import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { WebsiteLeadForm } from '../../common/models/WebsiteLeadForm';
import { Lead } from '../../common/models/Lead';
import { LeadSource } from '../../common/models/LeadSource';
import { WebhookEvent } from '../../common/models/WebhookEvent';
import { DeduplicationService } from '../../common/services/DeduplicationService';
import { addProcessingJob } from '../queue/queue.config';
import { normalizePhone, normalizeEmail } from '../../common/utils/validation';
import { logger } from '../../common/utils/logger';
import { BaseController } from '../../common/controllers/BaseController';
import { RealtimeService } from '../realtime/realtime.service';

const CAPTCHA_VERIFY_URLS: Record<string, string> = {
  recaptcha: 'https://www.google.com/recaptcha/api/siteverify',
  turnstile: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
};

async function verifyCaptcha(provider: string, secret: string, token: string): Promise<boolean> {
  const url = CAPTCHA_VERIFY_URLS[provider];
  if (!url) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
      signal: ctrl.signal,
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export class WebsiteLeadController extends BaseController {
  /**
   * Public endpoint to fetch form configuration for external websites, embed widgets, or standalone form view.
   * GET /api/public/forms/:formIdOrKey
   */
  static async getPublicForm(req: Request, res: Response): Promise<void> {
    try {
      const identifier = req.params.formIdOrKey;
      let form = null;

      if (Types.ObjectId.isValid(identifier)) {
        form = await WebsiteLeadForm.findById(identifier).lean();
      }
      if (!form) {
        form = await WebsiteLeadForm.findOne({ publicKey: identifier }).lean();
      }

      if (!form || form.status !== 'active') {
        res.status(404).json({ error: 'Form not found or currently inactive', code: 'FORM_NOT_FOUND' });
        return;
      }

      res.json({
        success: true,
        data: {
          _id: form._id,
          name: form.name,
          description: form.description,
          publicKey: form.publicKey,
          fields: form.fields || [],
          submitButtonText: form.submitButtonText || 'Submit',
          successMessage: form.successMessage || 'Thank you! Your submission has been received.',
          tags: form.tags || [],
        },
      });
    } catch (error: any) {
      logger.error('Failed to get public form schema', { error: error.message });
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  /**
   * Public submission endpoint.
   * POST /api/public/forms/:formIdOrKey/submit
   * or POST /api/public/leads (with publicKey in body)
   */
  static async submit(req: Request, res: Response): Promise<void> {
    try {
      const identifier = req.params.formIdOrKey || req.body.publicKey || req.body.formId;
      if (!identifier) {
        res.status(400).json({ error: 'Form identifier (formId or publicKey) is required', code: 'MISSING_FORM_IDENTIFIER' });
        return;
      }

      let form = null;
      if (Types.ObjectId.isValid(identifier)) {
        form = await WebsiteLeadForm.findById(identifier);
      }
      if (!form) {
        form = await WebsiteLeadForm.findOne({ publicKey: identifier });
      }

      if (!form) {
        res.status(404).json({ error: 'Invalid form identifier', code: 'INVALID_FORM_KEY' });
        return;
      }

      if (form.status !== 'active') {
        res.status(400).json({ error: 'This form is currently inactive and not accepting submissions', code: 'FORM_INACTIVE' });
        return;
      }

      // Allowed domain validation if configured
      const origin = req.get('origin') || req.get('referer');
      if (form.allowedDomains && form.allowedDomains.length > 0 && origin) {
        try {
          const originHost = new URL(origin).hostname;
          const isAllowed = form.allowedDomains.some((d: string) => originHost.endsWith(d.trim()));
          if (!isAllowed) {
            res.status(403).json({ error: 'Submissions from this domain are not authorized', code: 'DOMAIN_FORBIDDEN' });
            return;
          }
        } catch {
          // ignore parsing error
        }
      }

      // Honeypot check
      const honeypotField = (form.configuration?.honeypotField as string) || 'website_url';
      if (req.body[honeypotField] || req.body.company_website) {
        logger.warn('Honeypot triggered on website form', { formId: form._id.toString() });
        res.status(201).json({ success: true, data: { message: form.successMessage || 'Lead received successfully' } });
        return;
      }

      // Optional CAPTCHA
      const captcha = form.configuration?.captcha as { provider?: string; secret?: string } | undefined;
      if (captcha?.provider && captcha?.secret) {
        if (!req.body.captchaToken || !(await verifyCaptcha(captcha.provider, captcha.secret, req.body.captchaToken))) {
          res.status(400).json({ error: 'CAPTCHA verification failed', code: 'INVALID_CAPTCHA' });
          return;
        }
      }

      // Dynamic field validation against form.fields
      const body = req.body || {};
      const fields = form.fields || [];

      for (const field of fields) {
        if (field.required) {
          const val = body[field.id] ?? body[field.label] ?? body[field.id.replace(/_/g, '')];
          if (val === undefined || val === null || String(val).trim() === '') {
            res.status(400).json({
              error: `Field '${field.label}' is required.`,
              code: 'REQUIRED_FIELD_MISSING',
              fieldId: field.id,
            });
            return;
          }
        }
      }

      // Extract core lead attributes
      const hasExplicitName = [body.name, body.full_name, body.fullName, body.first_name].some(
        (v) => v !== undefined && v !== null && String(v).trim() !== ''
      );
      if (!hasExplicitName) {
        res.status(400).json({
          error: 'Name is required.',
          code: 'VALIDATION_ERROR',
        });
        return;
      }
      const rawName = body.name || body.full_name || body.fullName || body.first_name || 'Website Visitor';
      const rawEmail = body.email || body.email_address || body.emailAddress;
      const rawPhone = body.phone || body.phone_number || body.phoneNumber || body.mobile || body.contact;
      const rawCompany = body.company || body.company_name || body.business;
      const rawMessage = body.message || body.notes || body.comment || body.inquiry;
      const pageUrl = body.pageUrl || req.get('referer') || '';
      const utm_source = body.utm_source;
      const utm_medium = body.utm_medium;
      const utm_campaign = body.utm_campaign;

      // Reject malformed email addresses
      if (rawEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(rawEmail).trim())) {
        res.status(400).json({
          error: 'Invalid email address.',
          code: 'VALIDATION_ERROR',
        });
        return;
      }

      // Ensure at least a phone number or email address exists
      if (!rawPhone && !rawEmail) {
        res.status(400).json({
          error: 'Please provide at least a contact phone number or email address.',
          code: 'CONTACT_INFO_REQUIRED',
        });
        return;
      }

      const normalizedPhone = rawPhone ? normalizePhone(String(rawPhone)) : undefined;
      const normalizedEmail = rawEmail ? normalizeEmail(String(rawEmail)) : undefined;

      // Extract all form answers for rich display in CRM
      const answers: Record<string, any> = {};
      for (const field of fields) {
        const val = body[field.id] ?? body[field.label];
        if (val !== undefined && val !== null && val !== '') {
          answers[field.label || field.id] = val;
        }
      }

      // Also capture any other custom body attributes not in standard ignore list
      const standardKeys = new Set([
        'name', 'full_name', 'fullName', 'first_name', 'last_name',
        'email', 'email_address', 'emailAddress',
        'phone', 'phone_number', 'phoneNumber', 'mobile', 'contact',
        'company', 'company_name', 'business',
        'message', 'notes', 'comment', 'inquiry',
        'publicKey', 'formId', 'captchaToken', 'pageUrl',
        'utm_source', 'utm_medium', 'utm_campaign', 'website_url', 'company_website',
      ]);

      for (const [k, v] of Object.entries(body)) {
        if (!standardKeys.has(k) && !answers[k] && v !== undefined && v !== null && v !== '') {
          answers[k] = v;
        }
      }

      // Check deduplication
      const dedupResult = await DeduplicationService.checkDuplicate(
        form.companyId.toString(),
        normalizedEmail,
        normalizedPhone
      );

      const formTags = Array.isArray(form.tags) && form.tags.length > 0 ? form.tags : ['Website Form'];
      const leadTags = Array.from(new Set(['Website Form', `Form: ${form.name}`, ...formTags]));

      let savedLeadId = '';
      let isDuplicate = false;

      if (dedupResult.isDuplicate && dedupResult.leadId) {
        const existingLead = await Lead.findById(dedupResult.leadId);
        if (existingLead) {
          isDuplicate = true;
          savedLeadId = existingLead._id.toString();
          existingLead.metadata = {
            ...(existingLead.metadata || {}),
            ...answers,
            lastInboundForm: form.name,
            lastInboundAt: new Date().toISOString(),
          };
          if (!existingLead.branchId && form.branchId) {
            existingLead.branchId = form.branchId;
          }
          if (Array.isArray(existingLead.tags)) {
            existingLead.tags = Array.from(new Set([...existingLead.tags, ...leadTags]));
          }
          await existingLead.save();

          await LeadSource.create({
            leadId: existingLead._id,
            sourceType: 'WEBSITE_FORM',
            externalId: `wf_${form._id}_${Date.now()}`,
            sourceUrl: pageUrl,
            rawData: body,
            metadata: { utm_source, utm_medium, utm_campaign, formId: form._id.toString(), formName: form.name },
          });
        }
      } else {
        const lead = new Lead({
          companyId: form.companyId,
          branchId: form.branchId || undefined,
          name: String(rawName).trim(),
          email: normalizedEmail,
          phone: normalizedPhone,
          company: rawCompany ? String(rawCompany).trim() : undefined,
          message: rawMessage ? String(rawMessage).trim() : undefined,
          source: 'WEBSITE_FORM',
          tags: leadTags,
          normalizedPhone,
          normalizedEmail,
          metadata: {
            ...answers,
            formId: form._id.toString(),
            formName: form.name,
            utm_source,
            utm_medium,
            utm_campaign,
            pageUrl,
          },
          externalIds: { websiteFormId: form._id.toString() },
        });

        await lead.save();
        savedLeadId = lead._id.toString();

        await LeadSource.create({
          leadId: lead._id,
          sourceType: 'WEBSITE_FORM',
          externalId: `wf_${form._id}_${Date.now()}`,
          sourceUrl: pageUrl,
          rawData: body,
          metadata: { utm_source, utm_medium, utm_campaign, formId: form._id.toString(), formName: form.name },
        });

        await WebhookEvent.create({
          provider: 'website',
          eventType: 'lead_created',
          externalEventId: `website_${lead._id}`,
          payload: body,
          status: 'processed',
          attempts: 0,
          maxAttempts: 3,
          receivedAt: new Date(),
          processedAt: new Date(),
          companyId: form.companyId,
          branchId: form.branchId,
          leadId: lead._id,
        });

        // Enqueue async scoring/enrichment
        try {
          await addProcessingJob({ leadId: lead._id.toString(), sourceType: 'WEBSITE_FORM' });
        } catch (queueErr) {
          logger.warn('Failed to enqueue website lead job', { error: queueErr });
        }

        // Live Realtime Broadcast
        try {
          RealtimeService.broadcastToCompany(form.companyId.toString(), {
            type: 'LEAD_CREATED',
            payload: lead,
          });
        } catch (rtErr) {
          logger.warn('Failed to broadcast realtime website lead event', { error: rtErr });
        }
      }

      // Update form submission counter
      await WebsiteLeadForm.findByIdAndUpdate(form._id, {
        $inc: { submissionsCount: 1 },
        $set: { lastSubmissionAt: new Date() },
      });

      res.status(201).json({
        success: true,
        data: {
          leadId: savedLeadId,
          isDuplicate,
          message: form.successMessage || 'Thank you! Your request has been received.',
        },
      });
    } catch (error: any) {
      logger.error('Website lead submission error:', error);
      res.status(500).json({ error: error.message, code: 'SUBMISSION_ERROR' });
    }
  }
}

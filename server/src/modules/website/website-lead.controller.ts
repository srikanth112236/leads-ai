import { Request, Response } from 'express';
import { WebsiteLeadForm } from '../../common/models/WebsiteLeadForm';
import { Lead } from '../../common/models/Lead';
import { LeadSource } from '../../common/models/LeadSource';
import { WebhookEvent } from '../../common/models/WebhookEvent';
import { DeduplicationService } from '../../common/services/DeduplicationService';
import { websiteFormSchema } from '../../common/schemas/validation';
import { addProcessingJob } from '../queue/queue.config';
import { normalizePhone, normalizeEmail } from '../../common/utils/validation';
import { logger } from '../../common/utils/logger';
import { BaseController } from '../../common/controllers/BaseController';

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
  static async submit(req: Request, res: Response): Promise<void> {
    try {
      const { error, value } = websiteFormSchema.validate(req.body, { stripUnknown: false });
      if (error) {
        res.status(400).json({ error: error.details[0]?.message || 'Invalid payload', code: 'VALIDATION_ERROR' });
        return;
      }
      const { publicKey, name, email, phone, company, message, pageUrl, utm_source, utm_medium, utm_campaign, captchaToken, ...metadata } = value;

      const form = await WebsiteLeadForm.findOne({ publicKey, status: 'active' });
      if (!form) {
        res.status(404).json({ error: 'Invalid form key', code: 'INVALID_FORM_KEY' });
        return;
      }

      // Honeypot: bots fill hidden fields; humans don't. Accept silently, store nothing.
      const honeypotField = (form.configuration?.honeypotField as string) || 'website_url';
      if (req.body[honeypotField] || req.body.company_website) {
        logger.warn('Honeypot triggered on website form', { formId: form._id.toString() });
        res.status(201).json({ success: true, data: { message: 'Lead received successfully' } });
        return;
      }

      // Optional CAPTCHA: only enforced when the form configures it.
      const captcha = form.configuration?.captcha as { provider?: string; secret?: string } | undefined;
      if (captcha?.provider && captcha?.secret) {
        if (!captchaToken || !(await verifyCaptcha(captcha.provider, captcha.secret, captchaToken))) {
          res.status(400).json({ error: 'CAPTCHA verification failed', code: 'INVALID_CAPTCHA' });
          return;
        }
      }

      const normalizedPhone = phone ? normalizePhone(phone) : undefined;
      const normalizedEmail = email ? normalizeEmail(email) : undefined;

      const dedupResult = await DeduplicationService.checkDuplicate(form.companyId.toString(), normalizedEmail, normalizedPhone);

      if (dedupResult.isDuplicate && dedupResult.leadId) {
        const existingLead = await Lead.findById(dedupResult.leadId);
        if (existingLead) {
          existingLead.metadata = { ...(existingLead.metadata || {}), ...metadata };
          existingLead.source = 'WEBSITE_FORM';
          await existingLead.save();
          await LeadSource.create({
            leadId: existingLead._id,
            sourceType: 'WEBSITE_FORM',
            externalId: `website_${Date.now()}`,
            sourceUrl: pageUrl,
            rawData: req.body,
            metadata: { utm_source, utm_medium, utm_campaign },
          });
        }
        res.status(200).json({ success: true, data: { leadId: dedupResult.leadId, isDuplicate: true, message: 'Lead already exists' } });
        return;
      }

      const lead = new Lead({
        companyId: form.companyId,
        branchId: form.branchId,
        name,
        email: normalizedEmail,
        phone: normalizedPhone,
        company,
        message,
        source: 'WEBSITE_FORM',
        normalizedPhone,
        normalizedEmail,
        metadata: { ...metadata, utm_source, utm_medium, utm_campaign, pageUrl },
        externalIds: { websiteFormId: form._id.toString() },
      });
      await lead.save();

      await LeadSource.create({
        leadId: lead._id,
        sourceType: 'WEBSITE_FORM',
        externalId: `website_${Date.now()}`,
        sourceUrl: pageUrl,
        rawData: req.body,
        metadata: { utm_source, utm_medium, utm_campaign },
      });

      await WebhookEvent.create({
        provider: 'website',
        eventType: 'lead_created',
        externalEventId: `website_${lead._id}`,
        payload: req.body,
        status: 'processed',
        attempts: 0,
        maxAttempts: 3,
        receivedAt: new Date(),
        processedAt: new Date(),
        companyId: form.companyId,
        branchId: form.branchId,
        leadId: lead._id,
      });

      res.status(201).json({ success: true, data: { leadId: lead._id, isDuplicate: false, message: 'Lead created successfully' } });

      // Heavy post-processing (scoring/enrichment) runs async; never blocks the response.
      try {
        await addProcessingJob({ leadId: lead._id.toString(), sourceType: 'WEBSITE_FORM' });
      } catch (queueError) {
        logger.error('Failed to enqueue website lead post-processing', { leadId: lead._id });
      }
    } catch (error: any) {
      logger.error('Website lead submission error:', error);
      res.status(500).json({ error: error.message, code: 'SUBMISSION_ERROR' });
    }
  }
}

import { Notification } from '../../common/models/Notification';
import { User } from '../../common/models/User';
import { Lead } from '../../common/models/Lead';
import { Role } from '../../common/types';
import { logger } from '../../common/utils/logger';
import { addNotificationJob } from '../queue/queue.config';

async function postJson(url: string, headers: Record<string, string>, body: Record<string, unknown>): Promise<{ ok: boolean; data: any }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  } finally {
    clearTimeout(timer);
  }
}

export class NotificationService {
  static async sendLeadCreatedNotification(leadId: string, companyId: string, branchId?: string): Promise<void> {
    try {
      await addNotificationJob({
        type: 'lead_created',
        leadId,
        companyId,
        branchId,
        channel: 'in_app',
        timestamp: new Date(),
      });
      logger.info('Lead created notification queued', { leadId, companyId });
    } catch (error) {
      logger.error('Failed to queue lead notification:', error);
    }
  }

  static async sendEmailNotification(leadId: string, companyId: string, template?: string): Promise<void> {
    try {
      await addNotificationJob({
        type: 'email',
        leadId,
        companyId,
        template: template || 'lead_created',
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error('Failed to queue email notification:', error);
    }
  }

  static async dispatch(job: Record<string, unknown>): Promise<void> {
    const type = job.type as string;
    if (type === 'lead_created') {
      await this.dispatchLeadCreated(job);
    } else if (type === 'email') {
      await this.dispatchEmail(job);
    } else {
      logger.warn('Unknown notification job type, skipping', { type });
    }
  }

  private static async dispatchLeadCreated(job: Record<string, unknown>): Promise<void> {
    const leadId = job.leadId as string;
    const companyId = job.companyId as string;
    const lead = await Lead.findById(leadId).lean();
    const title = 'New lead';
    const body = lead ? `${(lead as any).name || 'A lead'} via ${(lead as any).source || 'unknown source'}` : 'A new lead arrived';

    const recipients = await User.find({
      companyId,
      role: { $in: [Role.COMPANY_ADMIN, Role.COMPANY_MANAGER] },
      isActive: true,
    }).select('_id').lean();
    const rows = recipients.map((u) => ({
      userId: u._id,
      companyId,
      branchId: job.branchId as string | undefined,
      type: 'lead_created',
      title,
      body,
      data: { leadId },
      read: false,
    }));
    if (rows.length > 0) await Notification.insertMany(rows);

    const tokens = (job.deviceTokens as string[]) || [];
    if (tokens.length > 0) {
      await this.sendFcm(tokens, title, body, { leadId });
    }
    logger.info('Lead created notification dispatched', { leadId, inApp: rows.length });
  }

  private static async dispatchEmail(job: Record<string, unknown>): Promise<void> {
    const to = (job.to as string) || (job.email as string);
    if (!to) {
      logger.warn('Email notification without recipient, skipping');
      return;
    }
    await this.sendBrevo(to, String(job.subject || 'New lead'), String(job.text || 'A new lead arrived'), job.html as string | undefined);
  }

  private static async sendFcm(tokens: string[], title: string, body: string, data: Record<string, unknown>): Promise<void> {
    const serverKey = process.env.FCM_SERVER_KEY;
    if (!serverKey) {
      logger.warn('FCM_SERVER_KEY not configured, push skipped');
      return;
    }
    const res = await postJson(
      'https://fcm.googleapis.com/fcm/send',
      { Authorization: `key=${serverKey}` },
      { registration_ids: tokens, notification: { title, body }, data },
    );
    if (!res.ok) logger.error('FCM send failed', { data: res.data });
  }

  private static async sendBrevo(to: string, subject: string, text: string, html?: string): Promise<void> {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
      logger.warn('BREVO_API_KEY not configured, email skipped');
      return;
    }
    const sender = process.env.BREVO_SENDER || 'no-reply@localhost';
    const res = await postJson(
      'https://api.brevo.com/v3/smtp/email',
      { 'api-key': apiKey },
      { sender: { email: sender }, to: [{ email: to }], subject, textContent: text, ...(html ? { htmlContent: html } : {}) },
    );
    if (!res.ok) logger.error('Brevo send failed', { data: res.data });
  }
}

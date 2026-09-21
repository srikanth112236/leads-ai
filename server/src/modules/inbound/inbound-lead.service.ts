import { Lead } from '../../common/models/Lead';
import { LeadSource } from '../../common/models/LeadSource';
import { WebhookEvent } from '../../common/models/WebhookEvent';
import { TrackerEvent } from '../../common/models/TrackerEvent';
import { DeduplicationService } from '../../common/services/DeduplicationService';
import { logger } from '../../common/utils/logger';
import { normalizePhone, normalizeEmail } from '../../common/utils/validation';

export interface IngestionInput {
  sourceType: string;
  payload: Record<string, unknown>;
  companyId?: string;
  branchId?: string;
  externalId?: string;
}

export interface IngestionResult {
  success: boolean;
  leadId?: string;
  isDuplicate?: boolean;
  existingLeadId?: string;
  error?: string;
}

export class InboundLeadService {
  static async ingest(input: IngestionInput): Promise<IngestionResult> {
    try {
      const { sourceType, payload, companyId, branchId, externalId } = input;
      const name = payload.name || payload.full_name || payload.firstName;
      const email = payload.email || payload.email_address;
      const phone = payload.phone || payload.phone_number;
      const company = payload.company || payload.company_name;
      const message = payload.message || payload.message_text;

      const resolvedCompanyId = companyId || (payload as any).companyId;
      const resolvedBranchId = branchId || (payload as any).branchId;

      if (!resolvedCompanyId) {
        throw new Error('Company ID is required for tenant isolation');
      }

      const normalizedPhone = phone ? normalizePhone(phone as string) : undefined;
      const normalizedEmail = email ? normalizeEmail(email as string) : undefined;

      const dedupResult = await DeduplicationService.checkDuplicate(
        resolvedCompanyId,
        normalizedEmail,
        normalizedPhone
      );

      if (dedupResult.isDuplicate && dedupResult.leadId) {
        logger.info('Duplicate lead found during ingestion', {
          sourceType,
          companyId: resolvedCompanyId,
          existingLeadId: dedupResult.leadId,
        });
        await this.createLeadSource(dedupResult.leadId, sourceType, externalId, payload);
        await this.createTrackerEvent(dedupResult.leadId, resolvedCompanyId, resolvedBranchId, sourceType, 'IMPORTED', payload);
        await this.createWebhookEvent(sourceType, externalId, payload, resolvedCompanyId, resolvedBranchId, dedupResult.leadId, true);
        return { success: true, leadId: dedupResult.leadId, isDuplicate: true, existingLeadId: dedupResult.leadId };
      }

      const lead = new Lead({
        companyId: resolvedCompanyId,
        branchId: resolvedBranchId,
        name: name as string,
        email: normalizedEmail,
        phone: normalizedPhone,
        company: company as string,
        message: message as string,
        source: sourceType,
        normalizedPhone,
        normalizedEmail,
        externalIds: { [sourceType]: externalId || '' },
        metadata: payload,
      });
      await lead.save();

      await this.createLeadSource(lead._id.toString(), sourceType, externalId, payload);
      await this.createTrackerEvent(lead._id.toString(), resolvedCompanyId, resolvedBranchId, sourceType, 'IMPORTED', payload);
      await this.createWebhookEvent(sourceType, externalId, payload, resolvedCompanyId, resolvedBranchId, lead._id.toString(), false);

      logger.info('Lead ingested successfully', { leadId: lead._id, sourceType, companyId: resolvedCompanyId });
      return { success: true, leadId: lead._id.toString(), isDuplicate: false };
    } catch (error: any) {
      logger.error('Inbound lead ingestion failed:', error);
      return { success: false, error: error.message };
    }
  }

  private static async createLeadSource(leadId: string, sourceType: string, externalId?: string, rawData?: Record<string, unknown>): Promise<void> {
    await LeadSource.create({ leadId, sourceType, externalId, rawData: rawData || {} });
  }

  private static async createTrackerEvent(leadId: string, companyId: string, branchId: string | undefined, source: string, eventType: string, metadata?: Record<string, unknown>): Promise<void> {
    await TrackerEvent.create({ source, leadId, companyId, branchId, eventType, metadata });
  }

  private static async createWebhookEvent(provider: string, externalEventId: string | undefined, payload: Record<string, unknown>, companyId: string, branchId: string | undefined, leadId: string | undefined, isDuplicate: boolean = false): Promise<void> {
    try {
      await WebhookEvent.create({
        provider,
        eventType: 'lead_created',
        externalEventId: externalEventId || `ingest_${Date.now()}`,
        payload,
        status: isDuplicate ? 'processed' : 'pending',
        attempts: 0,
        maxAttempts: 3,
        receivedAt: new Date(),
        processedAt: isDuplicate ? new Date() : undefined,
        companyId,
        branchId,
        leadId,
      });
    } catch (error: any) {
      // The ingress controller/worker usually persists this event first;
      // a duplicate key just means the row already exists — not a failure.
      if (error?.code !== 11000) throw error;
    }
  }
}

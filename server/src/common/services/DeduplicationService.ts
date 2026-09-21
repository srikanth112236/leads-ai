import { Lead } from '../models/Lead';
import { logger } from '../utils/logger';
import { normalizePhone, normalizeEmail } from '../utils/validation';

interface DedupResult {
  isDuplicate: boolean;
  leadId?: string;
  mergedInto?: string;
}

export class DeduplicationService {
  static async checkDuplicate(
    companyId: string,
    email?: string,
    phone?: string,
    excludeLeadId?: string
  ): Promise<DedupResult> {
    const normalizedPhone = phone ? normalizePhone(phone) : undefined;
    const normalizedEmail = email ? normalizeEmail(email) : undefined;

    const query: Record<string, unknown> = { companyId };
    if (normalizedEmail) query.normalizedEmail = normalizedEmail;
    if (normalizedPhone) query.normalizedPhone = normalizedPhone;
    if (excludeLeadId) query._id = { $ne: excludeLeadId };

    try {
      const existing = await Lead.findOne(query);
      if (existing) {
        logger.info('Duplicate lead found', { companyId, email: normalizedEmail, phone: normalizedPhone, leadId: existing._id });
        return { isDuplicate: true, leadId: existing._id.toString(), mergedInto: existing._id.toString() };
      }
      return { isDuplicate: false };
    } catch (error) {
      logger.error('Deduplication check failed:', error);
      return { isDuplicate: false };
    }
  }
}

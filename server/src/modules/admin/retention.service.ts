import { Lead } from '../../common/models/Lead';
import { Message } from '../../common/models/Message';
import { LeadNote } from '../../common/models/LeadNote';
import { CampaignAccessService } from '../../common/services/CampaignAccessService';
import { logger } from '../../common/utils/logger';

// Meta developer policy for CRMs: keep lead PII no longer than necessary
// (90-day default) unless an active business relationship exists.
// Active relationship == qualified/converted. Everything else that went quiet
// gets anonymized (structure kept for reporting, identity removed).
const ACTIVE_STATUSES = ['qualified', 'converted'];

export interface RetentionResult {
  cutoffDays: number;
  leadsAnonymized: number;
  messagesAnonymized: number;
  notesAnonymized: number;
  expiredGrantsPurged: number;
}

export class RetentionService {
  static async run(cutoffDays = 90): Promise<RetentionResult> {
    const cutoff = new Date(Date.now() - cutoffDays * 24 * 60 * 60 * 1000);
    const stale = await Lead.find({
      updatedAt: { $lt: cutoff },
      status: { $nin: ACTIVE_STATUSES },
    }).select('_id').lean();
    const ids = stale.map((l) => l._id);

    const expiredGrantsPurged = await CampaignAccessService.purgeExpired();

    if (ids.length === 0) {
      return { cutoffDays, leadsAnonymized: 0, messagesAnonymized: 0, notesAnonymized: 0, expiredGrantsPurged };
    }

    const [leads, messages, notes] = await Promise.all([
      Lead.updateMany(
        { _id: { $in: ids } },
        {
          $set: { name: 'Redacted contact', metadata: {}, externalIds: {} },
          $unset: { email: '', phone: '', company: '', message: '', normalizedEmail: '', normalizedPhone: '' },
        },
      ),
      Message.updateMany({ leadId: { $in: ids } }, { $set: { content: '[redacted]' } }),
      LeadNote.updateMany({ leadId: { $in: ids } }, { $set: { body: '[redacted]' } }),
    ]);
    logger.info('Retention run complete', { cutoffDays, leads: leads.modifiedCount, expiredGrantsPurged });
    return {
      cutoffDays,
      leadsAnonymized: leads.modifiedCount,
      messagesAnonymized: messages.modifiedCount,
      notesAnonymized: notes.modifiedCount,
      expiredGrantsPurged,
    };
  }
}

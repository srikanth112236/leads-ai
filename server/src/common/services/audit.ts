import { AuditLog } from '../models/AuditLog';
import { logger } from '../utils/logger';

export async function recordAudit(input: {
  actorId?: string;
  action: string;
  companyId?: string;
  branchId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await AuditLog.create(input);
  } catch (error) {
    logger.error('Failed to record audit log:', error);
  }
}

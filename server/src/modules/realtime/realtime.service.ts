import { Response } from 'express';
import { isPrivilegedRole } from '../../common/middleware/auth';
import { logger } from '../../common/utils/logger';

export interface RealtimeEvent {
  type: 'LEAD_CREATED' | 'LEAD_UPDATED' | 'CAMPAIGN_UPDATED' | 'FOLLOWUP_DUE' | 'SYSTEM_NOTIFICATION' | 'SESSION_APPROVAL_REQUESTED';
  payload: any;
  companyId: string;
  timestamp: string;
}

interface ClientConnection {
  id: string;
  res: Response;
  companyId: string;
  userId?: string;
  isSuperAdmin?: boolean;
  /** Membership-derived branch allow-list; empty = no branch restriction recorded. */
  allowedBranchIds: string[];
  /** Company-wide roles bypass branch filtering. */
  isPrivileged: boolean;
}

export class RealtimeService {
  private static clients: Map<string, ClientConnection> = new Map();
  private static heartbeatInterval: NodeJS.Timeout | null = null;

  static initialize(): void {
    if (this.heartbeatInterval) return;
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 25000); // 25s keepalive ping
  }

  static registerClient(
    id: string,
    res: Response,
    companyId: string,
    userId?: string,
    isSuperAdmin = false,
    allowedBranchIds: string[] = [],
    role?: string,
  ): void {
    this.initialize();
    const isPrivileged = isSuperAdmin || isPrivilegedRole(role);
    this.clients.set(id, { id, res, companyId, userId, isSuperAdmin, allowedBranchIds, isPrivileged });
    logger.info(`Realtime client connected: ${id} (company: ${companyId}, total: ${this.clients.size})`);

    // Initial greeting event
    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: new Date().toISOString() })}\n\n`);
  }

  static removeClient(id: string): void {
    if (this.clients.has(id)) {
      this.clients.delete(id);
      logger.info(`Realtime client disconnected: ${id} (total: ${this.clients.size})`);
    }
  }

  static broadcastToCompany(companyId: string, event: Omit<RealtimeEvent, 'companyId' | 'timestamp'>): void {
    const fullEvent: RealtimeEvent = {
      ...event,
      companyId,
      timestamp: new Date().toISOString(),
    };

    const payloadString = `data: ${JSON.stringify(fullEvent)}\n\n`;
    // Branch-scoped delivery: branched events reach only privileged clients or
    // clients whose allow-list contains the event branch. Unassigned
    // (null-branch) events are the shared claim pool → delivered company-wide.
    const eventBranch = (event.payload as any)?.branchId
      ? String((event.payload as any).branchId)
      : undefined;

    let sent = 0;
    let skippedBranch = 0;
    for (const client of this.clients.values()) {
      if (client.isSuperAdmin || client.companyId === companyId) {
        if (!client.isPrivileged && eventBranch && !client.allowedBranchIds.includes(eventBranch)) {
          skippedBranch++;
          continue;
        }
        try {
          client.res.write(payloadString);
          sent++;
        } catch (err) {
          logger.warn(`Failed to push realtime event to client ${client.id}`);
          this.removeClient(client.id);
        }
      }
    }

    logger.info(`Realtime broadcast [${event.type}] to company ${companyId} (delivered to ${sent} clients, branch-skipped ${skippedBranch})`);
  }

  /**
   * Push an event to every live connection of one user (all their devices).
   * Returns the number of deliveries – zero means the user is offline
   * (callers fall back to Notification rows / polling).
   */
  static notifyUser(userId: string, event: Omit<RealtimeEvent, 'companyId' | 'timestamp'> & { companyId?: string }): number {
    const fullEvent = {
      ...event,
      companyId: event.companyId || '',
      timestamp: new Date().toISOString(),
    };
    const payloadString = `data: ${JSON.stringify(fullEvent)}\n\n`;
    let sent = 0;
    for (const client of this.clients.values()) {
      if (client.userId && String(client.userId) === String(userId)) {
        try {
          client.res.write(payloadString);
          sent++;
        } catch (err) {
          logger.warn(`Failed to push realtime event to client ${client.id}`);
          this.removeClient(client.id);
        }
      }
    }
    return sent;
  }

  private static sendHeartbeat(): void {
    for (const [id, client] of this.clients.entries()) {
      try {
        client.res.write(': keep-alive ping\n\n');
      } catch (err) {
        this.removeClient(id);
      }
    }
  }

  static getActiveCount(): number {
    return this.clients.size;
  }
}

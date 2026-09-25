import { MetaIntegration } from '../../common/models/MetaIntegration';
import { User } from '../../common/models/User';
import { Notification } from '../../common/models/Notification';
import { decryptToken } from '../../common/security/tokenCrypto';
import { logger } from '../../common/utils/logger';
import { Role } from '../../common/types';

const HEALTH_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const REALERT_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export interface HealthCheckSummary {
  checked: number;
  healthy: number;
  expired: number;
  errors: number;
  alerted: number;
}

/**
 * Periodic token validation loop. For every live integration it calls
 * debug_token, persists the outcome (status / tokenExpiresAt /
 * metadata.lastHealthCheckAt / lastHealthError) and notifies Super Admins
 * when a company's Meta connection newly expires (re-alerted weekly while
 * still broken, never spammed on every run).
 */
export class MetaHealthService {
  static async validateIntegration(integration: any): Promise<{
    valid: boolean;
    expiresAt?: Date;
    grantedScopes?: string[];
    error?: string;
  }> {
    const accessToken = decryptToken(integration?.accessToken);
    if (!accessToken) return { valid: false, error: 'missing access token' };
    const appSecret = decryptToken(integration?.appSecret);
    const appId = integration?.appId || process.env.META_APP_ID;
    const secret = appSecret || process.env.META_APP_SECRET;
    if (!appId || !secret) return { valid: false, error: 'Meta app credentials not configured' };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      const url =
        `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(accessToken)}` +
        `&access_token=${encodeURIComponent(`${appId}|${secret}`)}`;
      const res = await fetch(url, { signal: ctrl.signal });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        const err = data?.error as { message?: string; code?: number } | undefined;
        return { valid: false, error: err?.message || `HTTP ${res.status}` };
      }
      const payload = data?.data || {};
      if (payload.is_valid !== true) {
        const err = payload?.error as { message?: string } | undefined;
        return { valid: false, error: err?.message || 'token reported invalid by Meta' };
      }
      return {
        valid: true,
        expiresAt: payload.expires_at ? new Date(payload.expires_at * 1000) : undefined,
        grantedScopes: Array.isArray(payload.scopes) ? payload.scopes : undefined,
      };
    } catch (error: any) {
      return { valid: false, error: error?.message || 'validation request failed' };
    } finally {
      clearTimeout(timer);
    }
  }

  static async runHealthCheck(): Promise<HealthCheckSummary> {
    const summary: HealthCheckSummary = { checked: 0, healthy: 0, expired: 0, errors: 0, alerted: 0 };
    const integrations = await MetaIntegration.find({ status: { $in: ['active', 'expired'] } }).select(
      '+accessToken +appSecret',
    );
    for (const integration of integrations) {
      summary.checked += 1;
      const result = await this.validateIntegration(integration);
      const meta = { ...((integration.metadata as any) || {}) };
      meta.lastHealthCheckAt = new Date().toISOString();
      if (result.valid) {
        summary.healthy += 1;
        delete meta.lastHealthError;
        await MetaIntegration.updateOne(
          { _id: integration._id },
          {
            $set: {
              status: 'active',
              ...(result.expiresAt ? { tokenExpiresAt: result.expiresAt } : {}),
              ...(result.grantedScopes ? { scopes: result.grantedScopes } : {}),
              metadata: meta,
            },
          },
        );
        continue;
      }
      meta.lastHealthError = result.error;
      const wasActive = integration.status === 'active';
      const lastAlert = meta.lastExpiredAlertAt ? new Date(meta.lastExpiredAlertAt).getTime() : 0;
      const dueRealert = Date.now() - lastAlert > REALERT_AFTER_MS;
      await MetaIntegration.updateOne(
        { _id: integration._id },
        { $set: { status: 'expired', metadata: meta } },
      );
      summary.expired += 1;
      if (wasActive || dueRealert) {
        meta.lastExpiredAlertAt = new Date().toISOString();
        await MetaIntegration.updateOne({ _id: integration._id }, { $set: { metadata: meta } });
        const alerted = await this.alertSuperAdmins(integration, result.error || 'token invalid');
        summary.alerted += alerted;
      } else {
        summary.errors += 1;
      }
      logger.warn('Meta integration token unhealthy', {
        integrationId: integration._id.toString(),
        companyId: integration.companyId?.toString(),
        error: result.error,
      });
    }
    logger.info('Meta health check complete', summary);
    return summary;
  }

  private static async alertSuperAdmins(integration: any, reason: string): Promise<number> {
    const supers = await User.find({ role: Role.SUPER_ADMIN, isActive: true }).select('_id').lean();
    if (supers.length === 0) return 0;
    const label = (integration as any).label || (integration as any).portfolioBusinessId || 'Meta connection';
    await Notification.insertMany(
      supers.map((s: any) => ({
        userId: s._id,
        companyId: integration.companyId,
        type: 'integration_expired',
        title: `Meta disconnected: ${label}`,
        body: `The Meta integration for company ${integration.companyId} failed validation (${reason}). Reconnect in Meta Setup to restore lead sync.`,
        data: { integrationId: integration._id.toString(), companyId: integration.companyId?.toString(), reason },
        read: false,
      })),
    );
    return supers.length;
  }
}

export { HEALTH_CHECK_INTERVAL_MS };

import { createHash, randomUUID } from 'crypto';
import { MetaIntegration } from '../../common/models/MetaIntegration';
import { decryptToken } from '../../common/security/tokenCrypto';
import { logger } from '../../common/utils/logger';
import { META_GRAPH_VERSION, MetaPermanentError, classifyMetaFailure } from './meta.service';

/**
 * Conversions API (CAPI) – downstream event feedback from the CRM to Meta.
 *
 * Funnel example (vehicle booking platform):
 *   Lead (form submit) → BookingRequested (custom) → TestDriveCompleted
 *   (custom, e.g. `Schedule`) → Purchase (vehicle sold).
 * Sending these lets Meta optimize delivery for high-quality bookings
 * instead of raw form submits. User data is SHA-256 hashed per Meta spec.
 */

export interface CapiUserData {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  externalId?: string;
  clientIpAddress?: string;
  clientUserAgent?: string;
  fbc?: string;
  fbp?: string;
}

export interface CapiSendInput {
  companyId: string;
  /** Standard (Lead/Schedule/Purchase/…) or custom event name. */
  eventName: string;
  /** Unix seconds. Defaults to now. */
  eventTime?: number;
  /** Deduplication id. Defaults to a deterministic hash of the payload. */
  eventId?: string;
  leadId?: string;
  userData?: CapiUserData;
  customData?: Record<string, unknown>;
  eventSourceUrl?: string;
  /** Defaults to 'website'. */
  actionSource?: string;
  /** Overrides the integration's stored test code for one-off validation. */
  testEventCode?: string;
}

function normEmail(v?: string): string | undefined {
  const s = (v || '').trim().toLowerCase();
  return s || undefined;
}

function normPhone(v?: string): string | undefined {
  const digits = (v || '').replace(/[^\d]/g, '');
  return digits || undefined;
}

function normGeneric(v?: string): string | undefined {
  const s = (v || '').trim().toLowerCase();
  return s || undefined;
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export class MetaCapiService {
  /** Hash user data per Meta CAPI spec (em, ph, fn, ln, ct, st, zp, country). */
  static hashUserData(input: CapiUserData = {}): Record<string, string> {
    const out: Record<string, string> = {};
    const email = normEmail(input.email);
    if (email) out.em = sha256Hex(email);
    const phone = normPhone(input.phone);
    if (phone) out.ph = sha256Hex(phone);
    const fn = normGeneric(input.firstName);
    if (fn) out.fn = sha256Hex(fn);
    const ln = normGeneric(input.lastName);
    if (ln) out.ln = sha256Hex(ln);
    const ct = normGeneric(input.city);
    if (ct) out.ct = sha256Hex(ct);
    const st = normGeneric(input.state);
    if (st) out.st = sha256Hex(st);
    const zp = normGeneric(input.zip);
    if (zp) out.zp = sha256Hex(zp);
    const country = normGeneric(input.country);
    if (country) out.country = sha256Hex(country);
    if (input.externalId) out.external_id = sha256Hex(String(input.externalId).trim());
    // Click/browser ids are transmitted raw (Meta hashes server-side).
    if (input.fbc) out.fbc = input.fbc;
    if (input.fbp) out.fbp = input.fbp;
    if (input.clientIpAddress) out.client_ip_address = input.clientIpAddress;
    if (input.clientUserAgent) out.client_user_agent = input.clientUserAgent;
    return out;
  }

  static async sendEvent(input: CapiSendInput): Promise<{ eventId: string; eventsReceived: number }> {
    const { companyId, eventName } = input;
    if (!companyId) throw new MetaPermanentError('companyId is required for CAPI events');
    if (!eventName || !String(eventName).trim()) throw new MetaPermanentError('eventName is required for CAPI events');

    const integration = await MetaIntegration.findOne({ companyId, status: 'active' }).select(
      '+accessToken capiDatasetId capiEnabled capiTestEventCode',
    );
    const accessToken = decryptToken((integration as any)?.accessToken);
    if (!integration || !accessToken) {
      throw new MetaPermanentError('no active Meta connection for this company');
    }
    const datasetId = (integration as any).capiDatasetId;
    if (!datasetId) {
      throw new MetaPermanentError('CAPI dataset is not configured for this company (capiDatasetId)');
    }
    if ((integration as any).capiEnabled === false) {
      throw new MetaPermanentError('CAPI is disabled for this company');
    }

    const eventTime = input.eventTime || Math.floor(Date.now() / 1000);
    const fallbackId = sha256Hex(
      `${companyId}:${input.leadId || ''}:${eventName}:${eventTime}:${JSON.stringify(input.customData || {})}`,
    );
    const eventId = input.eventId || fallbackId;
    const userData = this.hashUserData(input.userData);

    const payload: Record<string, unknown> = {
      data: [
        {
          event_name: eventName,
          event_time: eventTime,
          event_id: eventId,
          action_source: input.actionSource || 'website',
          ...(input.eventSourceUrl ? { event_source_url: input.eventSourceUrl } : {}),
          ...(Object.keys(userData).length > 0 ? { user_data: userData } : {}),
          ...(input.customData && Object.keys(input.customData).length > 0 ? { custom_data: input.customData } : {}),
        },
      ],
    };
    const testCode = input.testEventCode ?? (integration as any).capiTestEventCode;
    if (testCode) payload.test_event_code = testCode;

    const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(datasetId)}/events?access_token=${encodeURIComponent(accessToken)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        const err = data?.error as { message?: string; code?: number } | undefined;
        const kind = classifyMetaFailure(err, res.status);
        logger.error('CAPI event rejected', { companyId, eventName, code: err?.code, kind });
        if (kind === 'permanent') throw new MetaPermanentError(err?.message || 'CAPI event rejected', err?.code);
        throw new Error(err?.message || `CAPI request failed (HTTP ${res.status})`);
      }
      const received = Number(data?.events_received ?? 1);
      logger.info('CAPI event accepted', { companyId, eventName, eventId, received });
      return { eventId, eventsReceived: received };
    } finally {
      clearTimeout(timer);
    }
  }
}

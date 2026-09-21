// Maps a Meta Lead Ads lead node (GET /vXX/<leadgen_id>) to normalized CRM fields.
// Field names are form-customizable, so matching is defensive: known variants
// first, then clearly-labeled fallbacks. Never throws on unknown shapes.

export interface MappedMetaLead {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  message?: string;
  meta: Record<string, unknown>;
}

const EMAIL_KEYS = ['email', 'email_address', 'e-mail'];
const PHONE_KEYS = ['phone_number', 'phone', 'mobile', 'mobile_number', 'phone_no'];
const NAME_KEYS = ['full_name', 'name', 'contact_name'];
const FIRST_KEYS = ['first_name', 'firstname', 'given_name'];
const LAST_KEYS = ['last_name', 'lastname', 'surname', 'family_name'];
const COMPANY_KEYS = ['company', 'company_name', 'organization', 'business_name'];
const MESSAGE_KEYS = ['message', 'notes', 'comments', 'message_text'];

function fieldMap(lead: Record<string, unknown>): Map<string, string> {
  const map = new Map<string, string>();
  const fieldData = (lead as any).field_data;
  if (!Array.isArray(fieldData)) return map;
  for (const raw of fieldData as Array<{ name?: unknown; values?: unknown }>) {
    const field = raw as { name?: unknown; values?: unknown };
    if (!field || typeof field.name !== 'string') continue;
    const values = Array.isArray(field.values)
      ? (field.values as unknown[]).filter((v: unknown) => v != null).map((v: unknown) => String(v))
      : [];
    if (values.length > 0 && !map.has(field.name.toLowerCase())) {
      map.set(field.name.toLowerCase(), values.join(', '));
    }
  }
  return map;
}

function pick(map: Map<string, string>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = map.get(key);
    if (value && value.trim()) return value.trim();
  }
  return undefined;
}

export function mapMetaLeadToIngest(lead: Record<string, unknown>): MappedMetaLead {
  const map = fieldMap(lead);
  const first = pick(map, FIRST_KEYS);
  const last = pick(map, LAST_KEYS);
  const name = pick(map, NAME_KEYS) || [first, last].filter(Boolean).join(' ') || undefined;

  const consumed = new Set([...EMAIL_KEYS, ...PHONE_KEYS, ...NAME_KEYS, ...FIRST_KEYS, ...LAST_KEYS, ...COMPANY_KEYS, ...MESSAGE_KEYS]);
  const extra: Record<string, unknown> = {};
  for (const [key, value] of map) {
    if (!consumed.has(key)) extra[key] = value;
  }

  return {
    name,
    email: pick(map, EMAIL_KEYS),
    phone: pick(map, PHONE_KEYS),
    company: pick(map, COMPANY_KEYS),
    message: pick(map, MESSAGE_KEYS),
    meta: {
      leadgenId: (lead as any).id,
      ad_id: (lead as any).ad_id,
      form_id: (lead as any).form_id,
      created_time: (lead as any).created_time,
      customFields: extra,
    },
  };
}

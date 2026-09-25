/** Stable per-browser device identity (one slot each in the 3-device cap). */

const KEY = 'crm_device_id';
const NAME_KEY = 'crm_device_name';

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function detectName(): string {
  const ua = navigator.userAgent || '';
  let browser = 'Browser';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/OPR\//.test(ua)) browser = 'Opera';
  let os = '';
  if (/Windows NT/.test(ua)) os = ' on Windows';
  else if (/Mac OS X/.test(ua)) os = ' on macOS';
  else if (/Android/.test(ua)) os = ' on Android';
  else if (/iPhone|iPad/.test(ua)) os = ' on iOS';
  else if (/Linux/.test(ua)) os = ' on Linux';
  return `${browser}${os}`;
}

export function getDeviceId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = randomId();
    localStorage.setItem(KEY, id);
  }
  return id;
}

export function getDeviceName(): string {
  let name = localStorage.getItem(NAME_KEY);
  if (!name) {
    name = detectName();
    localStorage.setItem(NAME_KEY, name);
  }
  return name;
}

import axios from 'axios';

const API_BASE = (import.meta as any).env?.VITE_API_URL || '/api';

export type SessionEventKind = 'expired' | 'logged-out' | 'access-updated';

type Listener = (kind: SessionEventKind, reason?: string) => void;
const listeners = new Set<Listener>();

export function onSessionEvent(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function emitSessionEvent(kind: SessionEventKind, reason?: string): void {
  for (const fn of [...listeners]) {
    try { fn(kind, reason); } catch { /* never break the caller */ }
  }
}

export function getRefreshToken(): string | null {
  return localStorage.getItem('refresh_token') || sessionStorage.getItem('refresh_token');
}

export function getAccessToken(): string | null {
  return localStorage.getItem('token');
}

function isAuthPath(url?: string): boolean {
  if (!url) return false;
  return url.includes('/auth/login') || url.includes('/auth/refresh') || url.includes('/auth/forgot-password') || url.includes('/auth/reset-password');
}

// Single-flight refresh: concurrent 401s share one /auth/refresh call.
let refreshPromise: Promise<string | null> | null = null;

export function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const refreshToken = getRefreshToken();
        if (!refreshToken) return null;
        const res = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken });
        const accessToken = res.data?.data?.accessToken;
        const nextRefresh = res.data?.data?.refreshToken;
        if (!accessToken) return null;
        localStorage.setItem('token', accessToken);
        axios.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
        if (nextRefresh) {
          // Preserve the original remember-me storage location.
          if (localStorage.getItem('refresh_token')) localStorage.setItem('refresh_token', nextRefresh);
          else sessionStorage.setItem('refresh_token', nextRefresh);
        }
        const userRaw = localStorage.getItem('crm_user');
        if (userRaw) {
          try {
            const u = JSON.parse(userRaw);
            if (res.data?.data?.mustChangePassword) u.mustChangePassword = true;
            localStorage.setItem('crm_user', JSON.stringify(u));
          } catch { /* corrupted cache – login flow will recover */ }
        }
        return accessToken as string;
      } catch {
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

export { isAuthPath };

/**
 * Single shared API instance. All auth/session handling (token attach,
 * branch header, single-flight refresh, session-expired events) lives in
 * hooks/useApi.ts – this module only re-exports it so every page/supports
 * file behaves identically. Do NOT add a second interceptor here: a stray
 * 401 handler that hard-redirects would bypass the session-expiry modal.
 */
export { api as default } from '../hooks/useApi';
export { api } from '../hooks/useApi';

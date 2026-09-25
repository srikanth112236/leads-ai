import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const DEFAULT_TIMEOUT_MINUTES = 60;
const THROTTLE_MS = 5000;

/**
 * Logs out after company-configured inactivity
 * (Company.settings.security.sessionTimeoutMinutes, default 60).
 * Super admins without a company fall back to the default.
 */
export function useInactivityLogout(): void {
  const { user, isAuthenticated, logout } = useAuth();
  const logoutRef = useRef(logout);
  logoutRef.current = logout;

  const companyId = user?.companyId;
  const { data: companyData } = useQuery({
    queryKey: ['session-timeout-company', companyId],
    queryFn: () => api.get(`/companies/${companyId}`).then((r) => r.data),
    enabled: isAuthenticated && !!companyId,
    retry: false,
    staleTime: 10 * 60 * 1000,
  });
  const timeoutMinutes =
    Number((companyData as any)?.data?.settings?.security?.sessionTimeoutMinutes) > 0
      ? Number((companyData as any).data.settings.security.sessionTimeoutMinutes)
      : DEFAULT_TIMEOUT_MINUTES;

  useEffect(() => {
    if (!isAuthenticated) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastReset = 0;

    const arm = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        logoutRef.current('inactivity');
      }, timeoutMinutes * 60 * 1000);
    };

    const onActivity = () => {
      const now = Date.now();
      if (now - lastReset < THROTTLE_MS) return;
      lastReset = now;
      arm();
    };

    arm();
    const events: Array<keyof WindowEventMap> = ['click', 'keydown', 'scroll', 'mousemove', 'touchstart'];
    for (const e of events) window.addEventListener(e, onActivity, { passive: true });
    return () => {
      if (timer) clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, onActivity);
    };
  }, [isAuthenticated, timeoutMinutes]);
}

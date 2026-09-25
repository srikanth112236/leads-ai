import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

export interface RealtimeMessage {
  type: 'LEAD_CREATED' | 'LEAD_UPDATED' | 'CAMPAIGN_UPDATED' | 'FOLLOWUP_DUE' | 'CONNECTED' | 'SESSION_APPROVAL_REQUESTED';
  payload?: any;
  companyId?: string;
  timestamp: string;
}

interface UseRealtimeOptions {
  onLeadCreated?: (lead: any) => void;
  onLeadUpdated?: (lead: any) => void;
  onCampaignUpdated?: (campaign: any) => void;
  onMessage?: (msg: RealtimeMessage) => void;
}

export function useRealtime(options: UseRealtimeOptions = {}) {
  const { user, activeBranchId } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<RealtimeMessage | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  // Fresh scope snapshot for the message filter (defense in depth; the server
  // is the real boundary and already filters by allow-list).
  const scopeRef = useRef({ role: user?.role, activeBranchId });
  scopeRef.current = { role: user?.role, activeBranchId };

  const connect = useCallback(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setIsConnected(false);
      return;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    try {
      const url = `/api/realtime/stream?token=${encodeURIComponent(token)}${user?.companyId ? `&companyId=${encodeURIComponent(user.companyId)}` : ''}`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onopen = () => {
        setIsConnected(true);
      };

      es.onmessage = (e) => {
        try {
          const data: RealtimeMessage = JSON.parse(e.data);
          // Drop events outside the selected branch context for restricted
          // roles (prevents other-branch lead names popping up as toasts).
          const eventBranch = (data.payload as any)?.branchId
            ? String((data.payload as any).branchId)
            : undefined;
          const roleUpper = String(scopeRef.current.role || '').toUpperCase();
          const privileged =
            roleUpper === 'SUPER_ADMIN' ||
            roleUpper === 'COMPANY_ADMIN' ||
            roleUpper === 'COMPANY_MANAGER';
          if (
            eventBranch &&
            !privileged &&
            scopeRef.current.activeBranchId &&
            eventBranch !== String(scopeRef.current.activeBranchId)
          ) {
            return;
          }
          setLastEvent(data);

          if (optionsRef.current.onMessage) {
            optionsRef.current.onMessage(data);
          }

          if (data.type === 'LEAD_CREATED' && optionsRef.current.onLeadCreated) {
            optionsRef.current.onLeadCreated(data.payload);
          } else if (data.type === 'LEAD_UPDATED' && optionsRef.current.onLeadUpdated) {
            optionsRef.current.onLeadUpdated(data.payload);
          } else if (data.type === 'CAMPAIGN_UPDATED' && optionsRef.current.onCampaignUpdated) {
            optionsRef.current.onCampaignUpdated(data.payload);
          }
        } catch {
          // ignore heartbeats/malformed
        }
      };

      es.onerror = () => {
        setIsConnected(false);
        es.close();
        // Auto-reconnect after 5 seconds
        if (!reconnectTimeoutRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectTimeoutRef.current = null;
            connect();
          }, 5000);
        }
      };
    } catch {
      setIsConnected(false);
    }
  }, [user?.companyId]);

  useEffect(() => {
    connect();
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  return {
    isConnected,
    lastEvent,
    reconnect: connect,
  };
}

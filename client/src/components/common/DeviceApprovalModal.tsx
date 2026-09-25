import React, { useState } from 'react';
import { useRealtime } from '../../hooks/useRealtime';
import { useToast } from './Toast';
import { useAuth } from '../../context/AuthContext';
import Button from './Button';
import api from '../../services/api';

interface ApprovalRequest {
  sessionId: string;
  accountEmail?: string;
  deviceId: string;
  deviceName: string;
  ip?: string;
  userAgent?: string;
  requestedAt?: string;
}

/**
 * Shows immediately on your active devices when somebody tries to log in to
 * your account from a new browser. Plain-language actions:
 *  - Allow once – they log in this time only.
 *  - Allow & trust (90 days) – this browser never asks again for 90 days.
 *  - Deny – their login is blocked.
 */
const DeviceApprovalModal: React.FC = () => {
  const toast = useToast();
  const { user } = useAuth();
  const [request, setRequest] = useState<ApprovalRequest | null>(null);
  const [busy, setBusy] = useState(false);

  useRealtime({
    onMessage: (msg) => {
      if (msg.type === 'SESSION_APPROVAL_REQUESTED' && msg.payload?.sessionId) {
        setRequest(msg.payload as ApprovalRequest);
      }
    },
  });

  if (!request) return null;

  const decide = async (action: 'allow' | 'trust' | 'deny') => {
    setBusy(true);
    try {
      const endpoint =
        action === 'deny'
          ? `/auth/sessions/${request.sessionId}/deny`
          : action === 'trust'
          ? `/auth/sessions/${request.sessionId}/trust`
          : `/auth/sessions/${request.sessionId}/allow`;
      await api.post(endpoint);
      if (action === 'deny') {
        toast.success('Login blocked', 'That device was not allowed in. Your account stays safe.');
      } else if (action === 'trust') {
        toast.success('Device trusted for 90 days', 'This browser will log in directly for the next 90 days.');
      } else {
        toast.success('Device allowed', 'The new browser is now logged in (oldest device was logged out).');
      }
      setRequest(null);
    } catch (err: any) {
      toast.error('Action failed', err?.response?.data?.error || 'Could not respond. The request may have expired.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" aria-hidden="true" />
      <div className="relative bg-white rounded-lg shadow-2xl w-full max-w-md p-6">
        <div className="w-12 h-12 mx-auto rounded-full bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center text-xl font-bold">
          !
        </div>
        <h2 className="text-base font-extrabold text-slate-900 mt-3 text-center">
          Is this you trying to log in?
        </h2>
        <p className="text-xs text-slate-500 mt-1 text-center">
          A new browser asked to open your account. If this was not you, press <strong>Deny</strong>.
        </p>

        <div className="mt-3 text-left text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 space-y-1.5">
          <p>
            <span className="font-semibold text-slate-500">Account: </span>
            <span className="font-semibold text-slate-900">{request.accountEmail || user?.email || 'your account'}</span>
          </p>
          <p>
            <span className="font-semibold text-slate-500">Device: </span>
            <span className="text-slate-900">{request.deviceName}</span>
          </p>
          <p>
            <span className="font-semibold text-slate-500">Internet address (IP): </span>
            <span className="font-mono text-slate-900">{request.ip || 'not visible'}</span>
          </p>
          {request.requestedAt && (
            <p>
              <span className="font-semibold text-slate-500">Time: </span>
              <span className="text-slate-900">{new Date(request.requestedAt).toLocaleString()}</span>
            </p>
          )}
        </div>

        <p className="text-[11px] text-slate-400 mt-2 text-center">
          Your account allows 3 devices at a time. Allowing a 4th logs out the device you used longest ago.
        </p>

        <div className="flex flex-col gap-2 mt-4">
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => decide('deny')} loading={busy} size="sm" className="flex-1">
              Deny
            </Button>
            <Button onClick={() => decide('allow')} loading={busy} size="sm" className="flex-1">
              Allow once
            </Button>
          </div>
          <Button variant="success" onClick={() => decide('trust')} loading={busy} size="sm" className="w-full">
            Allow &amp; trust this browser for 90 days
          </Button>
          <button onClick={() => setRequest(null)} className="text-[11px] font-semibold text-slate-400 hover:text-slate-600">
            Dismiss (request stays pending for a minute)
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeviceApprovalModal;

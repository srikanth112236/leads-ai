import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Button from '../components/common/Button';
import { useToast } from '../components/common/Toast';
import api from '../services/api';
import { MonitorSmartphone, ShieldCheck, BellRing } from 'lucide-react';

const SessionsPage: React.FC = () => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['my-sessions'],
    queryFn: () => api.get('/auth/sessions').then((r) => r.data),
    retry: false,
  });
  const sessions: any[] = (data as any)?.data || [];
  const [busy, setBusy] = React.useState(false);

  // Pending login approvals – polled so they appear even if realtime missed.
  const { data: pendingData } = useQuery({
    queryKey: ['my-pending-sessions'],
    queryFn: () => api.get('/auth/sessions/pending').then((r) => r.data),
    retry: false,
    refetchInterval: 5000,
  });
  const pending: any[] = (pendingData as any)?.data || [];

  const { data: trustedData } = useQuery({
    queryKey: ['my-trusted-devices'],
    queryFn: () => api.get('/auth/trusted-devices').then((r) => r.data),
    retry: false,
  });
  const trusted: any[] = (trustedData as any)?.data || [];

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['my-sessions'] });
    queryClient.invalidateQueries({ queryKey: ['my-pending-sessions'] });
    queryClient.invalidateQueries({ queryKey: ['my-trusted-devices'] });
  };

  const revoke = async (id: string) => {
    setBusy(true);
    try {
      await api.delete(`/auth/sessions/${id}`);
      toast.success('Session revoked', 'That device was logged out immediately.');
      refresh();
    } catch (err: any) {
      toast.error('Failed', err?.response?.data?.error || 'Could not revoke session.');
    } finally {
      setBusy(false);
    }
  };

  const revokeOthers = async () => {
    setBusy(true);
    try {
      const res = await api.delete('/auth/sessions/others');
      toast.success('Done', `${res.data?.data?.revoked || 0} other session(s) revoked.`);
      refresh();
    } catch (err: any) {
      toast.error('Failed', err?.response?.data?.error || 'Could not revoke sessions.');
    } finally {
      setBusy(false);
    }
  };

  const decidePending = async (sessionId: string, action: 'allow' | 'trust' | 'deny') => {
    setBusy(true);
    try {
      const endpoint =
        action === 'deny'
          ? `/auth/sessions/${sessionId}/deny`
          : action === 'trust'
          ? `/auth/sessions/${sessionId}/trust`
          : `/auth/sessions/${sessionId}/allow`;
      await api.post(endpoint);
      toast.success(
        action === 'deny' ? 'Login blocked' : action === 'trust' ? 'Device trusted for 90 days' : 'Device approved',
      );
      refresh();
    } catch (err: any) {
      toast.error('Failed', err?.response?.data?.error || 'Could not respond.');
    } finally {
      setBusy(false);
    }
  };

  const removeTrust = async (deviceId: string) => {
    setBusy(true);
    try {
      await api.delete(`/auth/trusted-devices/${encodeURIComponent(deviceId)}`);
      toast.success('Trust removed', 'That browser will ask for approval on its next login.');
      refresh();
    } catch (err: any) {
      toast.error('Failed', err?.response?.data?.error || 'Could not remove trust.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-lg border border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
        <div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight">Active Sessions</h1>
          <p className="text-xs text-slate-500">Your account can stay logged in on up to 3 devices. Revoking logs that device out immediately.</p>
        </div>
        {sessions.length > 1 && (
          <Button variant="secondary" size="sm" onClick={revokeOthers} loading={busy}>
            Revoke all others
          </Button>
        )}
      </div>

      {pending.length > 0 && (
        <div className="bg-amber-50/70 border border-amber-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-amber-200/70 flex items-center gap-2">
            <BellRing size={16} className="text-amber-600" />
            <h2 className="text-sm font-bold text-slate-900">Waiting for your approval ({pending.length})</h2>
          </div>
          <div className="divide-y divide-amber-100">
            {pending.map((p: any) => (
              <div key={p.sessionId} className="px-4 py-3">
                <p className="text-sm font-semibold text-slate-900">{p.deviceName || 'Unknown device'}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {p.accountEmail ? `${p.accountEmail} • ` : ''}{p.ip ? <span className="font-mono">{p.ip} • </span> : ''}
                  asked {p.requestedAt ? new Date(p.requestedAt).toLocaleTimeString() : 'just now'}
                </p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <Button variant="secondary" size="sm" onClick={() => decidePending(p.sessionId, 'deny')} loading={busy}>
                    Deny
                  </Button>
                  <Button size="sm" onClick={() => decidePending(p.sessionId, 'allow')} loading={busy}>
                    Allow once
                  </Button>
                  <Button variant="success" size="sm" onClick={() => decidePending(p.sessionId, 'trust')} loading={busy}>
                    Allow &amp; trust 90 days
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {trusted.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.05)] overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <ShieldCheck size={16} className="text-emerald-600" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">Trusted browsers ({trusted.length})</h2>
              <p className="text-[11px] text-slate-500">These log in without asking. Trust ends automatically after 90 days for your safety.</p>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {trusted.map((t: any) => (
              <div key={t.deviceId} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 truncate">{t.deviceName || t.deviceId}</p>
                  <p className="text-[11px] text-slate-500">
                    Trusted until {t.expiresAt ? new Date(t.expiresAt).toLocaleDateString() : '—'}
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => removeTrust(t.deviceId)} loading={busy}>
                  Remove trust
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.05)] overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-slate-400 text-sm">
            <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            Loading sessions…
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-center py-12 text-slate-400 text-sm">No active sessions.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {sessions.map((s: any) => (
              <div key={s._id} className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                  <MonitorSmartphone size={17} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {s.deviceName || 'Unknown device'}
                    {s.current && (
                      <span className="ml-2 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-px">
                        This device
                      </span>
                    )}
                    {s.status === 'pending' && (
                      <span className="ml-2 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-px">
                        Awaiting approval
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">
                    {s.ip ? <span className="font-mono">{s.ip} • </span> : ''}
                    Last seen {s.lastSeenAt ? new Date(s.lastSeenAt).toLocaleString() : '—'}
                  </p>
                </div>
                {!s.current && (
                  <Button variant="secondary" size="sm" onClick={() => revoke(s._id)} loading={busy}>
                    Revoke
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionsPage;

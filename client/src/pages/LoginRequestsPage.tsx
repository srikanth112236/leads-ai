import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Button from '../components/common/Button';
import CustomSelect from '../components/common/CustomSelect';
import { useToast } from '../components/common/Toast';
import api from '../services/api';
import { ShieldCheck, BellRing, Hourglass } from 'lucide-react';
import { statusPillClasses } from '../utils/campaignGrants';

type Tab = 'requests' | 'security' | 'expiring';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  denied: 'bg-rose-50 text-rose-700 border-rose-200',
  expired: 'bg-slate-100 text-slate-500 border-slate-200',
  revoked: 'bg-slate-100 text-slate-500 border-slate-200',
};

const LoginRequestsPage: React.FC = () => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('requests');
  const [statusFilter, setStatusFilter] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: requestsData, isLoading: requestsLoading } = useQuery({
    queryKey: ['login-requests', statusFilter],
    queryFn: () =>
      api.get(`/auth/login-requests${statusFilter ? `?status=${statusFilter}` : ''}`).then((r) => r.data),
    retry: false,
  });
  const requests: any[] = (requestsData as any)?.data || [];

  const { data: securityData, isLoading: securityLoading } = useQuery({
    queryKey: ['security-overview'],
    queryFn: () => api.get('/auth/security/overview').then((r) => r.data),
    enabled: tab !== 'requests',
    retry: false,
  });
  const security: any = (securityData as any)?.data;
  const expiring = (security?.users || []).filter(
    (u: any) => u.accessDaysLeft !== null && u.accessDaysLeft <= 7,
  );

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['login-requests'] });
    queryClient.invalidateQueries({ queryKey: ['security-overview'] });
  };

  const decide = async (id: string, action: 'allow' | 'deny' | 'trust') => {
    setBusy(true);
    try {
      const endpoint =
        action === 'deny'
          ? `/auth/sessions/${id}/deny`
          : action === 'trust'
          ? `/auth/sessions/${id}/trust`
          : `/auth/sessions/${id}/allow`;
      await api.post(endpoint);
      toast.success(
        action === 'deny' ? 'Login blocked' : action === 'trust' ? 'Approved + trusted 90 days' : 'Login approved',
      );
      refresh();
    } catch (err: any) {
      toast.error('Failed', err?.response?.data?.error || 'Could not respond.');
    } finally {
      setBusy(false);
    }
  };

  const extend = async (userId: string, email: string) => {
    setBusy(true);
    try {
      const res = await api.post(`/auth/users/${userId}/extend-access`);
      toast.success(
        'Access extended 90 days',
        `${email} was notified to log out and log in again within 24 hours.`,
      );
      void res;
      refresh();
    } catch (err: any) {
      toast.error('Failed', err?.response?.data?.error || 'Could not extend access.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
        <h1 className="text-lg font-bold text-slate-900 tracking-tight">Login Requests & Access</h1>
        <p className="text-xs text-slate-500">
          Review new device logins, see who is logged in now, and extend account access before it expires.
        </p>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit mt-3">
          {([
            { key: 'requests', label: 'Requests', icon: <BellRing size={14} /> },
            { key: 'security', label: 'Who is logged in', icon: <ShieldCheck size={14} /> },
            { key: 'expiring', label: `Expiring access (${expiring.length})`, icon: <Hourglass size={14} /> },
          ] as Array<{ key: Tab; label: string; icon: React.ReactNode }>).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'requests' && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.05)] overflow-hidden">
          <div className="p-3 border-b border-slate-100 flex items-center gap-3 flex-wrap">
            <div className="w-48 [&>div]:mb-0">
              <CustomSelect
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: '', label: 'All statuses' },
                  { value: 'pending', label: 'Pending' },
                  { value: 'active', label: 'Approved' },
                  { value: 'denied', label: 'Denied' },
                  { value: 'expired', label: 'Expired' },
                  { value: 'revoked', label: 'Revoked' },
                ]}
                compact
              />
            </div>
            <p className="text-[11px] text-slate-400">Newest first. Pending requests need your decision.</p>
          </div>
          {requestsLoading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-slate-400 text-sm">
              <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              Loading requests…
            </div>
          ) : requests.length === 0 ? (
            <p className="text-center py-12 text-slate-400 text-sm">No login requests found.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {requests.map((r: any) => (
                <div key={r._id} className="px-4 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-slate-900">
                      {r.user?.name || r.user?.email || 'Unknown user'}
                    </p>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_COLORS[r.status] || statusPillClasses('')}`}>
                      {r.status}
                    </span>
                    {r.deviceKind && (
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5">
                        {r.deviceKind}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {r.user?.email ? `${r.user.email} • ` : ''}
                    {r.deviceName || 'Unknown device'}
                    {r.ip ? <span className="font-mono"> • {r.ip}</span> : ' • IP not visible'}
                    {r.requestedAt ? ` • asked ${new Date(r.requestedAt).toLocaleString()}` : ''}
                  </p>
                  {r.decidedBy && (
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Decided by {r.decidedBy.name || r.decidedBy.email}
                      {r.decidedAt ? ` on ${new Date(r.decidedAt).toLocaleString()}` : ''}
                    </p>
                  )}
                  {r.status === 'pending' && (
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <Button variant="secondary" size="sm" onClick={() => decide(r._id, 'deny')} loading={busy}>
                        Deny
                      </Button>
                      <Button size="sm" onClick={() => decide(r._id, 'allow')} loading={busy}>
                        Allow once
                      </Button>
                      <Button variant="success" size="sm" onClick={() => decide(r._id, 'trust')} loading={busy}>
                        Allow &amp; trust 90 days
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'security' && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.05)] overflow-hidden">
          {securityLoading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-slate-400 text-sm">
              <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              Loading…
            </div>
          ) : (security?.users || []).length === 0 ? (
            <p className="text-center py-12 text-slate-400 text-sm">No users in scope.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {(security?.users || []).map((u: any) => (
                <div key={u.id} className="px-4 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-slate-900">{u.name || u.email}</p>
                    <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5">
                      {u.tier === 'branch' ? 'Branch (1 web + 1 mobile)' : 'Company (3 devices)'}
                    </span>
                    <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 border ${u.activeCount > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                      {u.activeCount} logged in
                    </span>
                    {u.accessDaysLeft !== null && (
                      <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 border ${u.accessDaysLeft <= 3 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                        access ends in {u.accessDaysLeft}d
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">{u.email} • {u.role?.replace(/_/g, ' ')}</p>
                  {(u.sessions || []).length > 0 && (
                    <div className="mt-1.5 space-y-1">
                      {(u.sessions || []).map((s: any, i: number) => (
                        <p key={i} className="text-[11px] text-slate-500">
                          • {s.deviceName || 'Device'} ({s.deviceKind || 'web'})
                          {s.ip ? <span className="font-mono"> • {s.ip}</span> : ''}
                          {s.lastSeenAt ? ` • seen ${new Date(s.lastSeenAt).toLocaleString()}` : ''}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'expiring' && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.05)] overflow-hidden">
          {securityLoading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-slate-400 text-sm">
              <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              Loading…
            </div>
          ) : expiring.length === 0 ? (
            <p className="text-center py-12 text-slate-400 text-sm">Nobody's access ends within 7 days. All good.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {expiring.map((u: any) => (
                <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900 truncate">{u.name || u.email}</p>
                    <p className="text-[11px] text-slate-500">
                      {u.email} • access ends in <strong className={u.accessDaysLeft <= 3 ? 'text-amber-700' : ''}>{u.accessDaysLeft} day(s)</strong>
                    </p>
                  </div>
                  <Button size="sm" onClick={() => extend(u.id, u.email)} loading={busy}>
                    Extend +90 days
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LoginRequestsPage;

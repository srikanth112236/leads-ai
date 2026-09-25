import React from 'react';
import Card from '../components/common/Card';
import { useGet } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import { Target, Users, MonitorSmartphone, Kanban, GitBranch, Building2, ScrollText } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-28 truncate text-slate-600">{label}</span>
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`${color} h-full rounded-full`} style={{ width: `${max > 0 ? Math.round((value / max) * 100) : 0}%` }} />
      </div>
      <span className="w-10 text-right font-bold">{value}</span>
    </div>
  );
}

type RoleBand = 'super' | 'company' | 'branch' | 'agent';

function roleBand(role?: string): RoleBand {
  const r = String(role || '').toUpperCase();
  if (r === 'SUPER_ADMIN') return 'super';
  if (r === 'COMPANY_ADMIN' || r === 'COMPANY_MANAGER') return 'company';
  if (r === 'BRANCH_MANAGER') return 'branch';
  return 'agent';
}

const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const band = roleBand(user?.role);
  const { data, isLoading } = useGet('/dashboard/summary');
  const { data: myCampaignsData } = useQuery({
    queryKey: ['campaign-access-mine'],
    queryFn: () => api.get('/campaign-access/mine').then((r) => r.data),
    retry: false,
  });
  const myCampaigns: any[] = (myCampaignsData as any)?.data || [];
  const s = (data as any)?.data;

  if (isLoading || !s) return <p>Loading dashboard…</p>;

  const statusEntries = Object.entries(s.leads.byStatus || {}) as Array<[string, number]>;
  const sourceEntries = Object.entries(s.leads.bySource || {}) as Array<[string, number]>;
  const maxStatus = Math.max(0, ...statusEntries.map(([, v]) => v));
  const maxSource = Math.max(0, ...sourceEntries.map(([, v]) => v));

  const showFunnel = band !== 'super';
  const showSources = band === 'company' || band === 'super';
  const showAccounts = band === 'company' || band === 'super' || band === 'branch';
  const showTeamHealth = band !== 'agent';
  const showMyCampaigns = true;
  const showUsersLink = band !== 'agent';
  const showBranchesLink = band === 'company' || band === 'super' || band === 'branch';

  const quickActions: Array<{ to: string; icon: React.ReactNode; label: string; show: boolean }> = [
    { to: '/my-campaigns', icon: <Target size={14} />, label: 'My Campaigns', show: true },
    { to: '/leads/pipeline', icon: <Kanban size={14} />, label: 'Pipeline', show: showFunnel },
    { to: '/users', icon: <Users size={14} />, label: 'Team Directory', show: showUsersLink },
    { to: '/branches', icon: <GitBranch size={14} />, label: 'Branches', show: showBranchesLink },
    { to: '/sessions', icon: <MonitorSmartphone size={14} />, label: 'My Sessions', show: true },
    { to: '/companies', icon: <Building2 size={14} />, label: 'Companies', show: band === 'super' },
    { to: '/audit-logs', icon: <ScrollText size={14} />, label: 'Audit Logs', show: band === 'super' },
  ];

  return (
    <div>
      <p className="text-gray-500 mb-4">Welcome{user ? `, ${user.firstName}` : ''} — here's your business at a glance.</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <Card title="Total Leads"><p className="text-3xl font-extrabold text-blue-600">{s.leads.total}</p></Card>
        <Card title="Converted"><p className="text-3xl font-extrabold text-green-600">{s.leads.converted} <span className="text-base font-bold text-slate-400">({s.leads.conversionRate}%)</span></p></Card>
        <Card title="Portfolios Connected"><p className="text-3xl font-extrabold text-violet-600">{s.portfolios.connected}</p></Card>
        <Card title="Ad Spend (synced)"><p className="text-3xl font-extrabold text-amber-600">{s.portfolios.totalSpend} <span className="text-base font-bold text-slate-400">{s.portfolios.currency || ''}</span></p></Card>
      </div>
      {(showFunnel || showSources) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          {showFunnel && (
            <Card title="Lead Funnel by Status">
              {statusEntries.length === 0 ? <p className="text-sm text-slate-500">No leads yet.</p> :
                <div className="space-y-2">{statusEntries.map(([k, v]) => <Bar key={k} label={k} value={v} max={maxStatus} color="bg-blue-500" />)}</div>}
            </Card>
          )}
          {showSources && (
            <Card title="Leads by Source">
              {sourceEntries.length === 0 ? <p className="text-sm text-slate-500">No leads yet.</p> :
                <div className="space-y-2">{sourceEntries.map(([k, v]) => <Bar key={k} label={k} value={v} max={maxSource} color="bg-violet-500" />)}</div>}
            </Card>
          )}
        </div>
      )}
      {(showAccounts || showTeamHealth) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {showAccounts && (
            <Card title="Ad Accounts">
              {s.portfolios.accounts.length === 0 ? <p className="text-sm text-slate-500">None connected. <Link to="/integrations" className="text-blue-600 hover:underline">Connect Meta</Link></p> : (
                <ul className="text-sm space-y-1.5">
                  {s.portfolios.accounts.map((a: any) => (
                    <li key={a.id}><Link to={`/ad-accounts/${a.id}`} className="text-blue-600 hover:underline font-semibold">{a.name || a.metaAdAccountId}</Link>
                      <span className="text-slate-500"> · spent {a.amountSpent || '0'} {a.currency || ''}</span></li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          {showTeamHealth && (
            <Card title="Team & Health">
              <div className="text-sm space-y-1.5">
                <p>Users: <strong>{s.team.users}</strong> · Branches: <strong>{s.team.branches}</strong></p>
                <p>Failed webhooks (24h): <strong className={s.webhooks.failed24h > 0 ? 'text-red-600' : ''}>{s.webhooks.failed24h}</strong>
                  {s.webhooks.failed24h > 0 && <> — <Link to="/webhooks" className="text-blue-600 hover:underline">inspect</Link></>}</p>
              </div>
            </Card>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        {showMyCampaigns && (
          <Card title="My Campaigns">
            {myCampaigns.length === 0 ? (
              <p className="text-sm text-slate-500">No specific grants. You see all campaigns in your branch(s).</p>
            ) : (
              <>
                <div className="space-y-1.5">
                  {myCampaigns.slice(0, 5).map((g: any, idx: number) => (
                    <div key={`${g.campaignId}-${idx}`} className="flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-800">{g.campaignName || g.campaignId}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${g.access === 'manage' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                        {g.access}
                      </span>
                    </div>
                  ))}
                </div>
                <Link to="/my-campaigns" className="text-xs font-semibold text-indigo-600 hover:underline mt-2 inline-block">View all →</Link>
              </>
            )}
          </Card>
        )}
        <Card title="Quick Actions">
          <div className="space-y-1.5">
            {quickActions.filter((a) => a.show).map((a) => (
              <Link key={a.to} to={a.to} className="flex items-center gap-2 text-sm text-indigo-600 hover:underline">
                {a.icon} {a.label}
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default DashboardPage;

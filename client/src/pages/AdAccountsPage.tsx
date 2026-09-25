import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/common/Button';
import CustomSelect from '../components/common/CustomSelect';
import { useToast } from '../components/common/Toast';
import { useGet, usePost } from '../hooks/useApi';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { ALL_SCOPE_KEYS } from '../components/integrations/MetaPermissionModal';
import { Building2 } from 'lucide-react';

const STATUS_LABELS: Record<number, string> = {
  1: 'Active',
  2: 'Disabled',
  3: 'Unsettled — payment failed',
  4: 'Pending risk review',
  8: 'Pending settlement',
  9: 'In grace period',
  100: 'Pending closure',
  101: 'Closed',
};

function statusLabel(code?: number): string {
  if (code === undefined || code === null) return '—';
  return STATUS_LABELS[code] || `Code ${code}`;
}

const AdAccountsPage: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canManageIntegrations = user?.role === 'SUPER_ADMIN' || user?.role === 'COMPANY_ADMIN';
  const [includeInactive, setIncludeInactive] = useState(false);
  const { data, isLoading } = useGet(includeInactive ? '/meta/adaccounts?includeInactive=true' : '/meta/adaccounts');
  const { data: branchesData } = useGet('/branches');
  const branches: any[] = (branchesData as any)?.data || [];
  const [assigningBranch, setAssigningBranch] = useState<Record<string, boolean>>({});

  const resData = data as any;
  const accounts = resData?.data || [];
  const unassignedAccounts = accounts.filter((a: any) => !a.branchId);
  const meta = resData?.meta || {};
  const activeIntegrations: any[] = meta.activeIntegrations || [];
  const activeWithoutAdScopes = activeIntegrations.filter((i: any) => !i.hasAdScopes);

  const [warnings, setWarnings] = useState<string[]>([]);
  const [updating, setUpdating] = useState(false);
  const sync = usePost('/meta/adaccounts/sync');

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: [includeInactive ? '/meta/adaccounts?includeInactive=true' : '/meta/adaccounts'] });
  };

  const handleAssignBranch = async (accountId: string, branchId: string) => {
    setAssigningBranch((prev) => ({ ...prev, [accountId]: true }));
    try {
      await api.patch(`/meta/adaccounts/${accountId}/assign`, { branchId: branchId || null });
      toast.success('Branch Assigned', 'Ad account mapped to branch. Leads and spend are now isolated to this branch.');
      refresh();
    } catch (err: any) {
      toast.error('Assignment Failed', err?.response?.data?.error || 'Failed to update branch assignment');
    } finally {
      setAssigningBranch((prev) => ({ ...prev, [accountId]: false }));
    }
  };

  const startUpdatePermissions = async () => {
    setUpdating(true);
    try {
      const scopes = ALL_SCOPE_KEYS.join(',');
      const res = await api.get(`/meta/oauth/start?rerequest=true&scopes=${encodeURIComponent(scopes)}`);
      const dialogUrl = res?.data?.data?.dialogUrl;
      if (dialogUrl) {
        window.location.href = dialogUrl;
      } else {
        toast.error('Error', 'No dialog URL returned from server');
      }
    } catch (err: any) {
      toast.error('Error', err?.response?.data?.error || 'Failed to start OAuth');
    } finally {
      setUpdating(false);
    }
  };

  const runSync = () => {
    setWarnings([]);
    sync.mutate(undefined, {
      onSuccess: (res: any) => {
        refresh();
        const syncedCount = res?.data?.data?.synced || 0;
        const resWarnings = res?.data?.data?.warnings || [];
        setWarnings(resWarnings);
        if (resWarnings.length > 0) {
          toast.warning(
            'Sync Completed with Warnings',
            `Synced ${syncedCount} ad account(s). Some accounts need permission updates.`,
          );
        } else {
          toast.success('Sync Successful', `Successfully synced ${syncedCount} ad account(s).`);
        }
      },
      onError: (err: any) => {
        const errorMsg = err?.response?.data?.error || 'Ad account synchronization failed.';
        toast.error('Sync Failed', errorMsg);
        if (/permission|#200|oauth|sync_failed/i.test(errorMsg)) {
          setWarnings([errorMsg]);
        }
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">Meta Ad Accounts</h1>
            {activeIntegrations.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                {activeIntegrations.length} Active Connection{activeIntegrations.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500">Manage and monitor synchronized ad accounts from your active Meta integrations</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Active vs All Filter Toggle */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold mr-1">
            <button
              onClick={() => setIncludeInactive(false)}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                !includeInactive ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Active Only
            </button>
            <button
              onClick={() => setIncludeInactive(true)}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                includeInactive ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              All / History
            </button>
          </div>

          {canManageIntegrations && (
            <>
              <Button variant="secondary" onClick={startUpdatePermissions} loading={updating} size="sm">
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  Update Permissions
                </span>
              </Button>
              <Button onClick={runSync} loading={sync.isPending} size="sm">
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Sync from Meta
                </span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Notice if Connected Meta Account Lacks Ad Permissions */}
      {activeWithoutAdScopes.length > 0 && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 text-xs text-sky-950 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-600 flex items-center justify-center shrink-0 mt-0.5">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="font-bold text-sm text-sky-950">
                Connected Account: {activeWithoutAdScopes.map((i: any) => i.label).join(', ')}
              </p>
              <p className="text-sky-800 text-xs mt-0.5">
                This connected account currently only has basic profile access. To discover and sync ad accounts, grant <code className="bg-sky-100 px-1 py-0.5 rounded font-mono font-bold text-sky-900">ads_read</code> and <code className="bg-sky-100 px-1 py-0.5 rounded font-mono font-bold text-sky-900">ads_management</code> scopes in Meta OAuth.
              </p>
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <Button size="sm" onClick={startUpdatePermissions} loading={updating}>
              Grant Ad Permissions
            </Button>
            <Link to="/integrations" className="text-xs font-semibold underline text-sky-900 hover:text-sky-950 px-2 py-1">
              View Integrations →
            </Link>
          </div>
        </div>
      )}

      {/* Warnings Banner if any integration had (#200) Missing Permissions */}
      {warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-amber-900">
            <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>Some portfolios require permission review</span>
          </div>
          <ul className="list-disc list-inside space-y-1 text-amber-700">
            {warnings.map((w, idx) => (
              <li key={idx}>{w}</li>
            ))}
          </ul>
          <div className="pt-2 flex items-center gap-3">
            <Button size="sm" onClick={startUpdatePermissions} loading={updating}>
              Update Permissions in Meta
            </Button>
            <Link to="/integrations?managePermissions=1" className="font-semibold underline text-amber-900 hover:text-amber-950">
              Manage in Integrations →
            </Link>
          </div>
        </div>
      )}

      {/* Unassigned Ad Accounts Banner */}
      {canManageIntegrations && unassignedAccounts.length > 0 && (
        <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
            <h2 className="text-sm font-bold text-amber-900">
              Ad Accounts Waiting for Branch Assignment ({unassignedAccounts.length})
            </h2>
          </div>
          <p className="text-xs text-amber-700 leading-relaxed">
            By assigning each ad account to a specific branch, your CRM enforces <strong>Scoped Tenant Isolation</strong>. Leads, campaigns, and metrics for that account will only be accessible to team members in that branch.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
            {unassignedAccounts.map((a: any) => (
              <div key={a._id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 bg-white rounded-lg border border-amber-200/70 shadow-xs">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-800 truncate">
                    <Building2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span className="truncate">{a.name || a.metaAdAccountId}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">{a.metaAdAccountId}</p>
                </div>
                <div className="w-full sm:w-52 shrink-0">
                  <CustomSelect
                    value={a.branchId || ''}
                    placeholder="Assign branch..."
                    options={[
                      { value: '', label: 'Select Branch...' },
                      ...branches.map((b: any) => ({ value: b._id, label: b.name })),
                    ]}
                    onChange={(val) => handleAssignBranch(a._id, val)}
                    disabled={assigningBranch[a._id]}
                    compact
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Table Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-slate-400 text-sm">
            <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            Loading ad accounts…
          </div>
        ) : accounts.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <svg className="w-12 h-12 mx-auto text-slate-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <p className="text-base font-semibold text-slate-700">No ad accounts found</p>
            <p className="text-xs text-slate-400 mt-1">
              Connect Meta in <Link to="/integrations" className="text-indigo-600 underline">Integrations</Link>, then click "Sync from Meta".
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse table-auto">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
                  <th className="py-3 px-5">Account</th>
                  <th className="py-3 px-4">Meta Connection</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Branch Assignment</th>
                  <th className="py-3 px-4">Spent</th>
                  <th className="py-3 px-4">Currency</th>
                  <th className="py-3 px-4">Timezone</th>
                  <th className="py-3 px-4">Business</th>
                  <th className="py-3 px-4 text-center">Synced</th>
                  <th className="py-3 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accounts.map((a: any) => (
                  <tr key={a._id} className="hover:bg-slate-50/75 transition-colors">
                    <td className="py-3.5 px-5">
                      <div className="flex flex-col">
                        <Link
                          to={`/ad-accounts/${a._id}`}
                          className="text-sm font-semibold text-slate-900 leading-tight hover:text-indigo-600 transition-colors"
                        >
                          {a.name || a.metaAdAccountId}
                        </Link>
                        <span className="text-xs text-slate-400 font-mono mt-1">
                          {a.metaAdAccountId}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${a.integrationStatus === 'active' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-800 truncate">
                            {a.integrationLabel || 'Meta Connection'}
                          </p>
                          <span className={`text-[10px] font-medium ${a.integrationStatus === 'active' ? 'text-emerald-700' : 'text-slate-400'}`}>
                            {a.integrationStatus === 'active' ? 'Connected' : 'Disconnected'}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                        a.accountStatus === 1 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {statusLabel(a.accountStatus)}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      {canManageIntegrations ? (
                        <div className="w-48">
                          <CustomSelect
                            value={a.branchId || ''}
                            placeholder="Select branch..."
                            options={[
                              { value: '', label: 'Unassigned / Default' },
                              ...branches.map((b: any) => ({ value: b._id, label: b.name })),
                            ]}
                            onChange={(val) => handleAssignBranch(a._id, val)}
                            disabled={assigningBranch[a._id]}
                            compact
                          />
                        </div>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                          {branches.find((b: any) => b._id === a.branchId)?.name || 'Unassigned / Default'}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-semibold text-slate-800 font-mono">
                      {a.amountSpent ? `${a.amountSpent} ${a.currency || ''}` : '—'}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600 font-mono">
                      {a.currency || '—'}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-500 font-mono">
                      {a.timezone || '—'}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600">
                      {a.businessName || a.ownerBusinessId || '—'}
                    </td>
                    <td className="py-3.5 px-4 text-center text-xs text-slate-400 font-mono">
                      {a.lastSyncedAt ? new Date(a.lastSyncedAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      <Link
                        to={`/ad-accounts/${a._id}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
                      >
                        View Campaigns →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdAccountsPage;

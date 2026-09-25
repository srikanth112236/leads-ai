import React, { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/common/Toast';
import Button from '../components/common/Button';
import Toggle from '../components/common/Toggle';
import CustomSelect from '../components/common/CustomSelect';
import {
  grantAccessMap,
  mergeGrantsForSave,
  ensureCampaignDocs,
  isActiveRecord,
  metaStatusOf,
  statusPillClasses,
  type CampaignAccess,
} from '../utils/campaignGrants';
import {
  ArrowLeft,
  Shield,
  Calendar,
  Mail,
  Phone,
  MapPin,
  Users,
  AlertCircle,
} from 'lucide-react';

const MANAGERS = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER', 'BRANCH_MANAGER'];
const canManageCampaigns = (role: string | undefined) =>
  MANAGERS.includes((role || '').toUpperCase());

const UserDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const isManager = canManageCampaigns(user?.role);
  const canAssignCampaigns = isManager || hasPermission('campaigns:assign');

  const { data: userData, isLoading } = useQuery({
    queryKey: ['user', id],
    queryFn: () => api.get(`/users/${id}`).then((r) => r.data),
    retry: false,
  });
  const target: any = (userData as any)?.data;

  const { data: grantsData } = useQuery({
    queryKey: ['campaign-access', id],
    queryFn: () => api.get(`/campaign-access/user/${id}`).then((r) => r.data),
    enabled: !!id,
    retry: false,
  });
  const allGrants: any[] = (grantsData as any)?.data || [];

  const [tab, setTab] = useState<'details' | 'assignments' | 'campaigns'>('details');
  // Assignment flow: 1) branch → 2) ad account → 3) campaigns (Meta data).
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [selectedAdAccountId, setSelectedAdAccountId] = useState<string>('');
  // Checked campaigns with their OWN access level (per-campaign CRUD permission).
  const [selectedCampaigns, setSelectedCampaigns] = useState<Record<string, CampaignAccess>>({});
  const [expiresOn, setExpiresOn] = useState('');
  const [initializedFor, setInitializedFor] = useState('');
  // Active / inactive visibility + Meta-status filter.
  const [includeInactiveBranches, setIncludeInactiveBranches] = useState(false);
  const [includeInactiveAccounts, setIncludeInactiveAccounts] = useState(false);
  const [metaStatusFilter, setMetaStatusFilter] = useState<'ALL' | 'ACTIVE' | 'PAUSED'>('ALL');
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const memberBranchIds: string[] = useMemo(() => {
    if (!target) return [];
    const ids: string[] = [];
    if (Array.isArray(target.branchIds)) ids.push(...target.branchIds.map(String));
    if (Array.isArray(target.branches)) {
      for (const b of target.branches) {
        const bid = b.id || b._id;
        if (bid) ids.push(String(bid));
      }
    }
    if (target.branchId) ids.push(String(target.branchId));
    return [...new Set(ids)];
  }, [target]);

  const { data: branchesData } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get('/branches').then((r) => r.data),
    retry: false,
  });
  const branches: any[] = (branchesData as any)?.data || [];
  const memberBranches = branches.filter((b: any) => memberBranchIds.includes(String(b._id)));

  // Step 2 source: ad accounts visible inside the selected branch.
  const { data: adAccountsData, isLoading: adAccountsLoading } = useQuery({
    queryKey: ['campaign-access-branch-adaccounts', selectedBranchId],
    queryFn: () => api.get(`/campaign-access/branch/${selectedBranchId}/adaccounts`).then((r) => r.data),
    enabled: !!selectedBranchId && canAssignCampaigns,
    retry: false,
  });
  const branchAdAccounts: any[] = (adAccountsData as any)?.data || [];

  // Step 3 sources — docs (synced, grantable set) + live Meta campaigns
  // (every status: active, paused, inactive) per selected ad account.
  const campaignsUrl = selectedAdAccountId
    ? `/campaign-access/branch/${selectedBranchId}/campaigns?adAccountId=${encodeURIComponent(selectedAdAccountId)}`
    : `/campaign-access/branch/${selectedBranchId}/campaigns`;
  const { data: campaignsData, isLoading: campaignsLoading } = useQuery({
    queryKey: ['campaign-access-branch-campaigns', selectedBranchId, selectedAdAccountId || 'all'],
    queryFn: () => api.get(campaignsUrl).then((r) => r.data),
    enabled: !!selectedBranchId && canAssignCampaigns,
    retry: false,
  });
  const accountCampaigns: any[] = (campaignsData as any)?.data || [];
  const docIds = useMemo(() => new Set(accountCampaigns.map((d: any) => String(d.campaignId))), [accountCampaigns]);

  // Status-filtered branches / ad accounts (defined before the live query).
  const preVisibleBranches = memberBranches.filter((b: any) => includeInactiveBranches || isActiveRecord(b));
  const preVisibleAdAccounts = branchAdAccounts.filter((a: any) => includeInactiveAccounts || isActiveRecord(a));

  // Live campaigns (all Meta statuses) for the in-scope ad accounts.
  const liveScopeAccounts = selectedAdAccountId
    ? preVisibleAdAccounts.filter((a: any) => String(a._id) === String(selectedAdAccountId))
    : preVisibleAdAccounts;
  const { data: livePayload, isLoading: liveLoading } = useQuery({
    queryKey: ['adaccount-live-campaigns', selectedBranchId, selectedAdAccountId || 'all', liveScopeAccounts.map((a: any) => String(a._id)).join(',')],
    queryFn: async () => {
      const settled = await Promise.all(
        liveScopeAccounts.map(async (a: any) => {
          try {
            const r = await api.get(`/meta/adaccounts/${a._id}/overview?datePreset=maximum`);
            const list = (r.data as any)?.data?.campaigns || [];
            return {
              rows: list.map((c: any) => ({
                ...c,
                _accountId: String(a._id),
                _metaAdAccountId: a.metaAdAccountId ? String(a.metaAdAccountId) : undefined,
                _companyId: a.companyId ? String(a.companyId) : undefined,
              })),
              failed: false,
            };
          } catch {
            return { rows: [] as any[], failed: true };
          }
        }),
      );
      return { rows: settled.flatMap((s) => s.rows), liveFailed: settled.some((s) => s.failed) };
    },
    enabled: !!selectedBranchId && canAssignCampaigns && liveScopeAccounts.length > 0,
    retry: false,
  });
  const liveRows: any[] = (livePayload as any)?.rows || [];
  const liveFailed = !!(livePayload as any)?.liveFailed;

  // Union: live rows first (every status), docs fill gaps (offline/stale safety).
  const combinedRows = useMemo(() => {
    const byId = new Map<string, any>();
    for (const c of liveRows) {
      const cid = String((c as any).id ?? (c as any).campaignId);
      byId.set(cid, { ...c, id: cid, campaignId: cid });
    }
    for (const d of accountCampaigns) {
      const cid = String(d.campaignId);
      if (!byId.has(cid)) {
        byId.set(cid, {
          ...d,
          id: cid,
          campaignId: cid,
          _accountId: d.adAccountId ? String(d.adAccountId) : undefined,
          _metaAdAccountId: d.metaAdAccountId ? String(d.metaAdAccountId) : undefined,
        });
      }
    }
    return [...byId.values()];
  }, [liveRows, accountCampaigns]);

  // Visible branches / ad accounts / campaigns after status filters.
  const visibleBranches = preVisibleBranches;
  const visibleAdAccounts = preVisibleAdAccounts;
  const dataLoading = campaignsLoading || liveLoading;
  const visibleCampaigns = combinedRows.filter((c: any) => {
    if (metaStatusFilter === 'ALL') return true;
    const st = metaStatusOf(c);
    if (metaStatusFilter === 'ACTIVE') return st === 'ACTIVE' || st === '';
    return st === 'PAUSED';
  });

  // Preselect granted campaigns (keeping each grant's own access level).
  React.useEffect(() => {
    const key = `${id}:${selectedBranchId}:${selectedAdAccountId || 'all'}`;
    if (!selectedBranchId || initializedFor === key || dataLoading) return;
    const grantAccess = grantAccessMap(allGrants, selectedBranchId);
    const next: Record<string, CampaignAccess> = {};
    for (const c of visibleCampaigns) {
      const cid = String(c.campaignId);
      if (grantAccess.has(cid)) next[cid] = grantAccess.get(cid)!;
    }
    setSelectedCampaigns(next);
    const firstExpiry = allGrants.find(
      (x: any) => String(x.branchId) === String(selectedBranchId) && x.expiresAt,
    )?.expiresAt;
    setExpiresOn(firstExpiry ? String(firstExpiry).slice(0, 10) : '');
    setInitializedFor(key);
  }, [id, selectedBranchId, selectedAdAccountId, visibleCampaigns, allGrants, dataLoading, initializedFor]);

  const toggleCampaign = (campaignId: string) =>
    setSelectedCampaigns((prev) => {
      if (prev[campaignId]) {
        const { [campaignId]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [campaignId]: 'view' };
    });
  const setCampaignAccess = (campaignId: string, access: CampaignAccess) =>
    setSelectedCampaigns((prev) => ({ ...prev, [campaignId]: access }));

  // Grants outside the current view (other ad accounts / filtered-out rows) –
  // preserved on save because PUT replaces the whole branch.
  const keptOtherGrants = React.useMemo(() => {
    if (!selectedBranchId) return [];
    const visible = new Set(visibleCampaigns.map((c: any) => String(c.campaignId)));
    return (allGrants || [])
      .filter((g: any) => String(g.branchId) === String(selectedBranchId) && !visible.has(String(g.campaignId)))
      .map((g: any) => ({
        campaignId: String(g.campaignId),
        campaignName: g.campaignName,
        access: g.access === 'manage' ? 'manage' : 'view',
        expiresAt: g.expiresAt || undefined,
      }));
  }, [allGrants, selectedBranchId, visibleCampaigns]);

  const selectedEntries = Object.entries(selectedCampaigns);
  const manageCount = selectedEntries.filter(([, a]) => a === 'manage').length;

  const [provisioning, setProvisioning] = useState(false);

  const handleSaveCampaigns = async () => {
    if (!selectedBranchId) {
      toast.error('Branch Required', 'Select a branch first.');
      return;
    }
    setSaving(true);
    try {
      // Auto-sync docs for selected campaigns never synced before (paused /
      // inactive included) so the strict grant validation passes.
      const missing = selectedEntries.map(([cid]) => cid).filter((cid) => !docIds.has(cid));
      if (missing.length > 0) {
        setProvisioning(true);
        const rowById = new Map(visibleCampaigns.map((c: any) => [String(c.campaignId), c]));
        const { failed } = await ensureCampaignDocs(
          api,
          missing.map((cid) => {
            const row = rowById.get(cid) || {};
            return {
              campaignId: cid,
              name: row.name,
              adAccountId: row._accountId || (selectedAdAccountId || undefined),
              metaAdAccountId: row._metaAdAccountId,
            };
          }),
          { branchId: selectedBranchId, companyId: user?.companyId },
        );
        setProvisioning(false);
        if (failed.length > 0) {
          toast.error('Save Failed', `Could not sync ${failed.length} campaign(s): ${failed[0].error}`);
          return;
        }
        queryClient.invalidateQueries({ queryKey: ['campaign-access-branch-campaigns', selectedBranchId] });
      }
      const grants = mergeGrantsForSave(allGrants, selectedBranchId, visibleCampaigns, selectedCampaigns, expiresOn);
      const total = grants.length;
      await api.put(`/campaign-access/user/${id}`, {
        branchId: selectedBranchId,
        grants,
      });
      toast.success(
        'Campaigns Updated',
        total === 0
          ? 'All grants removed — full branch scope applies.'
          : `${total} campaign(s) granted in this branch (${manageCount} manage).`,
      );
      setInitializedFor('');
      queryClient.invalidateQueries({ queryKey: ['campaign-access', id] });
    } catch (err: any) {
      toast.error('Save Failed', err?.response?.data?.error || 'Could not save campaign grants.');
    } finally {
      setProvisioning(false);
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    try {
      await api.delete(`/users/${id}`);
      toast.success('Deactivated', `${target?.email} has been deactivated.`);
      navigate('/users');
    } catch (err: any) {
      toast.error('Failed', err?.response?.data?.error || 'Could not deactivate.');
    }
    setShowDeleteConfirm(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] gap-3">
        <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium text-slate-500">Loading user…</p>
      </div>
    );
  }

  if (!target) {
    return (
      <div className="max-w-2xl mx-auto mt-12 bg-white rounded-xl border border-rose-200 p-6">
        <h2 className="text-base font-bold text-slate-900">User Not Found</h2>
        <Link to="/users" className="text-sm font-semibold text-indigo-600 hover:underline mt-3 inline-block">← Back to Users</Link>
      </div>
    );
  }

  const fullName = `${target.firstName || ''} ${target.lastName || ''}`.trim() || target.email;
  const initials = fullName.split(' ').map((n: string) => n[0]).filter(Boolean).join('').toUpperCase().slice(0, 2) || 'U';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/users')}
            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-50 to-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-700 font-bold text-sm">
            {initials}
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">{fullName}</h1>
            <p className="text-xs text-slate-500">{target.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {target.isActive ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
              Inactive
            </span>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        {[
          { key: 'details', label: 'Details' },
          { key: 'assignments', label: `Assignments (${allGrants.length})` },
          { key: 'campaigns', label: 'Campaigns', disabled: !canAssignCampaigns },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => !t.disabled && setTab(t.key as any)}
            disabled={t.disabled}
            className={`px-4 py-2 rounded-md text-xs font-semibold transition-colors ${
              tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            } ${t.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Details Tab */}
      {tab === 'details' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="flex items-start gap-3">
              <Mail className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-slate-500">Email</p>
                <p className="font-medium text-slate-900">{target.email}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Shield className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-slate-500">Role</p>
                <p className="font-medium text-slate-900">
                  {target.roleId?.name || target.role?.replace(/_/g, ' ') || '—'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-slate-500">Branches</p>
                {memberBranches.length === 0 ? (
                  <p className="text-slate-400">No branch assigned</p>
                ) : (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {memberBranches.map((b: any) => (
                      <span key={b._id} className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {b.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Phone className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-slate-500">Phone</p>
                <p className="font-medium text-slate-900">{target.phone || '—'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Calendar className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-slate-500">Created</p>
                <p className="font-medium text-slate-900">{target.createdAt ? new Date(target.createdAt).toLocaleDateString() : '—'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Users className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-slate-500">Access ID</p>
                <p className="font-mono font-medium text-slate-900">{target.accessId || '—'}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assignments Tab */}
      {tab === 'assignments' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">Campaign Assignments ({allGrants.length})</h2>
            <p className="text-xs text-slate-500">Grants never widen branch membership — the person must belong to the branch first.</p>
          </div>
          {allGrants.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <AlertCircle className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">No campaign grants yet</p>
              <p className="text-xs mt-1">This user inherits the full branch scope.</p>
              {canAssignCampaigns && (
                <button
                  onClick={() => setTab('campaigns')}
                  className="mt-3 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  Assign campaigns →
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {allGrants.map((g: any, idx: number) => (
                <div key={`${g.campaignId}-${g.branchId}-${idx}`} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{g.campaignName || g.campaignId}</p>
                    <p className="text-xs text-slate-500">
                      {branches.find((b: any) => String(b._id) === String(g.branchId))?.name || 'Unknown Branch'} • {g.access}
                      {g.expiresAt && ` • expires ${new Date(g.expiresAt).toLocaleDateString()}`}
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${g.access === 'manage' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                    {g.access}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Campaigns Tab — Branch → Ad Account → Campaigns (Meta data) → per-campaign access */}
      {tab === 'campaigns' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="p-3 bg-indigo-50/70 border border-indigo-200/80 rounded-xl text-indigo-900 leading-relaxed">
            <p className="font-bold text-xs">Assign campaigns to {fullName}</p>
            <p className="text-[11px] mt-0.5">
              ① Pick a branch → ② pick an ad account → ③ check campaigns and set what this person may do on each one.
              Grants in other ad accounts are preserved. Only branch-level persons can assign campaigns.
            </p>
            <p className="text-[11px] mt-1 text-indigo-700">
              <strong>View</strong> = see campaigns, ads &amp; leads (read) · <strong>Manage</strong> = also assign branches &amp; import leads (full CRUD).
            </p>
          </div>

          {!canAssignCampaigns ? (
            <p className="text-center py-8 text-slate-400">Only managers can assign campaigns.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <CustomSelect
                    label="① Branch"
                    value={selectedBranchId}
                    onChange={(val) => {
                      setSelectedBranchId(val);
                      setSelectedAdAccountId('');
                      setSelectedCampaigns({});
                      setInitializedFor('');
                    }}
                    options={[
                      { value: '', label: 'Select a branch…' },
                      ...visibleBranches.map((b: any) => ({
                        value: String(b._id),
                        label: b.name,
                        subLabel: b.branchCode,
                        badge: isActiveRecord(b) ? 'Active' : 'Inactive',
                        badgeColor: isActiveRecord(b)
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-500 border border-slate-200',
                      })),
                    ]}
                    placeholder="Select branch…"
                  />
                  <div className="-mt-1.5 mb-1">
                    <Toggle
                      checked={includeInactiveBranches}
                      onChange={setIncludeInactiveBranches}
                      label={`Include inactive branches (${memberBranches.length - visibleBranches.length} hidden)`}
                      size="sm"
                    />
                  </div>
                </div>
                <div>
                  <CustomSelect
                    label="② Ad account"
                    value={selectedAdAccountId}
                    onChange={(val) => {
                      setSelectedAdAccountId(val);
                      setSelectedCampaigns({});
                      setInitializedFor('');
                    }}
                    options={[
                      { value: '', label: `All ad accounts (${visibleAdAccounts.reduce((n: number, a: any) => n + (a.campaignCount || 0), 0)} campaigns)` },
                      ...visibleAdAccounts.map((a: any) => ({
                        value: String(a._id),
                        label: `${a.name || a.metaAdAccountId} (${a.campaignCount || 0})`,
                        subLabel: a.metaAdAccountId,
                        badge: isActiveRecord(a) ? 'Active' : 'Inactive',
                        badgeColor: isActiveRecord(a)
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-500 border border-slate-200',
                      })),
                    ]}
                    placeholder={selectedBranchId ? 'Select ad account…' : 'Select a branch first…'}
                  />
                  <div className="-mt-1.5 mb-1">
                    <Toggle
                      checked={includeInactiveAccounts}
                      onChange={setIncludeInactiveAccounts}
                      label={`Include inactive ad accounts (${branchAdAccounts.length - visibleAdAccounts.length} hidden)`}
                      size="sm"
                    />
                  </div>
                </div>
              </div>

              {selectedBranchId && (
                <>
                  {adAccountsLoading ? (
                    <div className="flex items-center justify-center py-4 gap-2 text-slate-400 text-xs">
                      <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                      Loading ad accounts…
                    </div>
                  ) : branchAdAccounts.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 text-xs space-y-1">
                      <p className="font-semibold text-slate-600">No ad accounts in this branch yet</p>
                      <p>Assign ad accounts to the branch first (Ad Accounts page → Branch Assignment), then sync campaigns from Meta.</p>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">Expires on (optional)</label>
                          <input
                            type="date"
                            value={expiresOn}
                            onChange={(e) => setExpiresOn(e.target.value)}
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                        <div className="flex items-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const next: Record<string, CampaignAccess> = { ...selectedCampaigns };
                              visibleCampaigns.forEach((c: any) => {
                                const cid = String(c.campaignId);
                                if (!next[cid]) next[cid] = 'view';
                              });
                              setSelectedCampaigns(next);
                            }}
                            className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold"
                          >
                            Select all
                          </button>
                          <span className="text-slate-300">|</span>
                          <button
                            type="button"
                            onClick={() => setSelectedCampaigns({})}
                            className="text-[11px] text-slate-500 hover:text-slate-700 font-semibold"
                          >
                            Clear selection
                          </button>
                        </div>
                      </div>

                      {/* ③ Campaigns header with Meta-status filter */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-xs font-bold text-slate-700">
                          ③ Campaigns {selectedAdAccountId ? 'under this ad account' : 'in this branch'} ({visibleCampaigns.length})
                        </p>
                        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[11px] font-semibold">
                          {(['ALL', 'ACTIVE', 'PAUSED'] as const).map((st) => (
                            <button
                              key={st}
                              type="button"
                              onClick={() => setMetaStatusFilter(st)}
                              className={`px-2.5 py-1 rounded-md transition-all ${metaStatusFilter === st ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                            >
                              {st === 'ALL' ? 'All' : st.charAt(0) + st.slice(1).toLowerCase()}
                            </button>
                          ))}
                        </div>
                      </div>

                      {dataLoading ? (
                        <div className="flex items-center justify-center py-8 gap-2 text-slate-400">
                          <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                          Loading campaigns (live from Meta + synced)…
                        </div>
                      ) : combinedRows.length === 0 ? (
                        <div className="text-center py-8 text-slate-400 text-xs space-y-1">
                          <p className="font-semibold text-slate-600">No campaigns here yet</p>
                          <p>
                            {selectedAdAccountId
                              ? 'This ad account has no campaigns in Meta or none synced to the branch yet. Sync the ad account from Meta first (Ad Accounts → Sync from Meta).'
                              : 'No campaigns found in this branch yet. Sync ad accounts from Meta first (Ad Accounts → Sync from Meta).'}
                          </p>
                        </div>
                      ) : visibleCampaigns.length === 0 ? (
                        <p className="text-center py-8 text-slate-400 text-xs">No campaigns match the status filter. Try “All”.</p>
                      ) : (
                        <>
                          {liveFailed && (
                            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                              Live Meta fetch unavailable — showing synced campaigns. Paused campaigns not yet synced may be missing.
                            </p>
                          )}
                          <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
                          {visibleCampaigns.map((c: any) => {
                            const cid = String(c.campaignId);
                            const access = selectedCampaigns[cid];
                            const isChecked = !!access;
                            const metaStatus = metaStatusOf(c);
                            const willSync = !docIds.has(cid);
                            return (
                              <label key={cid} title={willSync ? 'Never synced before — it will be synced to the branch automatically on save.' : undefined} onClick={(e) => { if ((e.target as HTMLElement).closest('[data-nocheck]')) e.preventDefault(); }} className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${isChecked ? 'bg-indigo-50/80 border-indigo-200 shadow-2xs' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                                <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${isChecked ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}>
                                  {isChecked && (
                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                </span>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleCampaign(cid)}
                                  className="sr-only"
                                  aria-label={`Grant ${c.name || cid}`}
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-bold text-slate-800 truncate">{c.name || cid}</p>
                                  <p className="text-[10px] font-mono text-slate-400 truncate">
                                    {cid}
                                    {c.objective ? ` • ${c.objective}` : ''}
                                    {willSync ? ' • syncs on save' : ''}
                                  </p>
                                </div>
                                {metaStatus && (
                                  <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusPillClasses(metaStatus)}`}>
                                    {metaStatus}
                                  </span>
                                )}
                                {isChecked && (
                                  <span data-nocheck className="shrink-0 w-28 [&>div]:mb-0" title="What this person may do on this campaign: View (read) or Manage (full CRUD)">
                                    <CustomSelect
                                      value={access}
                                      onChange={(val) => setCampaignAccess(cid, val as CampaignAccess)}
                                      options={[
                                        { value: 'view', label: 'View' },
                                        { value: 'manage', label: 'Manage' },
                                      ]}
                                      compact
                                    />
                                  </span>
                                )}
                              </label>
                            );
                          })}
                          </div>
                        </>
                      )}

                      <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                        <p className="text-[11px] text-slate-500">
                          {provisioning
                            ? 'Syncing new campaigns to the branch…'
                            : selectedEntries.length === 0 && keptOtherGrants.length === 0
                              ? 'Nothing granted → full branch scope applies.'
                              : `${selectedEntries.length} in this view${manageCount > 0 ? ` (${manageCount} manage)` : ''}${keptOtherGrants.length > 0 ? ` + ${keptOtherGrants.length} kept in other ad accounts` : ''}.`}
                        </p>
                        <div className="flex items-center gap-2">
                          <Button variant="secondary" onClick={() => { setTab('assignments'); }} size="sm">Cancel</Button>
                          <Button onClick={handleSaveCampaigns} loading={saving || provisioning} size="sm" disabled={!selectedBranchId}>
                            Save grants
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-sm font-bold text-slate-900 mb-2">Deactivate User</h3>
            <p className="text-xs text-slate-600 mb-4">Are you sure you want to deactivate {target?.email}? They will no longer be able to log in.</p>
            <div className="flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)} size="sm">Cancel</Button>
              <Button variant="danger" onClick={handleDeactivate} size="sm">Deactivate</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserDetailPage;

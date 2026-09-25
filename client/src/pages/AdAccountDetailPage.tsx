import React, { useState, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import Toggle from '../components/common/Toggle';
import CustomSelect from '../components/common/CustomSelect';
import { useGet } from '../hooks/useApi';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
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
  Calendar,
  Filter,
  Search,
  ExternalLink,
  RefreshCw,
  TrendingUp,
  Users,
  DollarSign,
  Eye,
  MousePointer,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Copy,
  Check,
  Building2,
  Clock,
  Coins,
  Phone,
  Mail,
  Sparkles,
  Download,
  X,
  Globe,
  CheckCircle,
} from 'lucide-react';

const DATE_PRESETS = [
  { value: 'maximum', label: 'Lifetime / Maximum' },
  { value: 'last_90d', label: 'Last 90 Days' },
  { value: 'last_30d', label: 'Last 30 Days' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_7d', label: 'Last 7 Days' },
  { value: 'custom', label: 'Custom Range' },
];

function formatCurrency(amount: number | string | undefined, currency: string = 'INR'): string {
  if (amount == null || amount === '') return '—';
  const num = typeof amount === 'number' ? amount : parseFloat(amount);
  if (isNaN(num)) return String(amount);
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency || 'INR',
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    return `${currency} ${num.toFixed(2)}`;
  }
}

function formatNumber(val: number | string | undefined): string {
  if (val == null || val === '') return '0';
  const num = typeof val === 'number' ? val : parseFloat(val);
  if (isNaN(num)) return String(val);
  return new Intl.NumberFormat('en-IN').format(num);
}

const safeStr = (v: any): string => {
  if (v == null || v === '') return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return '—';
    return v.map((item) => safeStr(item)).filter(Boolean).join(', ');
  }
  if (typeof v === 'object') {
    if (v.value != null) return safeStr(v.value);
    if (v.text != null) return safeStr(v.text);
    if (v.message != null) return safeStr(v.message);
    if (v.name != null) return safeStr(v.name);
    if (v.body != null) return safeStr(v.body);
    try {
      return JSON.stringify(v);
    } catch {
      return '—';
    }
  }
  return String(v);
};

const AdAccountDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { user, hasPermission } = useAuth();
  const isManager = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER', 'BRANCH_MANAGER'].includes((user?.role || '').toUpperCase());
  const canAssign = isManager || hasPermission('campaigns:assign');

  const [datePreset, setDatePreset] = useState<string>('maximum');
  const [since, setSince] = useState<string>('');
  const [until, setUntil] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [openCampaign, setOpenCampaign] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const [showLivePreviewMap, setShowLivePreviewMap] = useState<Record<string, boolean>>({});

  // Campaign assignment modal state: ① user → ② branch → ③ campaigns of THIS ad account.
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [grantUserId, setGrantUserId] = useState<string>('');
  const [grantBranchId, setGrantBranchId] = useState<string>('');
  const [grantSelected, setGrantSelected] = useState<Record<string, CampaignAccess>>({});
  const [grantExpiresOn, setGrantExpiresOn] = useState('');
  const [grantInitialized, setGrantInitialized] = useState('');
  const [grantSaving, setGrantSaving] = useState(false);
  const [includeInactiveUsers, setIncludeInactiveUsers] = useState(false);
  const [includeInactiveBranches, setIncludeInactiveBranches] = useState(false);
  const [grantStatusFilter, setGrantStatusFilter] = useState<'ALL' | 'ACTIVE' | 'PAUSED'>('ALL');
  const [grantSearch, setGrantSearch] = useState('');

  // Tenant-scoped team list (branch managers see their own branch members).
  const { data: usersData, error: usersError } = useQuery({
    queryKey: ['users-for-campaign-assign'],
    queryFn: () => api.get('/users').then((r) => r.data),
    enabled: canAssign && showAssignModal,
    retry: false,
  });
  const teamUsers: any[] = (usersData as any)?.data || [];
  const visibleTeamUsers = teamUsers.filter((u: any) => includeInactiveUsers || isActiveRecord(u));

  // Leads Drawer State
  const [activeLeadsTarget, setActiveLeadsTarget] = useState<{
    type: 'campaign' | 'ad';
    id: string;
    title: string;
    campaignId?: string;
    campaignName?: string;
    adId?: string;
    adName?: string;
  } | null>(null);
  const [importingLeadId, setImportingLeadId] = useState<string | null>(null);
  const [leadSearch, setLeadSearch] = useState<string>('');

  // Overview query URL
  const queryUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (datePreset === 'custom' && since && until) {
      params.set('since', since);
      params.set('until', until);
    } else {
      params.set('datePreset', datePreset);
    }
    return `/meta/adaccounts/${id}/overview?${params.toString()}`;
  }, [id, datePreset, since, until]);

  const { data, isLoading, isFetching, error } = useGet(queryUrl);
  const overview = (data as any)?.data;
  const account = overview?.account;
  const allCampaigns: any[] = overview?.campaigns || [];
  const forms: any[] = overview?.forms || [];
  const recentLeads: any[] = overview?.recentLeads || [];
  const { data: branchesData } = useGet('/branches');
  const branches: any[] = (branchesData as any)?.data || [];
  const [assigningCampaign, setAssigningCampaign] = useState<Record<string, boolean>>({});

  // Target user's member branches (a grant requires branch membership).
  const grantTarget = teamUsers.find((u: any) => String(u._id) === String(grantUserId));
  const grantTargetBranchIds: string[] = useMemo(() => {
    if (!grantTarget) return [];
    const ids: string[] = [];
    if (Array.isArray(grantTarget.branchIds)) ids.push(...grantTarget.branchIds.map(String));
    if (Array.isArray(grantTarget.branches)) {
      for (const b of grantTarget.branches) {
        const bid = b.id || b._id;
        if (bid) ids.push(String(bid));
      }
    }
    if (grantTarget.branchId) ids.push(String(grantTarget.branchId));
    return [...new Set(ids)];
  }, [grantTarget]);
  const grantTargetBranches = branches.filter((b: any) => grantTargetBranchIds.includes(String(b._id)));
  const visibleGrantBranches = grantTargetBranches.filter((b: any) => includeInactiveBranches || isActiveRecord(b));

  // Target user's live grants (to preselect + merge on save).
  const { data: grantTargetGrantsData } = useQuery({
    queryKey: ['campaign-access', grantUserId],
    queryFn: () => api.get(`/campaign-access/user/${grantUserId}`).then((r) => r.data),
    enabled: canAssign && showAssignModal && !!grantUserId,
    retry: false,
  });
  const grantTargetGrants: any[] = (grantTargetGrantsData as any)?.data || [];

  // Synced docs of THIS ad account inside the chosen branch (grantable set).
  const grantDocsUrl =
    grantBranchId && account?.metaAdAccountId
      ? `/campaign-access/branch/${grantBranchId}/campaigns?metaAdAccountId=${encodeURIComponent(String(account.metaAdAccountId))}`
      : null;
  const { data: grantDocsData, isLoading: grantDocsLoading } = useQuery({
    queryKey: ['campaign-access-branch-campaigns', grantBranchId, `account:${account?.metaAdAccountId || 'none'}`],
    queryFn: () => (grantDocsUrl ? api.get(grantDocsUrl).then((r) => r.data) : Promise.resolve({ data: [] })),
    enabled: canAssign && showAssignModal && !!grantDocsUrl,
    retry: false,
  });
  const grantDocs: any[] = (grantDocsData as any)?.data || [];
  const grantDocIds = useMemo(() => new Set(grantDocs.map((d: any) => String(d.campaignId))), [grantDocs]);

  // Panel rows: this account's live campaigns, filtered + joined with docs.
  const grantRows = useMemo(() => {
    const q = grantSearch.trim().toLowerCase();
    return (allCampaigns || [])
      .filter((c: any) => {
        if (grantStatusFilter !== 'ALL') {
          const st = metaStatusOf(c);
          if (grantStatusFilter === 'ACTIVE' && !(st === 'ACTIVE' || st === '')) return false;
          if (grantStatusFilter === 'PAUSED' && st !== 'PAUSED') return false;
        }
        if (q) {
          const name = String(c.name || '').toLowerCase();
          if (!name.includes(q) && !String(c.id || '').toLowerCase().includes(q)) return false;
        }
        return true;
      })
      .map((c: any) => ({ ...c, hasDoc: grantDocIds.has(String(c.id)) }));
  }, [allCampaigns, grantStatusFilter, grantSearch, grantDocIds]);

  // Preselect the target's grants that are visible in this panel.
  React.useEffect(() => {
    const key = `${grantUserId}:${grantBranchId}`;
    if (!grantUserId || !grantBranchId || grantInitialized === key || grantDocsLoading) return;
    const accessMap = grantAccessMap(grantTargetGrants, grantBranchId);
    const visibleIds = new Set(grantRows.map((c: any) => String(c.id)));
    const next: Record<string, CampaignAccess> = {};
    for (const [cid, access] of accessMap) {
      if (visibleIds.has(cid)) next[cid] = access;
    }
    setGrantSelected(next);
    const firstExpiry = grantTargetGrants.find(
      (x: any) => String(x.branchId) === String(grantBranchId) && x.expiresAt,
    )?.expiresAt;
    setGrantExpiresOn(firstExpiry ? String(firstExpiry).slice(0, 10) : '');
    setGrantInitialized(key);
  }, [grantUserId, grantBranchId, grantRows, grantTargetGrants, grantDocsLoading, grantInitialized]);

  const grantSelectedEntries = Object.entries(grantSelected);
  const grantManageCount = grantSelectedEntries.filter(([, a]) => a === 'manage').length;

  const toggleGrantCampaign = (campaignId: string) =>
    setGrantSelected((prev) => {
      if (prev[campaignId]) {
        const { [campaignId]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [campaignId]: 'view' };
    });
  const setGrantCampaignAccess = (campaignId: string, access: CampaignAccess) =>
    setGrantSelected((prev) => ({ ...prev, [campaignId]: access }));

  const handleAssignCampaignBranch = async (campaignId: string, branchId: string, campaignName?: string) => {
    setAssigningCampaign((prev) => ({ ...prev, [campaignId]: true }));
    try {
      await api.patch(`/meta/campaigns/${campaignId}/assign`, {
        branchId: branchId || null,
        name: campaignName,
        adAccountId: account?._id,
        metaAdAccountId: account?.metaAdAccountId,
        companyId: account?.companyId,
      });
      toast.success('Campaign Branch Updated');
      queryClient.invalidateQueries({ queryKey: [queryUrl] });
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to update campaign branch');
    } finally {
      setAssigningCampaign((prev) => ({ ...prev, [campaignId]: false }));
    }
  };

  const handleGrantSave = async () => {
    if (!grantBranchId || !grantUserId) {
      toast.error('Select a user, a branch, and at least one campaign.');
      return;
    }
    setGrantSaving(true);
    try {
      // Auto-provision docs for selected campaigns that were never
      // branch-synced (paused / inactive included) so grant validation passes.
      const missing = grantSelectedEntries
        .map(([cid]) => cid)
        .filter((cid) => !grantDocIds.has(cid));
      if (missing.length > 0) {
        setProvisioning(true);
        const liveById = new Map((allCampaigns || []).map((c: any) => [String(c.id), c]));
        const { failed } = await ensureCampaignDocs(
          api,
          missing.map((cid) => ({
            campaignId: cid,
            name: liveById.get(cid)?.name,
            adAccountId: account?._id ? String(account._id) : undefined,
            metaAdAccountId: account?.metaAdAccountId ? String(account.metaAdAccountId) : undefined,
          })),
          { branchId: grantBranchId, companyId: user?.companyId },
        );
        setProvisioning(false);
        if (failed.length > 0) {
          toast.error(`Could not sync ${failed.length} campaign(s): ${failed[0].error}`);
          return;
        }
        queryClient.invalidateQueries({ queryKey: ['campaign-access-branch-campaigns', grantBranchId] });
      }
      const visibleDocs = grantDocs
        .filter((d: any) => grantRows.some((c: any) => String(c.id) === String(d.campaignId)))
        .map((d: any) => {
          const live = (allCampaigns || []).find((c: any) => String(c.id) === String(d.campaignId));
          return { campaignId: String(d.campaignId), name: live?.name || d.name };
        });
      // Freshly provisioned docs join the visible set for the merge.
      for (const cid of missing) {
        if (!visibleDocs.some((v) => v.campaignId === cid)) {
          const live = (allCampaigns || []).find((c: any) => String(c.id) === cid);
          visibleDocs.push({ campaignId: cid, name: live?.name });
        }
      }
      const grants = mergeGrantsForSave(grantTargetGrants, grantBranchId, visibleDocs, grantSelected, grantExpiresOn);
      await api.put(`/campaign-access/user/${grantUserId}`, {
        branchId: grantBranchId,
        grants,
      });
      toast.success(
        grants.length === 0
          ? 'All grants removed — full branch scope applies.'
          : `${grants.length} campaign(s) granted in this branch (${grantManageCount} manage).`,
      );
      setGrantInitialized('');
      setShowAssignModal(false);
      queryClient.invalidateQueries({ queryKey: ['campaign-access', grantUserId] });
      queryClient.invalidateQueries({ queryKey: ['campaign-access-branch-campaigns', grantBranchId] });
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Could not assign campaigns.');
    } finally {
      setProvisioning(false);
      setGrantSaving(false);
    }
  };

  const currency = account?.currency || 'INR';

  // Fetch ads for expanded campaign
  const adsQueryUrl = useMemo(() => {
    if (!openCampaign) return null;
    const params = new URLSearchParams();
    params.set('campaignId', openCampaign);
    if (account?.companyId) {
      params.set('companyId', String(account.companyId));
    }
    if (datePreset === 'custom' && since && until) {
      params.set('since', since);
      params.set('until', until);
    } else {
      params.set('datePreset', datePreset);
    }
    return `/meta/campaigns/ads?${params.toString()}`;
  }, [openCampaign, account?.companyId, datePreset, since, until]);

  const { data: adsData, isFetching: adsLoading } = useQuery({
    queryKey: ['campaign-ads', adsQueryUrl],
    queryFn: () => (adsQueryUrl ? api.get(adsQueryUrl).then((r) => r.data) : null),
    enabled: !!adsQueryUrl,
    retry: false,
  });

  const ads = (adsData as any)?.data || [];

  // Query leads for active target (campaign or ad)
  const leadsQueryUrl = useMemo(() => {
    if (!activeLeadsTarget) return null;
    const companyParam = account?.companyId ? `companyId=${encodeURIComponent(String(account.companyId))}` : '';
    if (activeLeadsTarget.type === 'campaign') {
      return `/meta/campaigns/leads?campaignId=${encodeURIComponent(activeLeadsTarget.id)}&${companyParam}`;
    }
    const adCampaign = activeLeadsTarget.campaignId
      ? `campaignId=${encodeURIComponent(activeLeadsTarget.campaignId)}&`
      : '';
    return `/meta/ads/${encodeURIComponent(activeLeadsTarget.id)}/leads?${adCampaign}${companyParam}`;
  }, [activeLeadsTarget, account?.companyId]);

  const { data: leadsData, isFetching: leadsLoading, refetch: refetchLeads } = useQuery({
    queryKey: ['meta-leads', leadsQueryUrl],
    queryFn: () => (leadsQueryUrl ? api.get(leadsQueryUrl).then((r) => r.data) : null),
    enabled: !!leadsQueryUrl,
    retry: false,
  });

  const rawLeads: any[] = (leadsData as any)?.data || [];

  // Filter leads in drawer
  const filteredDrawerLeads = useMemo(() => {
    if (!leadSearch.trim()) return rawLeads;
    const q = leadSearch.toLowerCase();
    return rawLeads.filter((l: any) => {
      const name = String(l.name || '').toLowerCase();
      const phone = String(l.phone || '').toLowerCase();
      const email = String(l.email || '').toLowerCase();
      const company = String(l.company || '').toLowerCase();
      return name.includes(q) || phone.includes(q) || email.includes(q) || company.includes(q);
    });
  }, [rawLeads, leadSearch]);

  // Import lead into CRM with tags and metadata
  const handleImportLead = async (leadId: string, leadObj?: any) => {
    setImportingLeadId(leadId);
    try {
      const res = await api.post('/meta/leads/import-crm', {
        leadId,
        companyId: account?.companyId,
        campaignId: activeLeadsTarget?.campaignId,
        campaignName: activeLeadsTarget?.campaignName,
        adId: activeLeadsTarget?.adId || leadObj?.adId,
        adName: activeLeadsTarget?.adName || leadObj?.adName,
        formId: leadObj?.formId,
        tags: [
          'Meta Ads',
          'Facebook Lead',
          activeLeadsTarget?.campaignName ? `Campaign: ${activeLeadsTarget.campaignName}` : null,
          (activeLeadsTarget?.adName || leadObj?.adName) ? `Ad: ${activeLeadsTarget?.adName || leadObj?.adName}` : null,
        ].filter(Boolean),
      });
      if (res.data?.success) {
        toast.success('Lead Synced to CRM with Meta Ads Tags', { id: `lead-${leadId}` });
        refetchLeads();
        queryClient.invalidateQueries({ queryKey: [queryUrl] });
        queryClient.invalidateQueries({ queryKey: ['leads'] });
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to import lead to CRM');
    } finally {
      setImportingLeadId(null);
    }
  };

  // Export drawer leads to CSV
  const exportLeadsCsv = () => {
    if (!filteredDrawerLeads.length) return;
    const headers = ['Lead ID', 'Name', 'Phone', 'Email', 'Company', 'Ad Name', 'Form ID', 'Date'];
    const rows = filteredDrawerLeads.map((l: any) => [
      l.id,
      `"${(l.name || '').replace(/"/g, '""')}"`,
      `"${l.phone || ''}"`,
      `"${l.email || ''}"`,
      `"${(l.company || '').replace(/"/g, '""')}"`,
      `"${(l.adName || '').replace(/"/g, '""')}"`,
      `"${l.formId || ''}"`,
      `"${new Date(l.createdTime).toLocaleString()}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `meta-leads-${activeLeadsTarget?.id || 'export'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter & Search Campaigns
  const filteredCampaigns = useMemo(() => {
    return allCampaigns.filter((c: any) => {
      const effStatus = String(c.effectiveStatus || c.status || '').toUpperCase();
      if (statusFilter !== 'ALL' && effStatus !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const nameMatch = String(c.name || '').toLowerCase().includes(query);
        const objMatch = String(c.objective || '').toLowerCase().includes(query);
        return nameMatch || objMatch;
      }
      return true;
    });
  }, [allCampaigns, statusFilter, searchQuery]);

  // Totals across filtered campaigns
  const totals = useMemo(() => {
    let spend = 0;
    let reach = 0;
    let impressions = 0;
    let leads = 0;
    let clicks = 0;

    for (const c of filteredCampaigns) {
      const s = parseFloat(c.metrics?.spend || '0');
      const r = parseInt(c.metrics?.reach || '0', 10);
      const imp = parseInt(c.metrics?.impressions || '0', 10);
      const l = parseInt(c.metrics?.leads || '0', 10);
      const clk = parseInt(c.metrics?.inlineLinkClicks || '0', 10);

      if (!isNaN(s)) spend += s;
      if (!isNaN(r)) reach += r;
      if (!isNaN(imp)) impressions += imp;
      if (!isNaN(l)) leads += l;
      if (!isNaN(clk)) clicks += clk;
    }

    const cpl = leads > 0 ? spend / leads : 0;
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

    return { spend, reach, impressions, leads, clicks, cpl, ctr };
  }, [filteredCampaigns]);

  // Status counts
  const statusCounts = useMemo(() => {
    const counts = { ALL: allCampaigns.length, ACTIVE: 0, PAUSED: 0, ARCHIVED: 0 };
    for (const c of allCampaigns) {
      const st = String(c.effectiveStatus || c.status || '').toUpperCase();
      if (st === 'ACTIVE') counts.ACTIVE++;
      else if (st === 'PAUSED') counts.PAUSED++;
      else if (st === 'ARCHIVED') counts.ARCHIVED++;
    }
    return counts;
  }, [allCampaigns]);

  const copyAccountId = () => {
    if (account?.metaAdAccountId) {
      navigator.clipboard.writeText(account.metaAdAccountId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: [queryUrl] });
  };

  const toggleLivePreview = (adId: string) => {
    setShowLivePreviewMap((prev) => ({ ...prev, [adId]: !prev[adId] }));
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium text-slate-500">Loading ad account & campaign intelligence…</p>
      </div>
    );
  }

  if (error || !overview) {
    const errMessage =
      (error as any)?.response?.data?.error || (error as any)?.message || 'Ad account not found or access denied.';
    return (
      <div className="max-w-2xl mx-auto mt-12 bg-white rounded-xl border border-rose-200 p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
            <span className="font-bold text-lg">!</span>
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Unable to load Ad Account</h2>
            <p className="text-sm text-rose-700 mt-1 font-mono text-xs bg-rose-50 p-2.5 rounded-lg border border-rose-100">
              {errMessage}
            </p>
            <div className="mt-4 flex items-center gap-3">
              <Link to="/ad-accounts" className="text-sm font-semibold text-slate-600 hover:text-slate-900 underline">
                ← Return to Ad Accounts
              </Link>
              <Button size="sm" onClick={handleRefresh}>
                Retry Fetch
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Link to="/ad-accounts" className="hover:text-blue-600 transition-colors">
              Ad Accounts
            </Link>
            <span>/</span>
            <span className="text-slate-800 font-bold">{account.name || account.metaAdAccountId}</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">{account.name || 'Ad Account'}</h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Connected
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={copyAccountId}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
            title="Click to copy account ID"
          >
            {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="font-mono">{account.metaAdAccountId}</span>
          </button>

          <Button variant="secondary" size="sm" onClick={handleRefresh} loading={isFetching}>
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <a
            href={`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${account.metaAdAccountId.replace(
              'act_',
              '',
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Meta Ads Manager
          </a>
        </div>
      </div>

      {/* Account Info Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Coins className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Currency</p>
            <p className="text-sm font-bold text-slate-900">{currency}</p>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Timezone</p>
            <p className="text-sm font-bold text-slate-900">{account.timezone || 'UTC'}</p>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Building2 className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Portfolio / Business</p>
            <p className="text-sm font-bold text-slate-900 truncate max-w-[140px]">{account.businessName || 'Personal'}</p>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <DollarSign className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Historical Spend</p>
            <p className="text-sm font-bold text-slate-900">
              {formatCurrency(
                account.amountSpent ? Number(account.amountSpent) / 100 : account.amountSpent,
                currency,
              )}
            </p>
          </div>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-4 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-blue-100 text-xs font-medium">
            <span>Total Spend</span>
            <DollarSign className="w-4 h-4 opacity-80" />
          </div>
          <p className="text-lg md:text-xl font-black mt-2 tracking-tight">{formatCurrency(totals.spend, currency)}</p>
          <span className="text-[11px] text-blue-100 mt-1 block">Selected period</span>
        </div>

        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white p-4 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-emerald-100 text-xs font-medium">
            <span>Total Leads</span>
            <Users className="w-4 h-4 opacity-80" />
          </div>
          <p className="text-lg md:text-xl font-black mt-2 tracking-tight">{formatNumber(totals.leads)}</p>
          <span className="text-[11px] text-emerald-100 mt-1 block">Leads generated</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Avg. Cost / Lead</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-lg md:text-xl font-black text-slate-900 mt-2 tracking-tight">
            {totals.leads > 0 ? formatCurrency(totals.cpl, currency) : '—'}
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">Cost per acquisition</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Reach</span>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-lg md:text-xl font-black text-slate-900 mt-2 tracking-tight">
            {formatNumber(totals.reach)}
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">Unique accounts reached</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Impressions</span>
            <Eye className="w-4 h-4 text-purple-600" />
          </div>
          <p className="text-lg md:text-xl font-black text-slate-900 mt-2 tracking-tight">
            {formatNumber(totals.impressions)}
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">Ad impressions</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Link Clicks (CTR)</span>
            <MousePointer className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-lg md:text-xl font-black text-slate-900 mt-2 tracking-tight">
            {formatNumber(totals.clicks)}{' '}
            <span className="text-xs font-semibold text-slate-500 font-normal">({totals.ctr.toFixed(2)}%)</span>
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">Inline link clicks</span>
        </div>
      </div>

      {/* Filter and Time-range Controls */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-semibold">
            {(['ALL', 'ACTIVE', 'PAUSED', 'ARCHIVED'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-md transition-all ${
                  statusFilter === st
                    ? 'bg-white text-slate-900 shadow-sm font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st === 'ALL' ? 'All Campaigns' : st.charAt(0) + st.slice(1).toLowerCase()}
                <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 text-slate-700">
                  {statusCounts[st]}
                </span>
              </button>
            ))}
          </div>

          {/* Time Filter Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 min-w-[220px]">
              <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <div className="flex-1 min-w-0 [&>div]:mb-0">
                <CustomSelect
                  value={datePreset}
                  onChange={(val) => setDatePreset(val)}
                  options={DATE_PRESETS.map((p) => ({ value: p.value, label: p.label }))}
                  compact
                />
              </div>
            </div>

            {datePreset === 'custom' && (
              <div className="flex items-center gap-1.5 text-xs">
                <input
                  type="date"
                  value={since}
                  onChange={(e) => setSince(e.target.value)}
                  className="border border-slate-200 rounded-lg px-2 py-1 text-slate-700 bg-white"
                />
                <span className="text-slate-400">to</span>
                <input
                  type="date"
                  value={until}
                  onChange={(e) => setUntil(e.target.value)}
                  className="border border-slate-200 rounded-lg px-2 py-1 text-slate-700 bg-white"
                />
              </div>
            )}
          </div>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search campaigns by name or objective…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-blue-500 transition-colors"
          />
        </div>
      </div>

      {/* Campaign Assignment Modal — ① user → ② branch → ③ this account's campaigns */}
      {canAssign && showAssignModal && (
        <Modal
          isOpen
          onClose={() => setShowAssignModal(false)}
          title={`Assign campaigns — ${account?.name || account?.metaAdAccountId || 'Ad account'}`}
          size="xl"
        >
          <div className="space-y-4">
            <div className="p-3 bg-indigo-50/70 border border-indigo-200/80 rounded-xl text-indigo-900 leading-relaxed text-xs">
              <p className="font-bold">① Pick a person → ② pick one of their branches → ③ check campaigns</p>
              <p className="text-[11px] mt-0.5">
                Every campaign of this account is listed — <strong>active, paused and inactive</strong>.
                Campaigns never synced before are auto-synced to the branch on save.
                Each checked campaign gets its own access: <strong>View</strong> (read) or <strong>Manage</strong> (full CRUD).
              </p>
            </div>
              {usersError ? (
                <p className="text-center py-6 text-xs text-rose-500">
                  Could not load the team list (missing users:read permission). Ask an administrator for access.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <CustomSelect
                        label="① Person"
                        value={grantUserId}
                        onChange={(val) => {
                          setGrantUserId(val);
                          setGrantBranchId('');
                          setGrantSelected({});
                          setGrantInitialized('');
                        }}
                        options={visibleTeamUsers.map((u: any) => ({
                          value: String(u._id),
                          label: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email,
                          subLabel: u.email,
                          badge: isActiveRecord(u) ? 'Active' : 'Inactive',
                          badgeColor: isActiveRecord(u)
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-500 border border-slate-200',
                        }))}
                        placeholder="Select person…"
                        searchable
                      />
                      <div className="-mt-1.5 mb-1">
                        <Toggle
                          checked={includeInactiveUsers}
                          onChange={setIncludeInactiveUsers}
                          label={`Include inactive users (${teamUsers.length - visibleTeamUsers.length} hidden)`}
                          size="sm"
                        />
                      </div>
                    </div>
                    <div>
                      <CustomSelect
                        label="② Branch (person must belong to it)"
                        value={grantBranchId}
                        onChange={(val) => {
                          setGrantBranchId(val);
                          setGrantSelected({});
                          setGrantInitialized('');
                        }}
                        options={visibleGrantBranches.map((b: any) => ({
                          value: String(b._id),
                          label: b.name,
                          subLabel: b.branchCode,
                          badge: isActiveRecord(b) ? 'Active' : 'Inactive',
                          badgeColor: isActiveRecord(b)
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-500 border border-slate-200',
                        }))}
                        placeholder={grantUserId ? 'Select branch…' : 'Select a person first…'}
                      />
                      <div className="-mt-1.5 mb-1">
                        <Toggle
                          checked={includeInactiveBranches}
                          onChange={setIncludeInactiveBranches}
                          label={`Include inactive branches (${grantTargetBranches.length - visibleGrantBranches.length} hidden)`}
                          size="sm"
                        />
                      </div>
                    </div>
                  </div>

                  {grantUserId && grantBranchId && (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            placeholder="Search campaigns in this account…"
                            value={grantSearch}
                            onChange={(e) => setGrantSearch(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-indigo-500 transition-colors"
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[11px] font-semibold">
                            {(['ALL', 'ACTIVE', 'PAUSED'] as const).map((st) => (
                              <button
                                key={st}
                                type="button"
                                onClick={() => setGrantStatusFilter(st)}
                                className={`px-2.5 py-1 rounded-md transition-all ${grantStatusFilter === st ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                              >
                                {st === 'ALL' ? 'All' : st.charAt(0) + st.slice(1).toLowerCase()}
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const next: Record<string, CampaignAccess> = { ...grantSelected };
                                grantRows.forEach((c: any) => {
                                  const cid = String(c.id);
                                  if (c.hasDoc && !next[cid]) next[cid] = 'view';
                                });
                                setGrantSelected(next);
                              }}
                              className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold"
                            >
                              Select all
                            </button>
                            <span className="text-slate-300">|</span>
                            <button
                              type="button"
                              onClick={() => setGrantSelected({})}
                              className="text-[11px] text-slate-500 hover:text-slate-700 font-semibold"
                            >
                              Clear
                            </button>
                          </div>
                        </div>
                      </div>

                      {grantDocsLoading ? (
                        <div className="flex items-center justify-center py-8 gap-2 text-slate-400 text-xs">
                          <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                          Loading synced campaigns…
                        </div>
                      ) : grantRows.length === 0 ? (
                        <p className="text-center py-6 text-slate-400 text-xs">No campaigns in this account match the filters.</p>
                      ) : (
                        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                          {grantRows.map((c: any) => {
                            const cid = String(c.id);
                            const access = grantSelected[cid];
                            const isChecked = !!access;
                            const metaStatus = metaStatusOf(c);
                            const willSync = !c.hasDoc;
                            return (
                              <label
                                key={cid}
                                title={willSync ? 'Never synced before — it will be synced to the branch automatically on save.' : undefined}
                                onClick={(e) => {
                                  if ((e.target as HTMLElement).closest('[data-nocheck]')) e.preventDefault();
                                }}
                                className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer ${isChecked ? 'bg-indigo-50/80 border-indigo-200 shadow-2xs' : 'bg-white border-slate-200 hover:bg-slate-50'}`}
                              >
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
                                  onChange={() => toggleGrantCampaign(cid)}
                                  className="sr-only"
                                  aria-label={`Grant ${safeStr(c.name)}`}
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-bold text-slate-800 truncate">{safeStr(c.name)}</p>
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
                                  <span data-nocheck className="shrink-0 w-28 [&>div]:mb-0" title="View (read) or Manage (full CRUD) on this campaign">
                                    <CustomSelect
                                      value={access}
                                      onChange={(val) => setGrantCampaignAccess(cid, val as CampaignAccess)}
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
                      )}

                      <div className="text-[11px] text-slate-500">
                        <p className="font-semibold text-slate-700">Expires on (optional)</p>
                        <input
                          type="date"
                          value={grantExpiresOn}
                          onChange={(e) => setGrantExpiresOn(e.target.value)}
                          className="mt-1 px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                    </>
                  )}
                </>
              )}

            <div className="flex items-center justify-between gap-2 pt-4 border-t border-slate-200">
              <p className="text-[11px] text-slate-500">
                {provisioning
                  ? 'Syncing new campaigns to the branch…'
                  : grantSelectedEntries.length === 0
                    ? 'Nothing checked in this view.'
                    : `${grantSelectedEntries.length} selected${grantManageCount > 0 ? ` (${grantManageCount} manage)` : ''}.`}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => setShowAssignModal(false)} size="sm">
                  Cancel
                </Button>
                <Button onClick={handleGrantSave} loading={grantSaving || provisioning} size="sm">
                  Save grants
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Campaigns Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Campaigns ({filteredCampaigns.length})</h2>
            <p className="text-xs text-slate-500">
              Showing performance metrics for{' '}
              {datePreset === 'custom' ? `${since} to ${until}` : DATE_PRESETS.find((p) => p.value === datePreset)?.label}
            </p>
            {allCampaigns.some((c: any) => c.grantNarrowed) && (
              <p className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200">
                🔒 Restricted to your granted campaigns — other branch campaigns are hidden.
              </p>
            )}
          </div>
          {canAssign && (
            <Button size="sm" onClick={() => setShowAssignModal(true)} className="shrink-0">
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                Assign campaigns
              </span>
            </Button>
          )}
        </div>

        {filteredCampaigns.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Filter className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-semibold text-slate-700">No campaigns match your filter</p>
            <p className="text-xs text-slate-400 mt-1">Try changing the status tab or selecting a broader time period.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Campaign</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Branch</th>
                  <th className="py-3 px-3">Spend</th>
                  <th className="py-3 px-3">Reach</th>
                  <th className="py-3 px-3">Impressions</th>
                  <th className="py-3 px-3">Leads</th>
                  <th className="py-3 px-3">Cost / Lead</th>
                  <th className="py-3 px-3">Clicks</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredCampaigns.map((c: any) => {
                  const status = String(c.effectiveStatus || c.status || '').toUpperCase();
                  const isExpanded = openCampaign === c.id;
                  const cLeads = parseInt(c.metrics?.leads || '0', 10);
                  const cSpend = parseFloat(c.metrics?.spend || '0');
                  const cpl = cLeads > 0 && !isNaN(cSpend) ? cSpend / cLeads : null;

                  return (
                    <React.Fragment key={c.id}>
                      <tr className={`hover:bg-slate-50/75 transition-colors ${isExpanded ? 'bg-blue-50/20' : ''}`}>
                        <td className="py-3.5 px-4 font-semibold text-slate-900 max-w-xs">
                          <div className="flex flex-col">
                            <span className="truncate">{safeStr(c.name)}</span>
                            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider font-normal mt-0.5">
                              {safeStr(c.objective)}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              status === 'ACTIVE'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : status === 'PAUSED'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}
                          >
                            {status}
                          </span>
                        </td>
                        <td className="py-3.5 px-3">
                          <div className="w-44">
                            <CustomSelect
                              value={c.branchId || ''}
                              placeholder="Select branch..."
                              options={[
                                { value: '', label: 'Inherit Account Branch' },
                                ...branches.map((b: any) => ({ value: b._id, label: b.name })),
                              ]}
                              onChange={(val) => handleAssignCampaignBranch(c.id, val, c.name)}
                              disabled={assigningCampaign[c.id]}
                              compact
                            />
                          </div>
                        </td>
                        <td className="py-3.5 px-3 font-semibold text-slate-900 font-mono">
                          {formatCurrency(c.metrics?.spend, currency)}
                        </td>
                        <td className="py-3.5 px-3 text-slate-700 font-mono">{formatNumber(c.metrics?.reach)}</td>
                        <td className="py-3.5 px-3 text-slate-700 font-mono">{formatNumber(c.metrics?.impressions)}</td>
                        <td className="py-3.5 px-3">
                          {cLeads > 0 ? (
                            <button
                              onClick={() =>
                                setActiveLeadsTarget({
                                  type: 'campaign',
                                  id: c.id,
                                  campaignId: c.id,
                                  campaignName: c.name,
                                  title: `Campaign: ${c.name}`,
                                })
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-bold font-mono text-xs bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition-colors shadow-2xs"
                              title="Click to view all lead details for this campaign"
                            >
                              <Users className="w-3 h-3 text-emerald-700" />
                              {formatNumber(c.metrics?.leads)} Leads
                            </button>
                          ) : (
                            <span className="text-slate-400 font-mono text-xs">0</span>
                          )}
                        </td>
                        <td className="py-3.5 px-3 font-mono text-slate-600">
                          {cpl != null ? formatCurrency(cpl, currency) : '—'}
                        </td>
                        <td className="py-3.5 px-3 text-slate-700 font-mono">
                          {formatNumber(c.metrics?.inlineLinkClicks)}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {cLeads > 0 && (
                              <button
                                onClick={() =>
                                  setActiveLeadsTarget({
                                    type: 'campaign',
                                    id: c.id,
                                    campaignId: c.id,
                                    campaignName: c.name,
                                    title: `Campaign: ${c.name}`,
                                  })
                                }
                                className="px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors flex items-center gap-1"
                              >
                                <Users className="w-3.5 h-3.5" />
                                Leads ({cLeads})
                              </button>
                            )}
                            <Button
                              variant={isExpanded ? 'primary' : 'secondary'}
                              size="sm"
                              onClick={() => setOpenCampaign(isExpanded ? null : c.id)}
                              className="text-xs py-1"
                            >
                              {isExpanded ? (
                                <span className="flex items-center gap-1">
                                  Hide <ChevronUp className="w-3.5 h-3.5" />
                                </span>
                              ) : (
                                <span className="flex items-center gap-1">
                                  View Ads <ChevronDown className="w-3.5 h-3.5" />
                                </span>
                              )}
                            </Button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Ads Drawer */}
                      {isExpanded && (
                        <tr className="bg-slate-50/70 border-b border-slate-200">
                          <td colSpan={10} className="p-4">
                            <div className="space-y-4">
                              <div className="flex items-center justify-between">
                                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                                  <span>Ads in Campaign:</span>
                                  <span className="font-normal text-slate-600 normal-case">{c.name}</span>
                                </h3>
                                <span className="text-[11px] text-slate-500">
                                  {adsLoading ? 'Loading ads…' : `${ads.length} ad(s) found`}
                                </span>
                              </div>

                              {adsLoading ? (
                                <div className="flex items-center justify-center py-8 gap-2 text-slate-500 text-xs">
                                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                                  Fetching ad creatives and performance insights from Meta…
                                </div>
                              ) : ads.length === 0 ? (
                                <div className="text-center py-6 text-slate-400 text-xs">
                                  No individual ads found under this campaign.
                                </div>
                              ) : (
                                <div className="space-y-6">
                                  {ads.map((a: any) => {
                                    const adStatus = String(a.effectiveStatus || a.status || '').toUpperCase();
                                    const adLeads = parseInt(a.metrics?.leads || '0', 10);
                                    const isLivePreviewOpen = showLivePreviewMap[a.id];
                                    const ctaText = (a.callToAction || 'APPLY_NOW').replace(/_/g, ' ');

                                    return (
                                      <div
                                        key={a.id}
                                        className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4"
                                      >
                                          {/* Ad Header Bar */}
                                          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                                            <div>
                                              <h4 className="text-sm font-extrabold text-slate-900">{safeStr(a.name)}</h4>
                                              <p className="text-[11px] text-slate-400 font-mono mt-0.5">Ad ID: {a.id}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <span
                                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                                  adStatus === 'ACTIVE'
                                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                                                }`}
                                              >
                                                {adStatus}
                                              </span>
                                              {adLeads > 0 && (
                                                <button
                                                  onClick={() =>
                                                    setActiveLeadsTarget({
                                                      type: 'ad',
                                                      id: a.id,
                                                      campaignId: c.id,
                                                      campaignName: c.name,
                                                      adId: a.id,
                                                      adName: a.name,
                                                      title: `${a.name} (${c.name})`,
                                                    })
                                                  }
                                                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-2xs"
                                                >
                                                  <Users className="w-3.5 h-3.5" />
                                                  {adLeads} Leads
                                                </button>
                                              )}
                                            </div>
                                          </div>

                                          {/* Responsive 2-Column Grid */}
                                          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                                            {/* Left Column: Native Facebook Feed Card Mockup */}
                                            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                                              {/* FB Post Header */}
                                              <div className="p-3 flex items-center justify-between border-b border-slate-100 bg-slate-50/70">
                                                <div className="flex items-center gap-2.5">
                                                  <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-black flex items-center justify-center text-xs shrink-0 shadow-2xs">
                                                    {account.name ? account.name.charAt(0).toUpperCase() : 'M'}
                                                  </div>
                                                  <div>
                                                    <p className="text-xs font-bold text-slate-900 leading-tight">
                                                      {account.name || 'MKR Infotech Ads'}
                                                    </p>
                                                    <div className="flex items-center gap-1 text-[10px] text-slate-400">
                                                      <span>Sponsored</span>
                                                      <span>·</span>
                                                      <Globe className="w-2.5 h-2.5" />
                                                    </div>
                                                  </div>
                                                </div>
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                                                  Meta Feed Ad
                                                </span>
                                              </div>

                                              {/* Primary Text */}
                                              {a.creative?.body && (
                                                <div className="p-3 text-xs text-slate-800 leading-relaxed whitespace-pre-line border-b border-slate-100 bg-white max-h-32 overflow-y-auto">
                                                  {a.creative.body}
                                                </div>
                                              )}

                                              {/* Media / Creative Image (Fixed aspect-video, clean object-cover) */}
                                              {a.creative?.imageUrl ? (
                                                <div className="relative bg-slate-900 aspect-video overflow-hidden">
                                                  <img
                                                    src={a.creative.imageUrl}
                                                    alt={safeStr(a.headline || a.name)}
                                                    className="w-full h-full object-cover object-center"
                                                    onError={(e) => {
                                                      (e.target as HTMLElement).style.display = 'none';
                                                    }}
                                                  />
                                                </div>
                                              ) : (
                                                <div className="w-full aspect-video bg-slate-100 flex flex-col items-center justify-center text-slate-400 gap-1.5 border-y border-slate-200">
                                                  <ImageIcon className="w-8 h-8 opacity-40" />
                                                  <span className="text-xs font-medium">Meta Ad Creative Media</span>
                                                </div>
                                              )}

                                              {/* Headline & CTA Banner */}
                                              <div className="p-3 bg-slate-50 flex items-center justify-between gap-3 border-t border-slate-200">
                                                <div className="min-w-0">
                                                  <p className="text-[10px] uppercase font-mono text-slate-400 tracking-wider">
                                                    fb.me / Lead Form
                                                  </p>
                                                  <p className="text-xs font-bold text-slate-900 truncate mt-0.5">
                                                    {a.headline || a.name}
                                                  </p>
                                                </div>
                                                <span className="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-bold text-xs uppercase tracking-wide shrink-0 shadow-xs flex items-center gap-1">
                                                  {ctaText}
                                                </span>
                                              </div>
                                            </div>

                                            {/* Right Column: KPIs & Interactive Controls */}
                                            <div className="lg:col-span-7 space-y-4">
                                              {/* Quick Actions Bar */}
                                              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-2">
                                                <div className="flex items-center gap-2">
                                                  {adLeads > 0 ? (
                                                    <button
                                                      onClick={() =>
                                                        setActiveLeadsTarget({
                                                          type: 'ad',
                                                          id: a.id,
                                                          campaignId: c.id,
                                                          campaignName: c.name,
                                                          adId: a.id,
                                                          adName: a.name,
                                                          title: `${a.name} (${c.name})`,
                                                        })
                                                      }
                                                      className="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
                                                    >
                                                      <Users className="w-3.5 h-3.5" />
                                                      View {adLeads} Leads From This Ad →
                                                    </button>
                                                  ) : (
                                                    <span className="text-xs text-slate-400 font-medium">0 leads captured yet</span>
                                                  )}
                                                </div>

                                                {a.previewIframeUrl && (
                                                  <div className="flex items-center gap-2">
                                                    <button
                                                      onClick={() => toggleLivePreview(a.id)}
                                                      className="text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg shadow-2xs flex items-center gap-1.5"
                                                    >
                                                      <Eye className="w-3.5 h-3.5 text-blue-600" />
                                                      {isLivePreviewOpen ? 'Hide Meta Preview' : 'Interactive Meta Preview'}
                                                    </button>
                                                    <a
                                                      href={a.previewIframeUrl}
                                                      target="_blank"
                                                      rel="noopener noreferrer"
                                                      className="text-xs font-semibold text-blue-600 hover:text-blue-800 bg-white border border-slate-200 p-1.5 rounded-lg shadow-2xs"
                                                      title="Open Meta preview iframe in new tab"
                                                    >
                                                      <ExternalLink className="w-3 h-3" />
                                                    </a>
                                                  </div>
                                                )}
                                              </div>

                                              {/* Metrics Grid */}
                                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                                {[
                                                  ['Spend', formatCurrency(a.metrics?.spend, currency)],
                                                  ['Leads', formatNumber(a.metrics?.leads)],
                                                  ['Cost / Lead', a.metrics?.costPerResult ? formatCurrency(a.metrics.costPerResult, currency) : '—'],
                                                  ['Reach', formatNumber(a.metrics?.reach)],
                                                  ['Impressions', formatNumber(a.metrics?.impressions)],
                                                  ['CTR', a.metrics?.ctr ? `${parseFloat(a.metrics.ctr).toFixed(2)}%` : '—'],
                                                  ['CPC', a.metrics?.cpc ? formatCurrency(a.metrics.cpc, currency) : '—'],
                                                  ['Link Clicks', formatNumber(a.metrics?.inlineLinkClicks)],
                                                ].map(([label, val]) => (
                                                  <div key={label} className="bg-white rounded-xl p-2.5 border border-slate-200 shadow-2xs">
                                                    <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">{label}</p>
                                                    <p className="text-sm font-extrabold text-slate-900 font-mono mt-0.5 truncate">
                                                      {val}
                                                    </p>
                                                  </div>
                                                ))}
                                              </div>

                                              {/* Interactive Meta Preview (if toggled) */}
                                              {isLivePreviewOpen && a.previewIframeUrl && (
                                                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                                                  <div className="p-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
                                                    <span className="font-bold text-slate-700 flex items-center gap-1.5">
                                                      <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                                                      Meta Interactive Preview Player
                                                    </span>
                                                    <a
                                                      href={a.previewIframeUrl}
                                                      target="_blank"
                                                      rel="noopener noreferrer"
                                                      className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                                                    >
                                                      Full Window <ExternalLink className="w-3 h-3" />
                                                    </a>
                                                  </div>
                                                  <div className="w-full h-80 bg-slate-50 flex items-center justify-center overflow-hidden">
                                                    <iframe
                                                      src={a.previewIframeUrl}
                                                      title={`Meta Preview - ${a.name}`}
                                                      className="w-full h-full border-0"
                                                      sandbox="allow-scripts allow-same-origin allow-popups"
                                                      loading="lazy"
                                                    />
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Leads Drawer / Modal */}
      {activeLeadsTarget && (
        <div
          className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs flex justify-end animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setActiveLeadsTarget(null);
          }}
        >
          <div className="w-full max-w-xl md:max-w-2xl lg:max-w-3xl bg-white h-full shadow-2xl flex flex-col justify-between overflow-hidden animate-in slide-in-from-right duration-300">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-100 text-blue-800">
                    {activeLeadsTarget.type} leads
                  </span>
                  <span className="text-xs text-slate-500 font-mono">ID: {activeLeadsTarget.id}</span>
                </div>
                <h3 className="text-base font-extrabold text-slate-900 mt-1 truncate max-w-md">
                  {activeLeadsTarget.title}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {rawLeads.length > 0 && (
                  <Button variant="secondary" size="sm" onClick={exportLeadsCsv} className="text-xs">
                    <Download className="w-3.5 h-3.5" />
                    Export CSV
                  </Button>
                )}
                <button
                  onClick={() => setActiveLeadsTarget(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Drawer Search & Count Bar */}
            <div className="p-3 border-b border-slate-100 bg-white flex items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search leads by name, phone, or email…"
                  value={leadSearch}
                  onChange={(e) => setLeadSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-blue-500"
                />
              </div>
              <span className="text-xs font-bold text-slate-700 shrink-0">
                {filteredDrawerLeads.length} Lead{filteredDrawerLeads.length === 1 ? '' : 's'}
              </span>
            </div>

            {/* Drawer Body: Leads List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
              {leadsLoading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-500 text-xs">
                  <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                  Fetching lead submissions from Meta Lead Forms…
                </div>
              ) : filteredDrawerLeads.length === 0 ? (
                <div className="text-center py-16 text-slate-400 space-y-2">
                  <Users className="w-10 h-10 mx-auto text-slate-300" />
                  <p className="text-sm font-semibold text-slate-700">No leads found</p>
                  <p className="text-xs text-slate-400">
                    {leadSearch ? 'No leads match your search query.' : 'No instant form submissions recorded yet.'}
                  </p>
                </div>
              ) : (
                filteredDrawerLeads.map((lead: any) => {
                  const isImporting = importingLeadId === lead.id;
                  const customFieldEntries = Object.entries(lead.customFields || {});

                  return (
                    <div
                      key={lead.id}
                      className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3 hover:border-slate-300 transition-colors"
                    >
                      {/* Top Lead Info */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 font-extrabold flex items-center justify-center text-sm shrink-0 border border-blue-200 shadow-2xs">
                            {lead.name ? lead.name.charAt(0).toUpperCase() : 'L'}
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-slate-900 leading-tight">
                              {lead.name || 'Unnamed Lead'}
                            </h4>
                            {lead.company && (
                              <p className="text-xs text-slate-500 font-medium flex items-center gap-1 mt-0.5">
                                <Building2 className="w-3 h-3 text-slate-400" />
                                {lead.company}
                              </p>
                            )}
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                Meta Ads
                              </span>
                              {(lead.adName || activeLeadsTarget.adName) && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700">
                                  Ad: {lead.adName || activeLeadsTarget.adName}
                                </span>
                              )}
                              <span className="text-[10px] text-slate-400 font-mono">
                                Submitted {new Date(lead.createdTime).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* CRM Status Badge & Import Action */}
                        <div className="shrink-0 flex items-center gap-2">
                          {lead.inCrm ? (
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                In CRM
                              </span>
                              {lead.crmLeadId && (
                                <Link
                                  to={`/leads/${lead.crmLeadId}`}
                                  className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-0.5"
                                >
                                  View Lead →
                                </Link>
                              )}
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => handleImportLead(lead.id, lead)}
                              loading={isImporting}
                              className="text-xs py-1.5 px-3 font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              Sync to CRM
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Contact Channels */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {lead.phone && (
                          <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 font-mono">
                            <span className="flex items-center gap-1.5 text-slate-800 font-bold">
                              <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              {lead.phone}
                            </span>
                            <div className="flex items-center gap-1">
                              <a
                                href={`https://wa.me/${lead.phone.replace(/[^0-9]/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2 py-0.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded text-[11px] font-bold transition-colors"
                              >
                                WhatsApp
                              </a>
                              <a
                                href={`tel:${lead.phone}`}
                                className="px-2 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded text-[11px] font-bold transition-colors"
                              >
                                Call
                              </a>
                            </div>
                          </div>
                        )}

                        {lead.email && (
                          <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 font-mono">
                            <span className="flex items-center gap-1.5 text-slate-800 truncate font-semibold">
                              <Mail className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                              <span className="truncate">{lead.email}</span>
                            </span>
                            <a
                              href={`mailto:${lead.email}`}
                              className="px-2 py-0.5 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded text-[11px] font-bold shrink-0 ml-1 transition-colors"
                            >
                              Email
                            </a>
                          </div>
                        )}
                      </div>

                      {/* Custom Form Answers */}
                      {customFieldEntries.length > 0 && (
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
                          <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                            Form Questions & Responses
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                            {customFieldEntries.map(([questionKey, answer]: [string, any]) => {
                              const strAns = safeStr(answer);
                              const isUrl = strAns.startsWith('http://') || strAns.startsWith('https://');
                              const isInbox = questionKey.toLowerCase().includes('inbox') || isUrl;
                              return (
                                <div key={questionKey} className="bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-2xs">
                                  <p className="text-[10px] text-slate-500 font-semibold truncate capitalize">
                                    {questionKey.replace(/_/g, ' ')}
                                  </p>
                                  {isInbox && isUrl ? (
                                    <a
                                      href={strAns}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 font-bold text-blue-600 hover:text-blue-800 hover:underline mt-1 text-xs"
                                    >
                                      Open Meta Inbox Chat <ExternalLink className="w-3 h-3" />
                                    </a>
                                  ) : (
                                    <p className="font-bold text-slate-800 mt-0.5 capitalize">
                                      {strAns.replace(/_/g, ' ')}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Drawer Footer */}
            <div className="p-3.5 border-t border-slate-200 bg-white flex items-center justify-between text-xs text-slate-500">
              <span className="flex items-center gap-1 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Live synced via Meta Lead Ads API
              </span>
              <Button size="sm" variant="secondary" onClick={() => setActiveLeadsTarget(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Cards: Lead Forms & Recent Leads */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title={`Meta Lead Forms (${forms.length})`}>
          {forms.length === 0 ? (
            <p className="text-xs text-slate-400 py-3">No Lead Forms synced yet for this account.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {forms.map((f: any) => (
                <div
                  key={f._id}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs"
                >
                  <div>
                    <p className="font-bold text-slate-800">{safeStr(f.name || f.metaFormId)}</p>
                    <p className="text-[10px] text-slate-400 font-mono">ID: {f.metaFormId}</p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      f.status === 'ACTIVE'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {safeStr(f.status)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title={`Recent Inbound Meta Leads in CRM (${recentLeads.length})`}>
          {recentLeads.length === 0 ? (
            <p className="text-xs text-slate-400 py-3">No Meta lead ad submissions recorded in CRM yet.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {recentLeads.map((l: any) => (
                <div
                  key={l._id}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs"
                >
                  <div>
                    <Link to={`/leads/${l._id}`} className="font-bold text-blue-600 hover:underline">
                      {safeStr(l.name || 'Anonymous Lead')}
                    </Link>
                    <p className="text-[10px] text-slate-400 font-mono">
                      {l.phone || l.email || '—'} · {new Date(l.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                    {safeStr(l.status)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default AdAccountDetailPage;

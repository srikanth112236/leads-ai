import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useGet } from '../hooks/useApi';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/common/Toast';
import Button from '../components/common/Button';
import {
  Target,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  Users,
  Download,
  Search,
  Image as ImageIcon,
} from 'lucide-react';
import { metaStatusOf, statusPillClasses } from '../utils/campaignGrants';

function fmtMoney(v: any): string {
  if (v == null || v === '') return '—';
  const n = typeof v === 'number' ? v : parseFloat(v);
  if (isNaN(n)) return String(v);
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function fmtNum(v: any): string {
  if (v == null || v === '') return '0';
  const n = typeof v === 'number' ? v : parseFloat(v);
  if (isNaN(n)) return String(v);
  return n.toLocaleString('en-IN');
}

const MyCampaignsPage: React.FC = () => {
  const { user, activeBranchId } = useAuth();
  const { data, isLoading } = useGet('/campaign-access/mine/detailed');
  const allGrants: any[] = (data as any)?.data || [];
  // Mirror the global branch switcher: when a branch is active, only its
  // campaigns show – never leak rows from branch to branch.
  const grants = activeBranchId
    ? allGrants.filter((g: any) => String(g.branchId) === String(activeBranchId))
    : allGrants;

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'PAUSED'>('ALL');

  // Live metrics per ad account (parallel) → merged by campaign id.
  const accountIds = useMemo(
    () => [...new Set(grants.map((g: any) => g.adAccountId).filter(Boolean).map(String))],
    [grants],
  );
  const { data: metricsMap } = useQuery({
    queryKey: ['my-campaign-metrics', accountIds.join(',')],
    queryFn: async () => {
      const settled = await Promise.all(
        accountIds.map(async (id) => {
          try {
            const r = await api.get(`/meta/adaccounts/${id}/overview?datePreset=maximum`);
            return ((r.data as any)?.data?.campaigns || []) as any[];
          } catch {
            return [] as any[];
          }
        }),
      );
      const map: Record<string, any> = {};
      for (const c of settled.flat()) map[String(c.id ?? c.campaignId)] = c;
      return map;
    },
    enabled: accountIds.length > 0,
    retry: false,
  });
  const metricsById: Record<string, any> = (metricsMap as any) || {};

  const filtered = grants.filter((g: any) => {
    if (statusFilter !== 'ALL') {
      const st = metaStatusOf({ effectiveStatus: g.effectiveStatus, status: g.status });
      if (statusFilter === 'ACTIVE' && !(st === 'ACTIVE' || st === '')) return false;
      if (statusFilter === 'PAUSED' && st !== 'PAUSED') return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      const name = String(g.campaignName || g.campaignId || '').toLowerCase();
      if (!name.includes(q) && !String(g.campaignId || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const grouped = filtered.reduce((acc: Record<string, any[]>, g: any) => {
    const key = String(g.branchId || 'unassigned');
    if (!acc[key]) acc[key] = [];
    acc[key].push(g);
    return acc;
  }, {});

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] gap-3">
        <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium text-slate-500">Loading your campaigns…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">My Campaigns ({grants.length})</h1>
            <p className="text-xs text-slate-500">
              Campaigns assigned to you. <strong>View</strong> = see details, preview &amp; leads ·{' '}
              <strong>Manage</strong> = also import leads to the CRM.
            </p>
          </div>
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-semibold">
            {(['ALL', 'ACTIVE', 'PAUSED'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-md transition-all ${
                  statusFilter === st ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {st === 'ALL' ? 'All' : st.charAt(0) + st.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="relative mt-3">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search your campaigns…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-indigo-500 transition-colors"
          />
        </div>
      </div>

      {grants.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
          <Target className="w-12 h-12 mx-auto text-slate-300 mb-3" />
          <p className="text-base font-semibold text-slate-700">
            {activeBranchId && allGrants.length > 0 ? 'No campaigns assigned in this branch' : 'No campaigns assigned yet'}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {activeBranchId && allGrants.length > 0
              ? 'Your other branches may have grants – switch branches to see them.'
              : 'You currently see all campaigns in your branch(s). When grants are assigned by a manager, they will appear here.'}
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center text-slate-400 text-sm">
          No campaigns match your search / filter.
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([branchId, branchGrants]) => {
            const branchName =
              branchId === 'unassigned' ? 'Unassigned' : branchGrants[0]?.branchName || branchId;
            return (
              <div key={branchId} className="space-y-3">
                <h2 className="text-sm font-bold text-slate-700 px-1">
                  {branchName} ({branchGrants.length})
                </h2>
                {branchGrants.map((g: any) => (
                  <CampaignCard
                    key={`${g.campaignId}-${g.branchId}`}
                    grant={g}
                    metrics={metricsById[String(g.campaignId)]}
                    companyId={user?.companyId}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */

const CampaignCard: React.FC<{ grant: any; metrics?: any; companyId?: string }> = ({
  grant,
  metrics,
  companyId,
}) => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [section, setSection] = useState<'preview' | 'leads'>('preview');
  const [importingId, setImportingId] = useState<string | null>(null);

  const campaignId = String(grant.campaignId);
  const canManage = grant.access === 'manage';
  const metaStatus = metaStatusOf({ effectiveStatus: grant.effectiveStatus, status: grant.status });
  const m = metrics?.metrics || {};
  const cpl = parseFloat(m.leads || '0') > 0 ? parseFloat(m.spend || '0') / parseFloat(m.leads) : null;

  const companyParam = companyId ? `&companyId=${encodeURIComponent(companyId)}` : '';
  const adsUrl = `/meta/campaigns/ads?campaignId=${encodeURIComponent(campaignId)}${companyParam}`;
  const leadsUrl = `/meta/campaigns/leads?campaignId=${encodeURIComponent(campaignId)}${companyParam}`;

  const { data: adsData, isFetching: adsLoading } = useQuery({
    queryKey: ['my-campaign-ads', campaignId],
    queryFn: () => api.get(adsUrl).then((r) => r.data),
    enabled: expanded && section === 'preview',
    retry: false,
  });
  const ads: any[] = (adsData as any)?.data || [];

  const { data: leadsData, isFetching: leadsLoading } = useQuery({
    queryKey: ['my-campaign-leads', campaignId],
    queryFn: () => api.get(leadsUrl).then((r) => r.data),
    enabled: expanded && section === 'leads',
    retry: false,
  });
  const leads: any[] = (leadsData as any)?.data || [];

  const handleImport = async (lead: any) => {
    const lid = String(lead.id);
    setImportingId(lid);
    try {
      const res = await api.post('/meta/leads/import-crm', {
        leadId: lead.id,
        companyId,
        campaignId,
        campaignName: grant.campaignName,
        adId: lead.adId,
        adName: lead.adName,
        formId: lead.formId,
        tags: ['Meta Ads', 'Facebook Lead', `Campaign: ${grant.campaignName || campaignId}`].filter(Boolean),
      });
      if (res.data?.success) toast.success('Lead imported to CRM');
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    } catch (err: any) {
      toast.error('Import failed', err?.response?.data?.error || 'Could not import lead.');
    } finally {
      setImportingId(null);
    }
  };

  const heroAd = ads.find((a: any) => a.creative?.imageUrl) || ads[0];

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center gap-3 hover:bg-slate-50/60 transition-colors text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-slate-900 truncate">{grant.campaignName || campaignId}</p>
            {metaStatus && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusPillClasses(metaStatus)}`}>
                {metaStatus}
              </span>
            )}
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${canManage ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
              {grant.access}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 truncate">
            {grant.adAccountName || 'Ad account'} • {grant.objective || 'Campaign'}
            {grant.expiresAt ? ` • expires ${new Date(grant.expiresAt).toLocaleDateString()}` : ''}
          </p>
          <div className="flex items-center gap-4 mt-2 text-xs">
            <span className="font-mono font-bold text-slate-900">{fmtMoney(m.spend)} <span className="font-sans font-normal text-slate-400">spend</span></span>
            <span className="font-mono font-bold text-emerald-700">{fmtNum(m.leads)} <span className="font-sans font-normal text-slate-400">leads</span></span>
            <span className="font-mono text-slate-600">{cpl != null ? fmtMoney(cpl) : '—'} <span className="font-sans text-slate-400">/ lead</span></span>
            <span className="font-mono text-slate-600 hidden sm:inline">{fmtNum(m.reach)} <span className="font-sans text-slate-400">reach</span></span>
          </div>
        </div>
        {expanded ? <ChevronUp size={18} className="shrink-0 text-slate-400" /> : <ChevronDown size={18} className="shrink-0 text-slate-400" />}
      </button>

      {/* Expanded workspace */}
      {expanded && (
        <div className="border-t border-slate-100">
          <div className="flex items-center gap-1 px-4 pt-3">
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[11px] font-semibold">
              {(['preview', 'leads'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSection(s)}
                  className={`px-3 py-1.5 rounded-md transition-all capitalize flex items-center gap-1.5 ${
                    section === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {s === 'preview' ? <Eye size={13} /> : <Users size={13} />}
                  {s === 'preview' ? 'Preview & Ads' : `Leads${leads.length > 0 ? ` (${leads.length})` : ''}`}
                </button>
              ))}
            </div>
            <div className="flex-1" />
            {grant.adAccountId && (
              <Link
                to={`/ad-accounts/${grant.adAccountId}`}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
              >
                <ExternalLink size={13} />
                Open in Ad Account
              </Link>
            )}
          </div>

          <div className="p-4">
            {section === 'preview' ? (
              adsLoading ? (
                <div className="flex items-center justify-center py-8 gap-2 text-slate-400 text-xs">
                  <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  Loading preview…
                </div>
              ) : ads.length === 0 ? (
                <p className="text-center py-6 text-slate-400 text-xs">No ads found under this campaign.</p>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Creative preview */}
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="p-3 flex items-center gap-2.5 border-b border-slate-100 bg-slate-50/70">
                      <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-black flex items-center justify-center text-xs shrink-0">
                        {(grant.adAccountName || 'M').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">{grant.adAccountName || 'Sponsored'}</p>
                        <p className="text-[10px] text-slate-400">Sponsored</p>
                      </div>
                    </div>
                    {heroAd?.creative?.body && (
                      <div className="p-3 text-xs text-slate-800 leading-relaxed whitespace-pre-line border-b border-slate-100 max-h-28 overflow-y-auto">
                        {heroAd.creative.body}
                      </div>
                    )}
                    {heroAd?.creative?.imageUrl ? (
                      <div className="relative bg-slate-900 aspect-video overflow-hidden">
                        <img
                          src={heroAd.creative.imageUrl}
                          alt={heroAd.headline || heroAd.name}
                          className="w-full h-full object-cover object-center"
                          onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                        />
                      </div>
                    ) : (
                      <div className="w-full aspect-video bg-slate-100 flex flex-col items-center justify-center text-slate-400 gap-1.5">
                        <ImageIcon size={28} className="opacity-40" />
                        <span className="text-xs font-medium">No creative image</span>
                      </div>
                    )}
                    <div className="p-3 bg-slate-50 flex items-center justify-between gap-3 border-t border-slate-200">
                      <p className="text-xs font-bold text-slate-900 truncate">{heroAd?.headline || heroAd?.name}</p>
                      {heroAd?.previewIframeUrl && (
                        <a
                          href={heroAd.previewIframeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-bold text-xs uppercase shrink-0"
                        >
                          {(heroAd.callToAction || 'APPLY_NOW').replace(/_/g, ' ')}
                        </a>
                      )}
                    </div>
                  </div>
                  {/* Ads list */}
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {ads.map((a: any) => (
                      <div key={a.id} className="p-3 rounded-xl border border-slate-200 bg-white">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-bold text-slate-800 truncate">{a.name}</p>
                          <span className="font-mono font-bold text-emerald-700 text-xs shrink-0">{fmtNum(a.metrics?.leads)} leads</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1 font-mono">
                          {fmtMoney(a.metrics?.spend)} spend • {fmtNum(a.metrics?.reach)} reach
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            ) : leadsLoading ? (
              <div className="flex items-center justify-center py-8 gap-2 text-slate-400 text-xs">
                <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                Loading leads…
              </div>
            ) : leads.length === 0 ? (
              <p className="text-center py-6 text-slate-400 text-xs">No leads captured for this campaign yet.</p>
            ) : (
              <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                {!canManage && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                    View access — you can see lead details. Manage access is required to import leads to the CRM.
                  </p>
                )}
                {leads.map((l: any) => (
                  <div key={String(l.id)} className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-200 bg-white">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800 truncate">{l.name || 'Unnamed lead'}</p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {[l.phone, l.email].filter(Boolean).join(' • ') || 'No contact details'}
                      </p>
                      {(l.adName || l.formId) && (
                        <p className="text-[10px] text-slate-400 truncate">{l.adName || ''}{l.adName && l.formId ? ' • ' : ''}{l.formId || ''}</p>
                      )}
                    </div>
                    {l.createdTime && (
                      <span className="text-[10px] text-slate-400 shrink-0 hidden sm:inline">
                        {new Date(l.createdTime).toLocaleDateString()}
                      </span>
                    )}
                    {canManage && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleImport(l)}
                        loading={importingId === String(l.id)}
                        className="shrink-0 text-xs py-1"
                      >
                        <span className="flex items-center gap-1">
                          <Download size={13} />
                          Import
                        </span>
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MyCampaignsPage;

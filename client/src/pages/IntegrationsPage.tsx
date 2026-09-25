import React, { useState, useCallback, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import ConfirmModal from '../components/common/ConfirmModal';
import CustomSelect from '../components/common/CustomSelect';
import { useToast } from '../components/common/Toast';
import MetaPermissionModal, { ALL_SCOPE_KEYS } from '../components/integrations/MetaPermissionModal';
import { useGet, usePost } from '../hooks/useApi';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  Building2,
  AlertTriangle,
  Plus,
  ExternalLink,
  Globe,
  MessageSquare,
  Trash2,
  Copy,
  Check,
  Radio,
  Settings2,
  Share2,
  Terminal,
  Play,
  Sparkles,
  Edit3,
} from 'lucide-react';
import WebFormBuilderModal from '../components/forms/WebFormBuilderModal';
import FormApiDocsModal from '../components/forms/FormApiDocsModal';
import FormTestModal from '../components/forms/FormTestModal';

type TabType = 'meta' | 'whatsapp' | 'website';

const IntegrationsPage: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const isSuper = String(user?.role || '').toUpperCase() === 'SUPER_ADMIN';
  // RBAC: manage rights come from permissions, not role name. Users with only
  // integrations:read (e.g. BRANCH_MANAGER) get a read-only view.
  const canManageIntegrations =
    isSuper || hasPermission('integrations:manage') || hasPermission('meta:manage');
  const canAssignBranches =
    canManageIntegrations || hasPermission('campaigns:assign');
  const canManageWebhooks =
    isSuper || hasPermission('webhooks:manage') || hasPermission('integrations:manage');
  const readOnly = !canManageIntegrations;
  const url = isSuper ? '/admin/integrations' : `/companies/${user?.companyId}/integrations`;

  const [activeTab, setActiveTab] = useState<TabType>(
    (searchParams.get('tab') as TabType) || 'meta'
  );

  const { data, isLoading, refetch } = useGet(url);
  const payload = (data as any)?.data || {};

  const { data: branchesData } = useQuery({
    queryKey: ['branches-list'],
    queryFn: () => api.get('/branches').then((r) => r.data),
    retry: false,
  });
  const branches: any[] = (branchesData as any)?.data || [];

  const { data: webFormsData } = useQuery({
    queryKey: ['web-forms-list'],
    queryFn: () => api.get('/forms').then((r) => r.data),
    retry: false,
  });
  const webFormsList: any[] = (webFormsData as any)?.data || payload.websiteForms || [];

  const [error, setError] = useState<string | null>(null);
  const [managePermsIntegration, setManagePermsIntegration] = useState<any | null>(null);
  const [assigningIntegration, setAssigningIntegration] = useState<any | null>(null);
  const [disconnectTarget, setDisconnectTarget] = useState<{ id?: string; title: string; message: string } | null>(null);
  const [subscribingWebhooks, setSubscribingWebhooks] = useState(false);
  const [webhookStatusMessage, setWebhookStatusMessage] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Web Form Builder & Tester Modal States
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingForm, setEditingForm] = useState<any | null>(null);
  const [apiDocsForm, setApiDocsForm] = useState<any | null>(null);
  const [testingForm, setTestingForm] = useState<any | null>(null);
  const [deletingForm, setDeletingForm] = useState<any | null>(null);

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [url] });
    queryClient.invalidateQueries({ queryKey: ['branches-list'] });
    queryClient.invalidateQueries({ queryKey: ['web-forms-list'] });
    setTimeout(() => refetch(), 300);
  }, [url, queryClient, refetch]);

  const handleDeleteForm = async () => {
    if (!deletingForm) return;
    if (!canManageIntegrations) {
      toast.error('Access Restricted', 'You have view-only access. integrations:manage permission is required.');
      return;
    }
    try {
      await api.delete(`/forms/${deletingForm._id}`);
      toast.success('Form Deleted', 'Web form removed successfully');
      setDeletingForm(null);
      refresh();
    } catch (err: any) {
      toast.error('Delete Failed', err?.response?.data?.error || 'Failed to delete form');
    }
  };

  const handleToggleFormStatus = async (form: any) => {
    if (!canManageIntegrations) {
      toast.error('Access Restricted', 'You have view-only access. integrations:manage permission is required.');
      return;
    }
    try {
      await api.patch(`/forms/${form._id}/status`);
      toast.success('Status Updated', `Form is now ${form.status === 'active' ? 'inactive' : 'active'}`);
      refresh();
    } catch (err: any) {
      toast.error('Update Failed', err?.response?.data?.error || 'Failed to toggle status');
    }
  };

  const handleSubscribeWebhooks = async () => {
    if (!canManageWebhooks) {
      toast.error('Access Restricted', 'You have view-only access. webhooks:manage permission is required.');
      return;
    }
    setSubscribingWebhooks(true);
    setWebhookStatusMessage(null);
    setError(null);
    try {
      const res = await api.post('/meta/subscribe-webhooks', {
        companyId: user?.companyId,
      });
      const msg = res.data?.message || 'Real-time webhooks linked successfully!';
      setWebhookStatusMessage(msg);
      toast.success('Webhooks Linked', msg);
      refresh();
    } catch (err: any) {
      const errMsg = err?.response?.data?.error || 'Failed to link webhooks';
      setError(errMsg);
      toast.error('Webhook Error', errMsg);
    } finally {
      setSubscribingWebhooks(false);
    }
  };

  const [connecting, setConnecting] = useState(false);
  const disconnect = usePost('/meta/disconnect');

  const startConnect = async (rerequest: boolean = false, integrationId?: string) => {
    if (!canManageIntegrations) {
      toast.error('Access Restricted', 'You have view-only access. integrations:manage permission is required.');
      return;
    }
    setError(null);
    setConnecting(true);
    try {
      const params = new URLSearchParams();
      if (rerequest) params.set('rerequest', 'true');
      if (integrationId) params.set('integrationId', integrationId);
      params.set('scopes', ALL_SCOPE_KEYS.join(','));
      const queryStr = `?${params.toString()}`;
      const res = await api.get(`/meta/oauth/start${queryStr}`);
      const dialogUrl = res?.data?.data?.dialogUrl;
      if (dialogUrl) window.location.href = dialogUrl;
      else setError('No dialog URL returned');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Connect failed');
    } finally {
      setConnecting(false);
    }
  };

  const doDisconnect = (integrationId?: string) => {
    if (!canManageIntegrations) {
      toast.error('Access Restricted', 'You have view-only access. integrations:manage permission is required.');
      return;
    }
    setDisconnectTarget({
      id: integrationId,
      title: integrationId ? 'Disconnect Portfolio' : 'Disconnect Meta Integration',
      message: integrationId
        ? 'Are you sure you want to disconnect this portfolio? Its pages, ad accounts, and lead forms will stop receiving inbound leads.'
        : 'Are you sure you want to disconnect Meta? All incoming lead flows will stop immediately.',
    });
  };

  const handleConfirmDisconnect = () => {
    if (!disconnectTarget) return;
    const integrationId = disconnectTarget.id;
    disconnect.mutate(integrationId ? { integrationId } : undefined, {
      onSuccess: () => {
        setDisconnectTarget(null);
        toast.success('Disconnected', 'Integration disconnected successfully.');
        refresh();
      },
      onError: (err: any) => {
        setError(err?.response?.data?.error || 'Disconnect failed');
        setDisconnectTarget(null);
      },
    });
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success('Copied', 'Copied to clipboard');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const metaIntegrations = payload.activeMeta || payload.meta || [];
  const metaPages = payload.metaPages || [];
  const metaForms = payload.metaForms || [];
  const metaAdAccounts = payload.metaAdAccounts || [];
  const whatsappIntegrations = payload.whatsapp || [];

  useEffect(() => {
    if (searchParams.get('managePermissions') === '1' && metaIntegrations.length > 0) {
      const targetId = searchParams.get('integrationId');
      const match = targetId ? metaIntegrations.find((m: any) => m._id === targetId) : metaIntegrations[0];
      if (match) {
        setManagePermsIntegration(match);
      }
    }
  }, [searchParams, metaIntegrations]);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Integrations & Channels</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
              Multi-Tenant Scoped
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Connect and manage Meta Lead Ads, WhatsApp Business, and Website Forms with strict branch isolation.
          </p>
          {readOnly && (
            <p className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
              👁 Read-only access — you hold integrations:read. Manage actions need integrations:manage.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'meta' && canManageIntegrations && (
            <>
              {canManageWebhooks && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleSubscribeWebhooks}
                  loading={subscribingWebhooks}
                  className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold"
                >
                  <span className="flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                    Link Webhooks
                  </span>
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => startConnect(false)}
                loading={connecting}
                className="font-semibold shadow-xs"
              >
                <span className="flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  Connect Portfolio
                </span>
              </Button>
            </>
          )}

          {activeTab === 'website' && canManageIntegrations && (
            <Button
              size="sm"
              onClick={() => {
                setEditingForm(null);
                setBuilderOpen(true);
              }}
              className="font-semibold shadow-xs"
            >
              <span className="flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                Create Web Form
              </span>
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800 font-bold ml-2">✕</button>
        </div>
      )}

      {webhookStatusMessage && (
        <div className="p-3 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <span>{webhookStatusMessage}</span>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-0">
        <button
          onClick={() => handleTabChange('meta')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all ${
            activeTab === 'meta'
              ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50 rounded-t-lg'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-t-lg'
          }`}
        >
          <Share2 className="w-4 h-4 text-blue-600" />
          <span>Meta Ads & Forms</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
            {metaIntegrations.length}
          </span>
        </button>

        <button
          onClick={() => handleTabChange('whatsapp')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all ${
            activeTab === 'whatsapp'
              ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50 rounded-t-lg'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-t-lg'
          }`}
        >
          <MessageSquare className="w-4 h-4 text-emerald-600" />
          <span>WhatsApp Business</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
            {whatsappIntegrations.length}
          </span>
        </button>

        <button
          onClick={() => handleTabChange('website')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all ${
            activeTab === 'website'
              ? 'border-amber-600 text-amber-700 bg-amber-50/50 rounded-t-lg'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-t-lg'
          }`}
        >
          <Globe className="w-4 h-4 text-amber-600" />
          <span>Website Forms</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
            {webFormsList.length}
          </span>
        </button>
      </div>

      {/* TAB 1: META ADS */}
      {activeTab === 'meta' && (
        <div className="space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 gap-3 text-slate-400 text-sm">
              <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              Loading Meta portfolios…
            </div>
          ) : metaIntegrations.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
              <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Share2 className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-slate-900">No Meta Portfolios Connected</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-5">
                Connect your Meta Business Account to discover Ad Accounts, Facebook Pages, and Instant Lead Forms.
              </p>
              <Button onClick={() => startConnect(false)} loading={connecting} className="shadow-xs font-semibold">
                Connect Meta Portfolio
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {metaIntegrations.map((m: any) => {
                const hasError = m.metadata?.actionRequired || m.metadata?.lastSyncStatus === 'failed';
                const grantedScopes: string[] = m.metadata?.grantedScopes || m.scopes || [];
                const declinedScopes: string[] = m.metadata?.declinedScopes || [];
                const portfolioPages = metaPages.filter((p: any) => String(p.integrationId) === String(m._id));
                const portfolioForms = metaForms.filter((f: any) => String(f.integrationId) === String(m._id));
                const portfolioAccounts = metaAdAccounts.filter((a: any) => String(a.integrationId) === String(m._id));

                const unassignedCount =
                  portfolioPages.filter((p: any) => !p.branchId).length +
                  portfolioForms.filter((f: any) => !f.branchId).length +
                  portfolioAccounts.filter((a: any) => !a.branchId).length;

                return (
                  <div
                    key={m._id}
                    className={`bg-white rounded-2xl border transition-all duration-200 shadow-xs flex flex-col justify-between ${
                      hasError
                        ? 'border-amber-300 ring-2 ring-amber-100'
                        : 'border-slate-200 hover:border-indigo-200 hover:shadow-sm'
                    }`}
                  >
                    {/* Card Header */}
                    <div className="p-5 border-b border-slate-100">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0 text-blue-600 font-bold">
                            <Share2 className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-bold text-slate-900 truncate">
                                {m.label || 'Meta Business Portfolio'}
                              </h3>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                                  m.status === 'active'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {m.status === 'active' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                                {m.status}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                              ID: {m.portfolioBusinessId || m._id}
                            </p>
                          </div>
                        </div>

                        {/* Webhook Heartbeat badge */}
                        <div className="shrink-0 text-right">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Live Sync Active
                          </span>
                        </div>
                      </div>

                      {hasError && (
                        <div className="mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="font-semibold text-amber-900">Permissions Re-request Required</p>
                            <p className="text-[11px] text-amber-700 mt-0.5">
                              {m.metadata?.lastSyncError || 'Ad account owner has not granted full ads_read / ads_management permissions.'}
                            </p>
                            {canManageIntegrations && (
                              <button
                                onClick={() => startConnect(true, m._id)}
                                className="mt-1.5 text-xs font-bold underline text-amber-900 hover:text-amber-950"
                              >
                                Re-authorize with Full Scopes →
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Card Body */}
                    <div className="p-5 space-y-4 text-xs">
                      {/* Assets Overview Counter */}
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                          <span className="block text-base font-bold text-slate-900">{portfolioAccounts.length}</span>
                          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Ad Accounts</span>
                        </div>
                        <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                          <span className="block text-base font-bold text-slate-900">{portfolioPages.length}</span>
                          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Pages</span>
                        </div>
                        <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                          <span className="block text-base font-bold text-slate-900">{portfolioForms.length}</span>
                          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Lead Forms</span>
                        </div>
                      </div>

                      {/* Branch Assignment Status */}
                      <div className="flex items-center justify-between p-2.5 bg-indigo-50/50 border border-indigo-100 rounded-xl">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-indigo-600 shrink-0" />
                          <div>
                            <p className="text-xs font-bold text-indigo-900">Branch Routing</p>
                            <p className="text-[10px] text-indigo-700">
                              {unassignedCount === 0
                                ? 'All assets mapped to branches'
                                : `${unassignedCount} asset(s) waiting for branch assignment`}
                            </p>
                          </div>
                        </div>
                        {canAssignBranches ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setAssigningIntegration(m)}
                            className="bg-white border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-bold text-xs"
                          >
                            Assign Branches
                          </Button>
                        ) : (
                          <span className="text-[10px] font-semibold text-slate-400 px-2 py-1 rounded-md bg-slate-100 border border-slate-200">
                            View only
                          </span>
                        )}
                      </div>

                      {/* Permissions Pills */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] font-semibold text-slate-500">Active Permissions ({grantedScopes.length})</span>
                          {canManageIntegrations && (
                            <button
                              onClick={() => setManagePermsIntegration(m)}
                              className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 underline"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {grantedScopes.slice(0, 5).map((scope: string) => (
                            <span
                              key={scope}
                              className="px-2 py-0.5 rounded-md text-[10px] font-mono font-medium bg-slate-100 text-slate-700 border border-slate-200"
                            >
                              {scope}
                            </span>
                          ))}
                          {grantedScopes.length > 5 && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-slate-100 text-slate-500">
                              +{grantedScopes.length - 5} more
                            </span>
                          )}
                        </div>
                        {declinedScopes.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {declinedScopes.map((scope: string) => (
                              <span
                                key={scope}
                                className="px-2 py-0.5 rounded-md text-[10px] font-mono font-medium bg-red-50 text-red-700 border border-red-200"
                              >
                                Declined: {scope}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Card Footer Actions */}
                    <div className="p-4 bg-slate-50/70 border-t border-slate-100 rounded-b-2xl flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {canManageIntegrations && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setManagePermsIntegration(m)}
                            className="text-xs font-semibold"
                          >
                            <Settings2 className="w-3.5 h-3.5 mr-1" />
                            Manage Scopes
                          </Button>
                        )}
                        <Link
                          to="/ad-accounts"
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
                        >
                          <ExternalLink className="w-3 h-3 text-slate-400" />
                          View Ads
                        </Link>
                      </div>

                      {canManageIntegrations ? (
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => doDisconnect(m._id)}
                          loading={disconnect.isPending}
                          className="text-xs font-semibold"
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-1" />
                          Disconnect
                        </Button>
                      ) : (
                        <span className="text-[10px] font-semibold text-slate-400 px-2 py-1 rounded-md bg-slate-100 border border-slate-200">
                          Read-only
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: WHATSAPP BUSINESS */}
      {activeTab === 'whatsapp' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {whatsappIntegrations.length === 0 ? (
              <div className="col-span-full bg-white rounded-2xl border border-slate-200 p-10 text-center shadow-xs">
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">No WhatsApp Business Accounts Connected</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
                  Configure Cloud API credentials to receive inbound WhatsApp leads and send automated greetings.
                </p>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl max-w-md mx-auto text-left text-xs text-slate-600 font-mono">
                  <p className="font-bold text-slate-800 mb-1">Webhook Endpoint:</p>
                  <p className="break-all">{window.location.origin}/api/v1/webhooks/whatsapp</p>
                </div>
              </div>
            ) : (
              whatsappIntegrations.map((w: any) => (
                <div key={w._id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center font-bold">
                          <MessageSquare className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">
                            {w.phoneNumber || 'WhatsApp Business'}
                          </h3>
                          <p className="text-[11px] text-slate-400 font-mono">ID: {w.phoneNumberId || w._id}</p>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        {w.status || 'Active'}
                      </span>
                    </div>

                    <div className="mt-4 space-y-2 text-xs">
                      <div className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                        <span className="text-slate-500">Phone Number ID:</span>
                        <span className="font-mono font-semibold text-slate-800">{w.phoneNumberId || '—'}</span>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                        <span className="text-slate-500">Webhook Status:</span>
                        <span className="font-semibold text-emerald-700">Verified & Subscribed</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">Scoped Tenant Safe</span>
                    <button
                      onClick={() => copyToClipboard(`${window.location.origin}/api/v1/webhooks/whatsapp`, `wa-${w._id}`)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                    >
                      {copiedKey === `wa-${w._id}` ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      Copy Webhook URL
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 3: WEBSITE FORMS */}
      {activeTab === 'website' && (
        <div className="space-y-6">
          {webFormsList.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 sm:p-14 text-center shadow-xs">
              <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-amber-200 shadow-2xs">
                <Globe className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-slate-900">No Web Lead Forms Created Yet</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-6 leading-relaxed">
                Build custom multi-field web forms (text, phone, date picker, dropdowns, etc.) with scoped branch routing and instant public submission APIs.
              </p>
              {canManageIntegrations ? (
                <Button
                  onClick={() => {
                    setEditingForm(null);
                    setBuilderOpen(true);
                  }}
                  className="shadow-md shadow-indigo-600/20 font-bold px-5 py-2.5"
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  Create Web Form & Connect
                </Button>
              ) : (
                <p className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 max-w-md mx-auto">
                  👁 Read-only access — form creation needs integrations:manage.
                </p>
              )}

              {/* Feature highlight badges */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl mx-auto mt-10 text-left">
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="w-4 h-4 text-amber-600" />
                    <span className="font-bold text-slate-800 text-xs">Multi-Field Types</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Text, Date Picker, Dropdowns, Radio choices, Checkboxes & Textarea.
                  </p>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
                  <div className="flex items-center gap-2 mb-1">
                    <Building2 className="w-4 h-4 text-indigo-600" />
                    <span className="font-bold text-slate-800 text-xs">Scoped Branch Routing</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Automatically anchor incoming leads to their designated branch.
                  </p>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
                  <div className="flex items-center gap-2 mb-1">
                    <Terminal className="w-4 h-4 text-emerald-600" />
                    <span className="font-bold text-slate-800 text-xs">Instant Public API</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Ready-to-use cURL commands, JSON payloads, and fetch snippets.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {webFormsList.map((wf: any) => {
                const formBranch = branches.find((b: any) => b._id === (wf.branchId?._id || wf.branchId));
                const branchName = formBranch?.name || wf.branchId?.name || 'Company Default Branch';
                const fieldsList = wf.fields || [];
                const submitUrl = `${window.location.protocol}//${window.location.hostname}:3000/api/public/forms/${wf._id}/submit`;

                return (
                  <div
                    key={wf._id}
                    className="bg-white rounded-2xl border border-slate-200 hover:border-amber-300 hover:shadow-xs p-5 transition-all flex flex-col justify-between"
                  >
                    <div>
                      {/* Card Header */}
                      <div className="flex items-start justify-between pb-3 border-b border-slate-100 gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center font-bold shrink-0">
                            <Globe className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-bold text-slate-900 truncate">
                                {wf.name || 'Website Inquiry Form'}
                              </h3>
                              {canManageIntegrations ? (
                                <button
                                  onClick={() => handleToggleFormStatus(wf)}
                                  title="Click to toggle status"
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition-all ${
                                    wf.status === 'active'
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                                  }`}
                                >
                                  {wf.status || 'active'}
                                </button>
                              ) : (
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    wf.status === 'active'
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                                  }`}
                                >
                                  {wf.status || 'active'}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                              Key: {wf.publicKey}
                            </p>
                          </div>
                        </div>

                        {/* Branch badge */}
                        <div className="shrink-0 text-right">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            <Building2 className="w-3 h-3" />
                            {branchName}
                          </span>
                        </div>
                      </div>

                      {wf.description && (
                        <p className="text-xs text-slate-500 mt-2.5 line-clamp-2 italic">
                          {wf.description}
                        </p>
                      )}

                      {/* Metrics Overview */}
                      <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                        <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
                          <span className="block text-sm font-bold text-slate-900">{wf.submissionsCount || 0}</span>
                          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Submissions</span>
                        </div>
                        <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
                          <span className="block text-sm font-bold text-slate-900">{fieldsList.length}</span>
                          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Fields</span>
                        </div>
                        <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
                          <span className="block text-sm font-bold text-slate-900 truncate">
                            {wf.lastSubmissionAt ? new Date(wf.lastSubmissionAt).toLocaleDateString() : '—'}
                          </span>
                          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Last Sync</span>
                        </div>
                      </div>

                      {/* Fields preview chips */}
                      <div className="mt-3.5 space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Form Fields ({fieldsList.length}):
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {fieldsList.slice(0, 4).map((f: any) => (
                            <span
                              key={f.id}
                              className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-medium"
                            >
                              {f.label} <span className="text-slate-400 font-mono">({f.type})</span>
                            </span>
                          ))}
                          {fieldsList.length > 4 && (
                            <span className="px-2 py-0.5 rounded-md bg-slate-50 text-slate-500 text-[10px] font-semibold">
                              +{fieldsList.length - 4} more
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Public POST URL bar */}
                      <div className="mt-3.5 p-2 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-between text-xs">
                        <div className="min-w-0 font-mono text-[11px] text-slate-600 truncate pr-2">
                          <span className="font-bold text-emerald-700 mr-1.5">POST</span>
                          {submitUrl}
                        </div>
                        <button
                          onClick={() => copyToClipboard(submitUrl, `url-${wf._id}`)}
                          className="shrink-0 text-indigo-600 hover:text-indigo-800 font-semibold inline-flex items-center gap-1 text-[11px]"
                        >
                          {copiedKey === `url-${wf._id}` ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          Copy
                        </button>
                      </div>
                    </div>

                    {/* Card Actions Footer */}
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setTestingForm(wf)}
                          className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold text-xs"
                        >
                          <Play className="w-3 h-3 fill-emerald-600" />
                          Test Form
                        </Button>

                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setApiDocsForm(wf)}
                          className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-bold text-xs"
                        >
                          <Terminal className="w-3 h-3 text-slate-500" />
                          API & cURL Docs
                        </Button>
                      </div>

                      <div className="flex items-center gap-1">
                        <Link
                          to={`/forms/view/${wf._id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                          title="Open Standalone Public Form in New Tab"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Link>

                        {canManageIntegrations && (
                          <button
                            onClick={() => {
                              setEditingForm(wf);
                              setBuilderOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                            title="Edit Form Fields & Settings"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        )}

                        {canManageIntegrations && (
                          <button
                            onClick={() => setDeletingForm(wf)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                            title="Delete Form"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* INTERACTIVE BRANCH ASSIGNMENT MODAL */}
      {assigningIntegration && canAssignBranches && (
        <AssignBranchesModal
          isOpen={!!assigningIntegration}
          onClose={() => setAssigningIntegration(null)}
          integration={assigningIntegration}
          branches={branches}
          pages={metaPages.filter((p: any) => String(p.integrationId) === String(assigningIntegration._id))}
          forms={metaForms.filter((f: any) => String(f.integrationId) === String(assigningIntegration._id))}
          adAccounts={metaAdAccounts.filter((a: any) => String(a.integrationId) === String(assigningIntegration._id))}
          onUpdated={refresh}
        />
      )}

      {/* PERMISSION MODAL */}
      {managePermsIntegration && canManageIntegrations && (
        <MetaPermissionModal
          isOpen={!!managePermsIntegration}
          onClose={() => setManagePermsIntegration(null)}
          integration={managePermsIntegration}
          onUpdated={refresh}
        />
      )}

      {/* DISCONNECT CONFIRM MODAL */}
      <ConfirmModal
        isOpen={!!disconnectTarget}
        onClose={() => setDisconnectTarget(null)}
        onConfirm={handleConfirmDisconnect}
        title={disconnectTarget?.title || 'Disconnect Integration'}
        message={disconnectTarget?.message || ''}
        confirmText="Disconnect"
        variant="danger"
        loading={disconnect.isPending}
      />
      {/* WEB FORM BUILDER MODAL */}
      <WebFormBuilderModal
        isOpen={builderOpen}
        onClose={() => {
          setBuilderOpen(false);
          setEditingForm(null);
        }}
        formToEdit={editingForm}
        branches={branches}
        onSaved={refresh}
      />

      {/* WEB FORM API & CURL DOCS MODAL */}
      <FormApiDocsModal
        isOpen={!!apiDocsForm}
        onClose={() => setApiDocsForm(null)}
        form={apiDocsForm}
      />

      {/* WEB FORM LIVE TESTER MODAL */}
      <FormTestModal
        isOpen={!!testingForm}
        onClose={() => setTestingForm(null)}
        form={testingForm}
      />

      {/* WEB FORM DELETE CONFIRM MODAL */}
      <ConfirmModal
        isOpen={!!deletingForm}
        onClose={() => setDeletingForm(null)}
        onConfirm={handleDeleteForm}
        title={`Delete Web Form — ${deletingForm?.name || ''}`}
        message="Are you sure you want to delete this web form? External websites and landing pages submitting to its public API will no longer create leads."
        confirmText="Delete Form"
        variant="danger"
      />
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Dedicated Interactive Branch Assignment Modal                              */
/* -------------------------------------------------------------------------- */
interface AssignBranchesModalProps {
  isOpen: boolean;
  onClose: () => void;
  integration: any;
  branches: any[];
  pages: any[];
  forms: any[];
  adAccounts: any[];
  onUpdated: () => void;
}

const AssignBranchesModal: React.FC<AssignBranchesModalProps> = ({
  isOpen,
  onClose,
  integration,
  branches,
  pages,
  forms,
  adAccounts,
  onUpdated,
}) => {
  const toast = useToast();
  const [activeSection, setActiveSection] = useState<'accounts' | 'pages' | 'forms'>('accounts');
  const [savingId, setSavingId] = useState<string | null>(null);

  const branchesMap = React.useMemo(() => {
    const map: Record<string, string> = {};
    branches.forEach((b: any) => {
      map[b._id] = b.name;
    });
    return map;
  }, [branches]);

  const handleAssign = async (type: 'account' | 'page' | 'form', id: string, branchId: string) => {
    setSavingId(id);
    try {
      if (type === 'account') {
        await api.patch(`/meta/adaccounts/${id}/assign`, { branchId: branchId || null });
      } else if (type === 'page') {
        await api.put(`/meta/pages/${id}/assign`, { branchId: branchId || null });
      } else if (type === 'form') {
        await api.put(`/meta/forms/${id}/assign`, { branchId: branchId || null });
      }
      toast.success('Assigned', 'Asset branch mapping updated successfully');
      onUpdated();
    } catch (err: any) {
      toast.error('Assignment Error', err?.response?.data?.error || 'Failed to update branch assignment');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Assign Branches — ${integration?.label || 'Meta Portfolio'}`}
      size="xl"
    >
      <div className="space-y-4 text-xs">
        <div className="p-3 bg-indigo-50/70 border border-indigo-200/80 rounded-xl text-indigo-900 leading-relaxed">
          <p className="font-bold flex items-center gap-1.5 text-xs text-indigo-950">
            <Building2 className="w-4 h-4 text-indigo-600" />
            Scoped Tenant Isolation
          </p>
          <p className="text-[11px] text-indigo-800 mt-0.5">
            Assigning assets to a branch ensures that leads and ad metrics are strictly restricted to team members in that branch. Form routing wins over Page routing.
          </p>
        </div>

        {/* Section Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
          <button
            onClick={() => setActiveSection('accounts')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
              activeSection === 'accounts'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Ad Accounts ({adAccounts.length})
          </button>
          <button
            onClick={() => setActiveSection('pages')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
              activeSection === 'pages'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Facebook Pages ({pages.length})
          </button>
          <button
            onClick={() => setActiveSection('forms')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
              activeSection === 'forms'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Lead Forms ({forms.length})
          </button>
        </div>

        {/* SECTION 1: AD ACCOUNTS */}
        {activeSection === 'accounts' && (
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {adAccounts.length === 0 ? (
              <p className="text-center py-8 text-slate-400">No ad accounts discovered for this portfolio.</p>
            ) : (
              adAccounts.map((a: any) => (
                <div
                  key={a._id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl border border-slate-200 hover:border-indigo-200 bg-white shadow-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800 truncate">{a.name || a.metaAdAccountId}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        a.branchId ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {a.branchId ? branchesMap[a.branchId] || 'Assigned' : 'Unassigned'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">{a.metaAdAccountId}</p>
                  </div>

                  <div className="w-full sm:w-56 shrink-0">
                    <CustomSelect
                      value={a.branchId || ''}
                      placeholder="Select branch..."
                      options={[
                        { value: '', label: 'Unassigned / Default' },
                        ...branches.map((b: any) => ({ value: b._id, label: b.name })),
                      ]}
                      onChange={(val) => handleAssign('account', a._id, val)}
                      disabled={savingId === a._id}
                      compact
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* SECTION 2: PAGES */}
        {activeSection === 'pages' && (
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {pages.length === 0 ? (
              <p className="text-center py-8 text-slate-400">No pages discovered for this portfolio.</p>
            ) : (
              pages.map((p: any) => (
                <div
                  key={p._id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl border border-slate-200 hover:border-indigo-200 bg-white shadow-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800 truncate">{p.name || p.metaPageId}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        p.branchId ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {p.branchId ? branchesMap[p.branchId] || 'Assigned' : 'Unassigned'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">Page ID: {p.metaPageId}</p>
                  </div>

                  <div className="w-full sm:w-56 shrink-0">
                    <CustomSelect
                      value={p.branchId || ''}
                      placeholder="Select branch..."
                      options={[
                        { value: '', label: 'Unassigned / Default' },
                        ...branches.map((b: any) => ({ value: b._id, label: b.name })),
                      ]}
                      onChange={(val) => handleAssign('page', p._id, val)}
                      disabled={savingId === p._id}
                      compact
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* SECTION 3: LEAD FORMS */}
        {activeSection === 'forms' && (
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {forms.length === 0 ? (
              <p className="text-center py-8 text-slate-400">No lead forms discovered for this portfolio.</p>
            ) : (
              forms.map((f: any) => (
                <div
                  key={f._id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl border border-slate-200 hover:border-indigo-200 bg-white shadow-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800 truncate">{f.name || f.metaFormId}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        f.branchId ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {f.branchId ? branchesMap[f.branchId] || 'Assigned' : 'Inherits Page Branch'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">Form ID: {f.metaFormId}</p>
                  </div>

                  <div className="w-full sm:w-56 shrink-0">
                    <CustomSelect
                      value={f.branchId || ''}
                      placeholder="Select branch..."
                      options={[
                        { value: '', label: 'Inherit Page Branch' },
                        ...branches.map((b: any) => ({ value: b._id, label: b.name })),
                      ]}
                      onChange={(val) => handleAssign('form', f._id, val)}
                      disabled={savingId === f._id}
                      compact
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        <div className="pt-3 border-t border-slate-200 flex justify-end">
          <Button onClick={onClose} size="sm">
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default IntegrationsPage;

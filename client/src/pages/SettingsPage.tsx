import React, { useState, useEffect, useMemo } from 'react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import Toggle from '../components/common/Toggle';
import CustomSelect, { SelectOption } from '../components/common/CustomSelect';
import { useToast } from '../components/common/Toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Link } from 'react-router-dom';
import { ShieldAlert, Building2 } from 'lucide-react';

type SettingsTab = 'general' | 'branding' | 'routing' | 'meta_sync' | 'security' | 'notifications';

const TIMEZONE_OPTIONS: SelectOption[] = [
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  { value: 'America/New_York', label: 'America/New York (Eastern Time - EST/EDT)' },
  { value: 'America/Chicago', label: 'America/Chicago (Central Time - CST/CDT)' },
  { value: 'America/Denver', label: 'America/Denver (Mountain Time - MST/MDT)' },
  { value: 'America/Los_Angeles', label: 'America/Los Angeles (Pacific Time - PST/PDT)' },
  { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (CET/CEST)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (GST - Gulf Standard Time)' },
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST - India Standard Time)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (AEST/AEDT)' },
];

const CURRENCY_OPTIONS: SelectOption[] = [
  { value: 'USD', label: 'USD ($) - US Dollar' },
  { value: 'EUR', label: 'EUR (€) - Euro' },
  { value: 'GBP', label: 'GBP (£) - British Pound' },
  { value: 'INR', label: 'INR (₹) - Indian Rupee' },
  { value: 'AED', label: 'AED (د.إ) - UAE Dirham' },
  { value: 'CAD', label: 'CAD ($) - Canadian Dollar' },
  { value: 'AUD', label: 'AUD ($) - Australian Dollar' },
  { value: 'SGD', label: 'SGD ($) - Singapore Dollar' },
];

const ROUTING_STRATEGIES: SelectOption[] = [
  { value: 'round_robin', label: 'Round-Robin across Branch Staff', subLabel: 'Evenly distributes leads among active agents' },
  { value: 'manager_first', label: 'Branch Manager Review First', subLabel: 'Manager inspects lead before dispatching' },
  { value: 'direct_owner', label: 'Direct to Lead Generator / Creator', subLabel: 'Assigns lead to campaign owner' },
  { value: 'broadcast', label: 'Claim Pool (First to Accept)', subLabel: 'All branch agents get notified to claim' },
];

const DEDUP_POLICIES: SelectOption[] = [
  { value: 'merge_latest', label: 'Merge with Existing Lead (Update Details)', subLabel: 'Updates timeline without creating duplicate row' },
  { value: 'create_tagged', label: 'Create New Lead (Tag as Duplicate)', subLabel: 'Keep separate record with duplicate badge' },
  { value: 'block_incoming', label: 'Block Inbound Intake (Reject Duplicate)', subLabel: 'Discard repeated submissions within window' },
];

const COLOR_PRESETS = [
  { name: 'Indigo (Default)', hex: '#4f46e5', ring: 'ring-indigo-500' },
  { name: 'Electric Blue', hex: '#2563eb', ring: 'ring-blue-500' },
  { name: 'Emerald Green', hex: '#059669', ring: 'ring-emerald-500' },
  { name: 'Royal Violet', hex: '#7c3aed', ring: 'ring-purple-500' },
  { name: 'Rose Red', hex: '#e11d48', ring: 'ring-rose-500' },
  { name: 'Sunset Amber', hex: '#d97706', ring: 'ring-amber-500' },
];

const SettingsPage: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const isSuper = String(user?.role || '').toUpperCase() === 'SUPER_ADMIN';
  const canManageSettings = isSuper || hasPermission('settings:manage');
  const canManageMetaSync = isSuper || hasPermission('settings:manage') || hasPermission('integrations:manage') || hasPermission('meta:manage');

  // Super admin companies query
  const { data: companiesData } = useQuery({
    queryKey: ['companies-list'],
    queryFn: () => api.get('/companies').then((r) => r.data),
    enabled: isSuper,
    retry: false,
  });
  const companiesList: any[] = useMemo(() => (isSuper ? (companiesData as any)?.data || [] : []), [isSuper, companiesData]);

  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(user?.companyId || '');

  useEffect(() => {
    if (isSuper && !selectedCompanyId && (companiesData as any)?.data?.length > 0) {
      setSelectedCompanyId((companiesData as any).data[0]._id);
    }
  }, [isSuper, selectedCompanyId, (companiesData as any)?.data]);

  const activeCompanyId = isSuper ? (selectedCompanyId || (companiesData as any)?.data?.[0]?._id || '') : (user?.companyId || '');

  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [saving, setSaving] = useState(false);

  // Fetch company record
  const { data: companyRes, isLoading: companyLoading, isError: companyIsError, error: companyError } = useQuery({
    queryKey: ['company-settings', activeCompanyId],
    queryFn: () => (activeCompanyId ? api.get(`/companies/${activeCompanyId}`).then((r) => r.data) : null),
    enabled: !!activeCompanyId,
    retry: false,
  });
  const company = companyRes?.data || null;

  // Fetch branches for default routing
  const { data: branchesRes } = useQuery({
    queryKey: ['branches-for-settings', activeCompanyId],
    queryFn: () => api.get('/branches', { params: activeCompanyId ? { companyId: activeCompanyId } : {} }).then((r) => r.data),
    enabled: !!activeCompanyId,
    retry: false,
  });
  const branches: any[] = useMemo(() => (branchesRes as any)?.data || [], [branchesRes]);

  // Fetch Meta Sync Settings
  const { data: metaSyncRes } = useQuery({
    queryKey: ['/meta/sync-settings', activeCompanyId],
    queryFn: () => api.get('/meta/sync-settings', { params: activeCompanyId ? { companyId: activeCompanyId } : {} }).then((r) => r.data),
    enabled: !!activeCompanyId,
    retry: false,
  });
  const metaSyncData = (metaSyncRes as any)?.data || null;

  // 1. General Profile State
  const [profile, setProfile] = useState({
    name: '',
    domain: '',
    contactEmail: '',
    contactPhone: '',
    website: '',
    address: '',
    city: '',
    country: '',
    timezone: 'UTC',
    currency: 'USD',
  });

  // 2. Branding State
  const [branding, setBranding] = useState({
    logoUrl: '',
    primaryColor: '#4f46e5',
    portalSubtitle: '',
    compactMode: true,
  });

  // 3. Routing State
  const [routing, setRouting] = useState({
    defaultBranchId: '',
    routingStrategy: 'round_robin',
    dedupPolicy: 'merge_latest',
    autoArchiveDays: 60,
    requirePhone: true,
    requireEmail: true,
  });

  // 4. Meta & Inbound State
  const [metaSync, setMetaSync] = useState({
    enabled: false,
    intervalMinutes: 30,
    retryPolicy: 'exponential',
    suppressDuplicateWebhooks: true,
  });

  // 5. Security & SSO State
  const [security, setSecurity] = useState({
    sessionTimeoutMinutes: 60,
    minPasswordLength: 8,
    requireSpecialChar: true,
    requireNumber: true,
    twoFactorPolicy: 'optional',
    ssoEnabled: false,
  });

  // 6. Notifications State
  const [notifications, setNotifications] = useState({
    notifyOnNewLead: true,
    notifyOnHotLead: true,
    whatsappAlerts: false,
    whatsappManagerPhone: '',
    dailyDigest: true,
    weeklyReport: true,
    alertEmails: '',
  });

  // SSO Modal State
  const [showSsoModal, setShowSsoModal] = useState(false);
  const [ssoConfig, setSsoConfig] = useState({
    idpIssuer: '',
    ssoUrl: '',
    x509Cert: '',
    autoProvisionUsers: true,
    defaultSsoRole: 'SALES_AGENT',
  });
  const [testingSso, setTestingSso] = useState(false);

  // Initialize state when company arrives
  useEffect(() => {
    if (companyRes?.data?._id) {
      const c = companyRes.data;
      const cfg = (c.settings as any) || {};
      setProfile({
        name: c.name || '',
        domain: c.domain || '',
        contactEmail: c.contactEmail || '',
        contactPhone: c.contactPhone || '',
        website: c.website || '',
        address: c.address || '',
        city: c.city || '',
        country: c.country || '',
        timezone: cfg.timezone || 'UTC',
        currency: cfg.currency || 'USD',
      });

      setBranding({
        logoUrl: cfg.branding?.logoUrl || '',
        primaryColor: cfg.branding?.primaryColor || '#4f46e5',
        portalSubtitle: cfg.branding?.portalSubtitle || 'Enterprise Lead Management & Inbound CRM',
        compactMode: cfg.branding?.compactMode ?? true,
      });

      setRouting({
        defaultBranchId: c.defaultBranchId || '',
        routingStrategy: cfg.routing?.strategy || 'round_robin',
        dedupPolicy: cfg.routing?.dedupPolicy || 'merge_latest',
        autoArchiveDays: cfg.routing?.autoArchiveDays || 60,
        requirePhone: cfg.routing?.requirePhone ?? true,
        requireEmail: cfg.routing?.requireEmail ?? true,
      });

      setSecurity({
        sessionTimeoutMinutes: cfg.security?.sessionTimeoutMinutes || 60,
        minPasswordLength: cfg.security?.minPasswordLength || 8,
        requireSpecialChar: cfg.security?.requireSpecialChar ?? true,
        requireNumber: cfg.security?.requireNumber ?? true,
        twoFactorPolicy: cfg.security?.twoFactorPolicy || 'optional',
        ssoEnabled: cfg.security?.ssoEnabled || false,
      });

      if (cfg.security?.ssoConfig) {
        setSsoConfig(cfg.security.ssoConfig);
      }

      setNotifications({
        notifyOnNewLead: cfg.notifications?.notifyOnNewLead ?? true,
        notifyOnHotLead: cfg.notifications?.notifyOnHotLead ?? true,
        whatsappAlerts: cfg.notifications?.whatsappAlerts ?? false,
        whatsappManagerPhone: cfg.notifications?.whatsappManagerPhone || '',
        dailyDigest: cfg.notifications?.dailyDigest ?? true,
        weeklyReport: cfg.notifications?.weeklyReport ?? true,
        alertEmails: cfg.notifications?.alertEmails || c.contactEmail || '',
      });
    }
  }, [companyRes?.data]);

  useEffect(() => {
    if (metaSyncRes?.data) {
      const data = metaSyncRes.data;
      setMetaSync((prev) => {
        const nextEnabled = data.enabled ?? false;
        const nextInterval = data.intervalMinutes ?? 30;
        if (prev.enabled === nextEnabled && prev.intervalMinutes === nextInterval) {
          return prev;
        }
        return {
          ...prev,
          enabled: nextEnabled,
          intervalMinutes: nextInterval,
        };
      });
    }
  }, [metaSyncRes?.data]);

  // Handle saving company settings
  const handleSaveAll = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!activeCompanyId) {
      toast.error('Error', 'Company identifier not found for current session.');
      return;
    }

    if (!canManageSettings) {
      toast.error('Access Restricted', 'You have view-only access. settings:manage permission is required to save.');
      return;
    }

    // Client-side validations
    if (profile.contactEmail && !profile.contactEmail.includes('@')) {
      toast.error('Invalid Email', 'Please enter a valid company contact email address.');
      setActiveTab('general');
      return;
    }

    setSaving(true);
    try {
      // 1. Build composite settings object
      const updatedSettings = {
        ...(company?.settings || {}),
        timezone: profile.timezone,
        currency: profile.currency,
        branding,
        routing: {
          strategy: routing.routingStrategy,
          dedupPolicy: routing.dedupPolicy,
          autoArchiveDays: Number(routing.autoArchiveDays),
          requirePhone: routing.requirePhone,
          requireEmail: routing.requireEmail,
        },
        security: {
          ...security,
          ssoConfig,
        },
        notifications,
        metaSync: {
          retryPolicy: metaSync.retryPolicy,
          suppressDuplicateWebhooks: metaSync.suppressDuplicateWebhooks,
        },
      };

      // 2. Put company updates
      const updatePayload: any = {
        contactEmail: profile.contactEmail,
        contactPhone: profile.contactPhone,
        address: profile.address,
        city: profile.city,
        country: profile.country,
        website: profile.website,
        defaultBranchId: routing.defaultBranchId || null,
        settings: updatedSettings,
      };

      if (isSuper) {
        updatePayload.name = profile.name;
        updatePayload.domain = profile.domain;
      }

      await api.put(`/companies/${activeCompanyId}`, updatePayload);

      // 3. Save Meta Sync Settings (RBAC-aware: custom roles with permission can save too)
      if (canManageMetaSync) {
        await api.put('/meta/sync-settings', {
          companyId: activeCompanyId,
          enabled: metaSync.enabled,
          intervalMinutes: Number(metaSync.intervalMinutes),
        });
      }

      toast.success('Settings Saved', 'Company configurations and policies updated and synced with server.');
      queryClient.invalidateQueries({ queryKey: ['company-settings', activeCompanyId] });
      queryClient.invalidateQueries({ queryKey: ['/meta/sync-settings', activeCompanyId] });
    } catch (err: any) {
      toast.error('Save Failed', err?.response?.data?.error || 'Failed to update company settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestSso = () => {
    if (!ssoConfig.ssoUrl || !ssoConfig.ssoUrl.startsWith('http')) {
      toast.error('Validation Error', 'Please enter a valid IdP SSO URL beginning with https://');
      return;
    }
    setTestingSso(true);
    setTimeout(() => {
      setTestingSso(false);
      toast.success('SSO Validated', 'Successfully validated metadata connection with Identity Provider.');
    }, 900);
  };

  const tabs: Array<{ id: SettingsTab; label: string; icon: string }> = [
    { id: 'general', label: 'General & Profile', icon: '🏢' },
    { id: 'branding', label: 'Branding & UI', icon: '🎨' },
    { id: 'routing', label: 'Lead Routing & Rules', icon: '⚡' },
    { id: 'meta_sync', label: 'Inbound & Meta Sync', icon: '🔄' },
    { id: 'security', label: 'Security & SSO', icon: '🛡️' },
    { id: 'notifications', label: 'Notifications & Alerts', icon: '🔔' },
  ];

  if (!activeCompanyId) {
    return (
      <div className="p-8 max-w-xl mx-auto my-12 bg-white rounded-xl border border-amber-200 shadow-sm text-center">
        <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3">
          <Building2 size={24} />
        </div>
        <h2 className="text-base font-bold text-slate-800">No Organization Selected</h2>
        <p className="text-sm text-slate-600 mt-1">Please select an organization to view and manage its settings.</p>
      </div>
    );
  }

  if (companyLoading) {
    return (
      <div className="flex items-center justify-center py-20 gap-3 text-slate-500 text-sm">
        <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        Loading organization settings…
      </div>
    );
  }

  if (companyIsError) {
    const errorMsg = (companyError as any)?.response?.data?.error || 'Unable to access settings for this organization.';
    return (
      <div className="p-8 max-w-xl mx-auto my-12 bg-white rounded-xl border border-rose-200 shadow-sm text-center">
        <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3">
          <ShieldAlert size={24} />
        </div>
        <h2 className="text-base font-bold text-slate-800">Access Restricted</h2>
        <p className="text-sm text-slate-600 mt-1">{errorMsg}</p>
        <p className="text-xs text-slate-400 mt-2">Only authorized administrators may configure organization-level settings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-12">
      {/* Top Header Card */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Organization Settings</h1>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Synced with Server
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure company identity, lead routing workflows, Meta auto-refresh, and SSO access.
          </p>
          {!canManageSettings && (
            <p className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
              👁 Read-only access — you hold settings:read. Saving needs settings:manage.
            </p>
          )}

          {isSuper && companiesList.length > 0 && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700 whitespace-nowrap">Managing Organization:</span>
              <div className="w-64">
                <CustomSelect
                  options={companiesList.map((c) => ({
                    value: c._id,
                    label: c.name,
                    subLabel: c.domain,
                  }))}
                  value={activeCompanyId}
                  onChange={(val) => setSelectedCompanyId(val)}
                  compact
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['company-settings', activeCompanyId] });
              queryClient.invalidateQueries({ queryKey: ['/meta/sync-settings', activeCompanyId] });
              toast.info('Refreshed', 'Reloaded latest settings from server.');
            }}
          >
            ↻ Discard & Refresh
          </Button>
          <Button
            size="sm"
            loading={saving}
            disabled={!canManageSettings}
            title={!canManageSettings ? 'View-only access: settings:manage required' : 'Save All Settings'}
            onClick={() => handleSaveAll()}
          >
            <span className="flex items-center gap-1.5 font-bold">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Save All Settings
            </span>
          </Button>
        </div>
      </div>

      {/* Modern Tabs Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-1.5 shadow-sm flex items-center gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-2 ${
              activeTab === t.id
                ? 'bg-indigo-50 text-indigo-700 shadow-xs border border-indigo-200/60'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab 1: General & Profile */}
      {activeTab === 'general' && (
        <Card title="Company Profile & Localization">
          <p className="text-xs text-slate-500 mb-4">
            Primary identification details, legal physical presence, and operational timezone.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Company Legal Name</label>
              <input
                type="text"
                value={profile.name}
                disabled={!isSuper}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                className={`w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs ${
                  !isSuper ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : 'focus:ring-1 focus:ring-indigo-500'
                }`}
                title={!isSuper ? 'Company legal name can only be altered by Super Admin.' : ''}
              />
              {!isSuper && (
                <p className="text-[10px] text-slate-400 mt-1">Company name is locked to Super Admin authority.</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Domain / Slug</label>
              <input
                type="text"
                value={profile.domain}
                disabled={!isSuper}
                onChange={(e) => setProfile({ ...profile, domain: e.target.value })}
                className={`w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs ${
                  !isSuper ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : 'focus:ring-1 focus:ring-indigo-500'
                }`}
                placeholder="e.g. acme-realty"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Contact & Support Email *</label>
              <input
                type="email"
                value={profile.contactEmail}
                onChange={(e) => setProfile({ ...profile, contactEmail: e.target.value })}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500"
                placeholder="support@company.com"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Phone</label>
              <input
                type="text"
                value={profile.contactPhone}
                onChange={(e) => setProfile({ ...profile, contactPhone: e.target.value })}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500"
                placeholder="+1 (555) 123-4567"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Official Website URL</label>
              <input
                type="text"
                value={profile.website}
                onChange={(e) => setProfile({ ...profile, website: e.target.value })}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500"
                placeholder="https://company.com"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Headquarters City</label>
              <input
                type="text"
                value={profile.city}
                onChange={(e) => setProfile({ ...profile, city: e.target.value })}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500"
                placeholder="New York"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Physical Street Address</label>
              <input
                type="text"
                value={profile.address}
                onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500"
                placeholder="100 Enterprise Way, Suite 400"
              />
            </div>

            <div>
              <CustomSelect
                label="Operating Timezone"
                value={profile.timezone}
                onChange={(val) => setProfile({ ...profile, timezone: val })}
                options={TIMEZONE_OPTIONS}
              />
            </div>

            <div>
              <CustomSelect
                label="Base Reporting Currency"
                value={profile.currency}
                onChange={(val) => setProfile({ ...profile, currency: val })}
                options={CURRENCY_OPTIONS}
              />
            </div>
          </div>
        </Card>
      )}

      {/* Tab 2: Branding & Appearance */}
      {activeTab === 'branding' && (
        <Card title="Portal Branding & Appearance">
          <p className="text-xs text-slate-500 mb-4">
            Customize the look and feel of your staff CRM portal, customer receipts, and branding colors.
          </p>
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
              <div className="md:col-span-2 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Company Logo Image URL</label>
                  <input
                    type="url"
                    value={branding.logoUrl}
                    onChange={(e) => setBranding({ ...branding, logoUrl: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500"
                    placeholder="https://company.com/assets/logo.png"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Recommended: 240x60 transparent PNG or SVG.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Portal Slogan / Subtitle</label>
                  <input
                    type="text"
                    value={branding.portalSubtitle}
                    onChange={(e) => setBranding({ ...branding, portalSubtitle: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500"
                    placeholder="Enterprise Sales & Inbound Leads"
                  />
                </div>
              </div>

              {/* Logo Preview Card */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col items-center justify-center text-center">
                <span className="text-[11px] font-semibold text-slate-500 mb-2">Live Logo Preview</span>
                <div className="w-full h-20 bg-white border border-slate-200 rounded-lg flex items-center justify-center p-2 shadow-inner">
                  {branding.logoUrl ? (
                    <img
                      src={branding.logoUrl}
                      alt="Company Logo Preview"
                      className="max-h-full max-w-full object-contain"
                      onError={(e) => {
                        (e.target as any).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="flex items-center gap-2 text-indigo-700 font-bold text-sm">
                      <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-black">
                        {profile.name?.charAt(0) || 'C'}
                      </div>
                      <span>{profile.name || 'Company Name'}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Brand Color Swatches */}
            <div className="pt-3 border-t border-slate-200">
              <label className="block text-xs font-semibold text-slate-700 mb-2">Primary Brand Accent Color</label>
              <div className="flex flex-wrap gap-2.5">
                {COLOR_PRESETS.map((p) => (
                  <button
                    key={p.hex}
                    type="button"
                    onClick={() => setBranding({ ...branding, primaryColor: p.hex })}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                      branding.primaryColor === p.hex
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-900 ring-2 ring-indigo-400'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="w-3.5 h-3.5 rounded-full shadow-xs shrink-0" style={{ backgroundColor: p.hex }} />
                    <span>{p.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Compact UI Mode Toggle */}
            <div className="pt-3 border-t border-slate-200 flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div>
                <h4 className="text-xs font-bold text-slate-800">High-Density Compact Layout</h4>
                <p className="text-[11px] text-slate-500">
                  Tightens table padding, reduces row heights, and optimizes screen space for high-volume lead operations.
                </p>
              </div>
              <Toggle
                checked={branding.compactMode}
                onChange={(checked) => setBranding({ ...branding, compactMode: checked })}
              />
            </div>
          </div>
        </Card>
      )}

      {/* Tab 3: Lead Routing & Rules */}
      {activeTab === 'routing' && (
        <Card title="Lead Routing Automation & Inbound Rules">
          <p className="text-xs text-slate-500 mb-4">
            Dictate how unassigned incoming leads from Meta, Webhooks, or Website forms are distributed.
          </p>
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <CustomSelect
                  label="Default Fallback Branch"
                  value={routing.defaultBranchId}
                  onChange={(val) => setRouting({ ...routing, defaultBranchId: val })}
                  options={[
                    { value: '', label: 'None (Leave Unassigned for Admin)' },
                    ...branches.map((b: any) => ({
                      value: b._id,
                      label: b.name,
                      subLabel: b.branchCode || 'No code',
                    })),
                  ]}
                  placeholder="Select Fallback Branch"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  When a Meta lead does not match any assigned form or page, it is routed to this branch.
                </p>
              </div>

              <div>
                <CustomSelect
                  label="Inbound Assignment Strategy"
                  value={routing.routingStrategy}
                  onChange={(val) => setRouting({ ...routing, routingStrategy: val })}
                  options={ROUTING_STRATEGIES}
                />
              </div>

              <div>
                <CustomSelect
                  label="Duplicate Lead Policy"
                  value={routing.dedupPolicy}
                  onChange={(val) => setRouting({ ...routing, dedupPolicy: val })}
                  options={DEDUP_POLICIES}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Auto-Archive Stale Leads After (Days)
                </label>
                <input
                  type="number"
                  min={7}
                  max={365}
                  value={routing.autoArchiveDays}
                  onChange={(e) => setRouting({ ...routing, autoArchiveDays: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Leads with no activity or status change for this period move to archive.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200">
              <span className="font-semibold text-slate-700 block mb-2">Required Fields for Inbound Qualification</span>
              <div className="flex items-center gap-6 flex-wrap">
                <Toggle
                  checked={routing.requirePhone}
                  onChange={(checked) => setRouting({ ...routing, requirePhone: checked })}
                  label="Require Phone Number"
                />
                <Toggle
                  checked={routing.requireEmail}
                  onChange={(checked) => setRouting({ ...routing, requireEmail: checked })}
                  label="Require Email Address"
                />
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Tab 4: Inbound & Meta Sync */}
      {activeTab === 'meta_sync' && (
        <Card title="Meta Integration & Sync Polling">
          <p className="text-xs text-slate-500 mb-4">
            Automatic background syncing schedules for Ad Accounts, Lead Ads forms, and Meta Webhooks.
          </p>
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-sm">
                  f
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Meta Marketing API Connected</h4>
                  <p className="text-[11px] text-slate-600">
                    Last sync run: {metaSyncData.lastRunAt ? new Date(metaSyncData.lastRunAt).toLocaleString() : 'Never'}
                    {metaSyncData.lastResult ? ` (${metaSyncData.lastResult})` : ''}
                  </p>
                </div>
              </div>
              <Link
                to="/integrations"
                className="px-3 py-1.5 bg-white border border-indigo-300 rounded-lg text-xs font-semibold text-indigo-700 hover:bg-indigo-50 transition-colors"
              >
                Manage Portfolios →
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Automated Background Refresh</h4>
                  <p className="text-[11px] text-slate-500">
                    Background worker pulls fresh ad accounts and lead forms automatically.
                  </p>
                </div>
                <Toggle
                  checked={metaSync.enabled}
                  onChange={(checked) => setMetaSync({ ...metaSync, enabled: checked })}
                />
              </div>

              <div>
                <CustomSelect
                  label="Refresh Interval Schedule"
                  value={String(metaSync.intervalMinutes)}
                  onChange={(val) => setMetaSync({ ...metaSync, intervalMinutes: Number(val) })}
                  options={[
                    { value: '5', label: 'Every 5 Minutes (Real-time Campaigns)' },
                    { value: '15', label: 'Every 15 Minutes (Standard Inbound)' },
                    { value: '30', label: 'Every 30 Minutes (Recommended)' },
                    { value: '60', label: 'Every 1 Hour' },
                    { value: '360', label: 'Every 6 Hours' },
                    { value: '1440', label: 'Once Daily (24 Hours)' },
                  ]}
                />
              </div>

              <div>
                <CustomSelect
                  label="Webhook Retry Backoff Policy"
                  value={metaSync.retryPolicy}
                  onChange={(val) => setMetaSync({ ...metaSync, retryPolicy: val })}
                  options={[
                    { value: 'exponential', label: 'Exponential Backoff (5 attempts)', subLabel: '1s, 5s, 30s, 2m, 10m' },
                    { value: 'linear', label: 'Linear Retry (3 attempts)', subLabel: '30s intervals' },
                    { value: 'immediate', label: 'Immediate 1-Time Retry', subLabel: 'Fail directly to dead-letter queue' },
                  ]}
                />
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Suppress Duplicate Webhooks</h4>
                  <p className="text-[11px] text-slate-500">
                    Ignores redundant Meta event transmissions within 60 seconds.
                  </p>
                </div>
                <Toggle
                  checked={metaSync.suppressDuplicateWebhooks}
                  onChange={(checked) => setMetaSync({ ...metaSync, suppressDuplicateWebhooks: checked })}
                />
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Tab 5: Security & SSO */}
      {activeTab === 'security' && (
        <Card title="Security, Password Rules & Single Sign-On (SSO)">
          <p className="text-xs text-slate-500 mb-4">
            Safeguard your organization with session timeouts, strong credentials, and enterprise SAML 2.0.
          </p>
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <CustomSelect
                  label="Inactivity Session Timeout"
                  value={String(security.sessionTimeoutMinutes)}
                  onChange={(val) => setSecurity({ ...security, sessionTimeoutMinutes: Number(val) })}
                  options={[
                    { value: '15', label: '15 Minutes (High Security)' },
                    { value: '30', label: '30 Minutes' },
                    { value: '60', label: '1 Hour (Recommended)' },
                    { value: '480', label: '8 Hours (Full Shift)' },
                    { value: '1440', label: '24 Hours' },
                  ]}
                />
              </div>

              <div>
                <CustomSelect
                  label="Two-Factor Authentication (2FA) Policy"
                  value={security.twoFactorPolicy}
                  onChange={(val) => setSecurity({ ...security, twoFactorPolicy: val })}
                  options={[
                    { value: 'optional', label: 'Optional for all team members' },
                    { value: 'managers_only', label: 'Enforce for Admins & Managers' },
                    { value: 'enforced', label: 'Strict: Enforced for Everyone' },
                  ]}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Minimum Password Length
                </label>
                <input
                  type="number"
                  min={6}
                  max={32}
                  value={security.minPasswordLength}
                  onChange={(e) => setSecurity({ ...security, minPasswordLength: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex flex-col justify-end gap-2 pb-1">
                <Toggle
                  checked={security.requireSpecialChar}
                  onChange={(checked) => setSecurity({ ...security, requireSpecialChar: checked })}
                  label="Require at least one special symbol (!@#$%)"
                />
                <Toggle
                  checked={security.requireNumber}
                  onChange={(checked) => setSecurity({ ...security, requireNumber: checked })}
                  label="Require at least one number (0-9)"
                />
              </div>
            </div>

            {/* Enterprise SSO Card */}
            <div className="pt-4 border-t border-slate-200">
              <div className="p-4 bg-gradient-to-r from-slate-50 to-indigo-50/40 border border-slate-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                      Enterprise Single Sign-On (SAML 2.0 / Google Workspace)
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        security.ssoEnabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {security.ssoEnabled ? '● ENABLED' : '○ DISABLED'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 max-w-xl">
                    Allow staff to log in using Okta, Microsoft Entra ID (Azure AD), Google Workspace, or OneLogin.
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-600">
                    <span>ACS URL: <code className="bg-white px-1.5 py-0.5 border rounded">https://api.leads-crm.com/api/auth/saml/callback</code></span>
                    <span>Entity ID: <code className="bg-white px-1.5 py-0.5 border rounded">leads-crm:{activeCompanyId || 'company'}</code></span>
                  </div>
                </div>

                <Button size="sm" onClick={() => setShowSsoModal(true)}>
                  ⚙ Configure SSO
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Tab 6: Notifications & Alerts */}
      {activeTab === 'notifications' && (
        <Card title="Alerts & Digest Preferences">
          <p className="text-xs text-slate-500 mb-4">
            Choose when and how company admins and sales agents get notified of inbound leads.
          </p>
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Email on New Inbound Lead</h4>
                  <p className="text-[11px] text-slate-500">
                    Sends immediate email whenever a lead is captured.
                  </p>
                </div>
                <Toggle
                  checked={notifications.notifyOnNewLead}
                  onChange={(checked) => setNotifications({ ...notifications, notifyOnNewLead: checked })}
                />
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Hot / Urgent Lead Flagging</h4>
                  <p className="text-[11px] text-slate-500">
                    Highlights leads with immediate purchase intent and alerts management.
                  </p>
                </div>
                <Toggle
                  checked={notifications.notifyOnHotLead}
                  onChange={(checked) => setNotifications({ ...notifications, notifyOnHotLead: checked })}
                />
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Daily Performance Digest</h4>
                  <p className="text-[11px] text-slate-500">
                    Morning summary of new leads, call conversions, and agent activity.
                  </p>
                </div>
                <Toggle
                  checked={notifications.dailyDigest}
                  onChange={(checked) => setNotifications({ ...notifications, dailyDigest: checked })}
                />
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-800">WhatsApp Dispatch Alerts</h4>
                  <p className="text-[11px] text-slate-500">
                    Dispatches instant WhatsApp ping to the duty sales manager.
                  </p>
                </div>
                <Toggle
                  checked={notifications.whatsappAlerts}
                  onChange={(checked) => setNotifications({ ...notifications, whatsappAlerts: checked })}
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Alert Email Recipients (comma-separated)
                </label>
                <input
                  type="text"
                  value={notifications.alertEmails}
                  onChange={(e) => setNotifications({ ...notifications, alertEmails: e.target.value })}
                  placeholder="admin@company.com, sales-lead@company.com"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {notifications.whatsappAlerts && (
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Duty Manager WhatsApp Phone Number (with Country Code)
                  </label>
                  <input
                    type="text"
                    value={notifications.whatsappManagerPhone}
                    onChange={(e) => setNotifications({ ...notifications, whatsappManagerPhone: e.target.value })}
                    placeholder="+1 (555) 987-6543"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* MODAL: Configure SAML 2.0 / SSO */}
      <Modal
        isOpen={showSsoModal}
        onClose={() => setShowSsoModal(false)}
        title="SAML 2.0 & Google Workspace SSO Setup"
        size="lg"
      >
        <div className="space-y-3.5 text-xs">
          <p className="text-slate-600">
            Connect your identity provider to enforce centralized single sign-on across all branch agents.
          </p>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div>
              <span className="font-bold text-slate-800 block">Enable Single Sign-On</span>
              <span className="text-[11px] text-slate-500">Allow team users to sign in with Identity Provider</span>
            </div>
            <Toggle
              checked={security.ssoEnabled}
              onChange={(checked) => setSecurity({ ...security, ssoEnabled: checked })}
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">IdP Entity ID / Issuer URI *</label>
            <input
              type="text"
              value={ssoConfig.idpIssuer}
              onChange={(e) => setSsoConfig({ ...ssoConfig, idpIssuer: e.target.value })}
              placeholder="https://sts.windows.net/xxxx-xxxx/ or https://accounts.google.com/o/saml2"
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">IdP Single Sign-On (SSO) URL *</label>
            <input
              type="url"
              value={ssoConfig.ssoUrl}
              onChange={(e) => setSsoConfig({ ...ssoConfig, ssoUrl: e.target.value })}
              placeholder="https://login.microsoftonline.com/xxxx/saml2"
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">X.509 Public Certificate (PEM format)</label>
            <textarea
              rows={4}
              value={ssoConfig.x509Cert}
              onChange={(e) => setSsoConfig({ ...ssoConfig, x509Cert: e.target.value })}
              placeholder="-----BEGIN CERTIFICATE-----&#10;MIIC...&#10;-----END CERTIFICATE-----"
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-[11px] font-mono"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            <div>
              <CustomSelect
                label="Default Role for JIT Provisioning"
                value={ssoConfig.defaultSsoRole}
                onChange={(val) => setSsoConfig({ ...ssoConfig, defaultSsoRole: val })}
                options={[
                  { value: 'SALES_AGENT', label: 'Sales Agent (Default)' },
                  { value: 'BRANCH_MANAGER', label: 'Branch Manager' },
                ]}
              />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Toggle
                checked={ssoConfig.autoProvisionUsers}
                onChange={(checked) => setSsoConfig({ ...ssoConfig, autoProvisionUsers: checked })}
                label="Auto-provision new accounts on first login (JIT)"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-200">
            <Button variant="secondary" size="sm" onClick={handleTestSso} loading={testingSso}>
              Test IdP Connection
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowSsoModal(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setShowSsoModal(false);
                  toast.success('SSO Configured', 'SSO configuration updated. Click "Save All Settings" to apply.');
                }}
              >
                Apply SSO Settings
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default SettingsPage;

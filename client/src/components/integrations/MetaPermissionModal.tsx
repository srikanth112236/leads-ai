import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import ConfirmModal from '../common/ConfirmModal';
import Button from '../common/Button';
import { useToast } from '../common/Toast';
import api from '../../services/api';

export interface ScopeItem {
  key: string;
  label: string;
  description: string;
}

export interface ScopeGroup {
  group: string;
  description: string;
  scopes: ScopeItem[];
}

export const META_SCOPE_GROUPS: ScopeGroup[] = [
  {
    group: 'Lead Ads & Campaigns',
    description: 'Required to sync campaigns, discover ad accounts, and download lead forms.',
    scopes: [
      { key: 'ads_read', label: 'View Ads & Insights', description: 'Read ad accounts, campaigns, ads, and performance metrics.' },
      { key: 'ads_management', label: 'Manage Ads', description: 'Create and configure campaigns and ad accounts.' },
      { key: 'leads_retrieval', label: 'Lead Retrieval', description: 'Fetch leads submitted through Facebook Instant Forms.' },
    ],
  },
  {
    group: 'WhatsApp Business',
    description: 'Required for customer messaging and WhatsApp Business integration.',
    scopes: [
      { key: 'whatsapp_business_messaging', label: 'Send & Receive Messages', description: 'Send and receive customer messages via WhatsApp Cloud API.' },
      { key: 'whatsapp_business_management', label: 'Manage WhatsApp Business', description: 'Manage WABA phone numbers and message templates.' },
    ],
  },
  {
    group: 'Facebook Pages',
    description: 'Required to discover business pages and subscribe to lead notifications.',
    scopes: [
      { key: 'pages_show_list', label: 'List Pages', description: 'Discover pages administered by this account.' },
      { key: 'pages_manage_metadata', label: 'Manage Page Metadata', description: 'Subscribe to webhooks and real-time lead alerts.' },
      { key: 'pages_manage_ads', label: 'Manage Page Ads', description: 'Link ads and lead forms to Facebook Pages.' },
      { key: 'pages_read_engagement', label: 'Read Engagement', description: 'Read page comments, reactions, and interactions.' },
    ],
  },
  {
    group: 'Business Portfolio',
    description: 'Required for multi-asset business portfolios and enterprise account sync.',
    scopes: [
      { key: 'business_management', label: 'Business Management', description: 'Access owned and client ad accounts under the Business Portfolio.' },
    ],
  },
];

export const ALL_SCOPE_KEYS = META_SCOPE_GROUPS.flatMap((g) => g.scopes.map((s) => s.key));

interface MetaPermissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  integration: any;
  onUpdated: () => void;
}

const MetaPermissionModal: React.FC<MetaPermissionModalProps> = ({
  isOpen,
  onClose,
  integration,
  onUpdated,
}) => {
  const toast = useToast();
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(new Set(ALL_SCOPE_KEYS));
  const [grantedScopes, setGrantedScopes] = useState<string[]>([]);
  const [declinedScopes, setDeclinedScopes] = useState<string[]>([]);
  const [auditing, setAuditing] = useState(false);
  const [revokingScope, setRevokingScope] = useState<string | null>(null);
  const [batchRevoking, setBatchRevoking] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [pendingRevoke, setPendingRevoke] = useState<{ keys: string[]; title: string; message: string } | null>(null);

  useEffect(() => {
    if (integration) {
      const granted: string[] = integration.metadata?.grantedScopes || integration.scopes || [];
      const declined: string[] = integration.metadata?.declinedScopes || [];
      setGrantedScopes(granted);
      setDeclinedScopes(declined);

      // In UI, declined permissions must be deselected by default.
      let initialScopes: string[];
      if (Array.isArray(integration.desiredScopes) && integration.desiredScopes.length > 0) {
        initialScopes = integration.desiredScopes.filter((s: string) => !declined.includes(s));
      } else if (granted.length > 0) {
        initialScopes = granted.filter((s: string) => !declined.includes(s));
      } else {
        initialScopes = ALL_SCOPE_KEYS.filter((s: string) => !declined.includes(s));
      }
      setSelectedScopes(new Set(initialScopes));
    }
  }, [integration]);

  const toggleScope = (key: string) => {
    const next = new Set(selectedScopes);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setSelectedScopes(next);
  };

  const selectAll = () => setSelectedScopes(new Set(ALL_SCOPE_KEYS));
  const deselectAll = () => setSelectedScopes(new Set());
  const selectDefaults = () => {
    const recommended = [
      'ads_read', 'ads_management', 'leads_retrieval',
      'pages_manage_metadata', 'pages_show_list',
      'business_management', 'whatsapp_business_messaging',
    ];
    setSelectedScopes(new Set(recommended.filter((s) => !declinedScopes.includes(s))));
  };

  const auditLivePermissions = async () => {
    if (!integration?._id) return;
    setAuditing(true);
    try {
      const res = await api.post('/meta/permissions/audit', { integrationId: integration._id });
      const data = res?.data?.data || {};
      const newGranted: string[] = data.grantedScopes || [];
      const newDeclined: string[] = data.declinedScopes || [];
      setGrantedScopes(newGranted);
      setDeclinedScopes(newDeclined);
      setSelectedScopes(new Set(newGranted.filter((s: string) => !newDeclined.includes(s))));
      toast.success('Permissions Audited', `Audited ${newGranted.length} granted and ${newDeclined.length} declined permissions from Meta.`);
      onUpdated();
    } catch (err: any) {
      toast.error('Audit Failed', err?.response?.data?.error || 'Could not audit permissions from Meta');
    } finally {
      setAuditing(false);
    }
  };

  const executeRevoke = async (keys: string[]) => {
    if (!integration?._id || keys.length === 0) return;
    if (keys.length === 1) {
      const permissionKey = keys[0];
      setRevokingScope(permissionKey);
      try {
        await api.post('/meta/permissions/revoke', {
          integrationId: integration._id,
          permission: permissionKey,
        });
        toast.success('Permission Revoked', `Successfully revoked '${permissionKey}' on Meta.`);
        
        setGrantedScopes((prev) => prev.filter((s) => s !== permissionKey));
        setDeclinedScopes((prev) => (prev.includes(permissionKey) ? prev : [...prev, permissionKey]));
        setSelectedScopes((prev) => {
          const next = new Set(prev);
          next.delete(permissionKey);
          return next;
        });
        onUpdated();
      } catch (err: any) {
        toast.error('Revoke Failed', err?.response?.data?.error || `Failed to revoke permission '${permissionKey}'`);
      } finally {
        setRevokingScope(null);
      }
    } else {
      setBatchRevoking(true);
      try {
        const res = await api.post('/meta/permissions/revoke', {
          integrationId: integration._id,
          permissions: keys,
        });
        const revokedCount = res?.data?.revoked?.length || keys.length;
        toast.success('Permissions Revoked', `Successfully revoked ${revokedCount} permission(s) on Meta.`);

        setGrantedScopes((prev) => prev.filter((s) => !keys.includes(s)));
        setDeclinedScopes((prev) => {
          const next = [...prev];
          for (const k of keys) {
            if (!next.includes(k)) next.push(k);
          }
          return next;
        });
        setSelectedScopes((prev) => {
          const next = new Set(prev);
          for (const k of keys) next.delete(k);
          return next;
        });
        onUpdated();
      } catch (err: any) {
        toast.error('Revoke Failed', err?.response?.data?.error || 'Failed to revoke permissions on Meta');
      } finally {
        setBatchRevoking(false);
      }
    }
  };

  const handleRevoke = (permissionKey: string) => {
    setPendingRevoke({
      keys: [permissionKey],
      title: 'Revoke Permission',
      message: `Revoke permission '${permissionKey}' from Meta? This portfolio will lose access to this capability immediately.`,
    });
  };

  const handleRevokeBatch = (keys: string[]) => {
    setPendingRevoke({
      keys,
      title: 'Direct Revoke Permissions',
      message: `Revoke ${keys.length} permission(s) (${keys.join(', ')}) immediately from Meta without requiring re-login?`,
    });
  };

  const startOAuth = async (scopes: string[], authType: 'reauthenticate' | 'rerequest', forceConfirmation: boolean = false) => {
    setAuthorizing(true);
    try {
      const params = new URLSearchParams();
      params.set('scopes', scopes.join(','));
      params.set('auth_type', authType);
      if (forceConfirmation) {
        params.set('force_confirmation', 'true');
      }
      if (integration?._id) {
        params.set('integrationId', integration._id);
      }

      const res = await api.get(`/meta/oauth/start?${params.toString()}`);
      const dialogUrl = res?.data?.data?.dialogUrl;
      if (dialogUrl) {
        window.location.href = dialogUrl;
      } else {
        toast.error('OAuth Error', 'No dialog URL returned from server.');
      }
    } catch (err: any) {
      toast.error('OAuth Failed', err?.response?.data?.error || 'Failed to initialize Meta OAuth dialog.');
    } finally {
      setAuthorizing(false);
    }
  };

  const handleApplyChanges = async () => {
    if (selectedScopes.size === 0) {
      toast.error('No Scopes Selected', 'Please select at least one permission.');
      return;
    }

    const selected = Array.from(selectedScopes);
    const toRevoke = grantedScopes.filter((g) => !selectedScopes.has(g));
    const toAdd = selected.filter((s) => !grantedScopes.includes(s));
    const noChanges = toRevoke.length === 0 && toAdd.length === 0;

    if (noChanges) {
      toast.success('No Changes', 'Your permissions already match. Nothing to update.');
      onClose();
      return;
    }

    try {
      setAuthorizing(true);
      const res = await api.post(`/meta/integrations/${integration._id}/sync-scopes`, {
        desiredScopes: selected,
        authType: 'rerequest',
      });
      const data = res?.data?.data || {};
      if (data.needsOAuth && data.dialogUrl) {
        if (data.revoked?.length > 0) {
          toast.success('Permissions Updated', `Revoked ${data.revoked.length} scope(s). Redirecting to Meta for new permissions…`);
        }
        window.location.href = data.dialogUrl;
      } else {
        toast.success('Permissions Synchronized', data.message || 'Permissions updated successfully without re-login.');
        onUpdated();
        onClose();
      }
    } catch (err: any) {
      toast.error('Sync Failed', err?.response?.data?.error || 'Failed to synchronize scopes with Meta.');
    } finally {
      setAuthorizing(false);
    }
  };

  const portfolioLabel = integration?.label || (integration?.portfolioBusinessId ? `Portfolio ${integration.portfolioBusinessId}` : 'Meta Portfolio');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Permissions & Scope Manager — ${portfolioLabel}`}
      size="xl"
    >
      <div className="space-y-4">
        {/* Top Info Banner */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="font-semibold text-slate-800">Fine-grained OAuth Scope Management</p>
            <p>
              Enable or disable permissions needed by this portfolio. Click <strong>Re-authenticate & Confirm</strong> to prompt Meta's authentication and asset selection dialog, or revoke already-granted permissions individually.
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={auditLivePermissions}
            loading={auditing}
            className="shrink-0 text-xs"
          >
            <span className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Audit from Meta
            </span>
          </Button>
        </div>

        {/* Quick Selection Toolbar */}
        <div className="flex items-center justify-between text-xs text-slate-500 border-b border-slate-200 pb-2">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-700">Quick Select:</span>
            <button
              type="button"
              onClick={selectAll}
              className="text-blue-600 hover:text-blue-800 font-medium hover:underline"
            >
              All
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={selectDefaults}
              className="text-blue-600 hover:text-blue-800 font-medium hover:underline"
            >
              Recommended
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={deselectAll}
              className="text-slate-500 hover:text-slate-700 hover:underline"
            >
              Clear
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500" /> {grantedScopes.length} Granted
            </span>
            {declinedScopes.length > 0 && (
              <span className="inline-flex items-center gap-1 text-rose-700 font-medium">
                <span className="w-2 h-2 rounded-full bg-rose-500" /> {declinedScopes.length} Declined
              </span>
            )}
            <span className="text-slate-400 font-medium">
              {selectedScopes.size} of {ALL_SCOPE_KEYS.length} Selected
            </span>
          </div>
        </div>

        {/* Scope Groups */}
        <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
          {META_SCOPE_GROUPS.map((group) => (
            <div key={group.group} className="border border-slate-200 rounded-lg overflow-hidden bg-white">
              <div className="bg-slate-50/80 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">{group.group}</h4>
                  <p className="text-[11px] text-slate-500">{group.description}</p>
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                {group.scopes.map((scope) => {
                  const isChecked = selectedScopes.has(scope.key);
                  const isGranted = grantedScopes.includes(scope.key);
                  const isDeclined = declinedScopes.includes(scope.key);
                  const isRevoking = revokingScope === scope.key;

                  return (
                    <div
                      key={scope.key}
                      className={`p-3 flex items-start justify-between gap-3 transition-colors ${
                        isChecked ? 'bg-blue-50/30' : 'hover:bg-slate-50/50'
                      }`}
                    >
                      <label className="flex items-start gap-3 cursor-pointer flex-1 select-none">
                        <span className={`mt-1 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${isChecked ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}>
                          {isChecked && (
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </span>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleScope(scope.key)}
                          className="sr-only"
                          aria-label={scope.label}
                        />
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-900">{scope.label}</span>
                            <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                              {scope.key}
                            </span>
                            {isGranted && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                                Granted
                              </span>
                            )}
                            {isDeclined && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                <svg className="w-3 h-3 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                Declined
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 leading-snug">{scope.description}</p>
                        </div>
                      </label>

                      {/* If granted, offer direct programmatic Revoke */}
                      {isGranted && (
                        <div className="shrink-0 pt-0.5">
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => handleRevoke(scope.key)}
                            loading={isRevoking}
                            className="text-xs py-1 px-2.5"
                          >
                            Revoke
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Unchecked Permissions Alert with Instant Direct Revoke */}
        {(() => {
          const uncheckedGranted = grantedScopes.filter((g) => !selectedScopes.has(g));
          if (uncheckedGranted.length === 0) return null;
          return (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>
                  <strong>{uncheckedGranted.length} active permission{uncheckedGranted.length === 1 ? '' : 's'} unchecked:</strong>{' '}
                  <span className="font-mono text-[11px]">{uncheckedGranted.join(', ')}</span>
                </span>
              </div>
              <Button
                size="sm"
                variant="danger"
                onClick={() => handleRevokeBatch(uncheckedGranted)}
                loading={batchRevoking}
                className="shrink-0 text-xs py-1"
              >
                Direct Revoke ({uncheckedGranted.length}) [No Login]
              </Button>
            </div>
          );
        })()}

        {/* Modal Footer Controls */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-200">
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={onClose} disabled={authorizing || batchRevoking}>
              Cancel
            </Button>
            <button
              type="button"
              onClick={() => startOAuth(Array.from(selectedScopes), 'rerequest', true)}
              disabled={authorizing || batchRevoking}
              className="text-xs text-slate-500 hover:text-slate-800 underline disabled:opacity-50"
              title="Forces Meta to display the asset selection picker to add or change ad accounts and pages"
            >
              Re-select Assets & Pages
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Contextual hint about what Apply will do */}
            {(() => {
              const toRevoke = grantedScopes.filter((g) => !selectedScopes.has(g));
              const toAdd = Array.from(selectedScopes).filter((s) => !grantedScopes.includes(s));
              if (toRevoke.length > 0 && toAdd.length === 0) {
                return <span className="text-xs text-emerald-600 mr-2">✓ No login needed — direct revoke</span>;
              }
              if (toAdd.length > 0 && toRevoke.length === 0) {
                return <span className="text-xs text-blue-600 mr-2">→ Will redirect to Meta for {toAdd.length} new scope{toAdd.length > 1 ? 's' : ''}</span>;
              }
              if (toRevoke.length > 0 && toAdd.length > 0) {
                return <span className="text-xs text-amber-600 mr-2">Revoke {toRevoke.length}, then redirect for {toAdd.length} new</span>;
              }
              return null;
            })()}
            <Button
              variant="primary"
              onClick={handleApplyChanges}
              loading={authorizing || batchRevoking}
              title="Intelligently applies changes: revokes removed permissions directly via API (no login), only redirects to Meta when adding new permissions"
            >
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Apply Changes
              </span>
            </Button>
          </div>
        </div>
      </div>

      {/* Revoke Confirmation Modal */}
      <ConfirmModal
        isOpen={!!pendingRevoke}
        onClose={() => setPendingRevoke(null)}
        onConfirm={async () => {
          if (pendingRevoke) {
            const keys = pendingRevoke.keys;
            setPendingRevoke(null);
            await executeRevoke(keys);
          }
        }}
        title={pendingRevoke?.title || 'Revoke Permission'}
        message={pendingRevoke?.message || ''}
        confirmText="Revoke from Meta"
        variant="danger"
        loading={!!revokingScope || batchRevoking}
      />
    </Modal>
  );
};

export default MetaPermissionModal;


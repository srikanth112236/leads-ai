import React, { useState, useMemo, useEffect } from 'react';
import {
  ArrowLeft,
  X,
  Search,
  Check,
  Shield,
  Lock,
  Sparkles,
  Layers,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import Button from '../common/Button';

export interface PermissionItem {
  key: string;
  name: string;
  module: string;
  description: string;
}

export interface RoleItem {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  companyId?: string | null;
  permissions: string[];
  isSystem: boolean;
  rank: number;
  isActive: boolean;
  userCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface RoleDrawerProps {
  isOpen: boolean;
  mode: 'create' | 'edit' | 'view';
  role: RoleItem | null;
  allPermissions: PermissionItem[];
  modulesList: string[];
  moduleLabels: Record<string, { label: string; icon: string; description: string }>;
  saving: boolean;
  onSave: (draft: { name: string; description: string; permissions: string[] }) => void;
  onClose: () => void;
  onError: (message: string, description?: string) => void;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  onClose: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class RoleDrawerErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('RoleDrawer error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800">Something went wrong in the permissions drawer</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {this.state.error?.message || 'An unexpected error occurred while rendering permissions.'}
          </p>
          <Button variant="secondary" onClick={this.props.onClose} type="button">
            Back to Roles
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export const RoleDrawer: React.FC<RoleDrawerProps> = ({
  isOpen,
  mode,
  role,
  allPermissions = [],
  modulesList = [],
  moduleLabels = {},
  saving,
  onSave,
  onClose,
  onError,
}) => {
  // Safe normalization of catalog
  const catalog = useMemo(() => {
    if (!Array.isArray(allPermissions)) return [];
    return allPermissions.filter((p) => p && typeof p.key === 'string');
  }, [allPermissions]);

  // Form states
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedModule, setSelectedModule] = useState<string>('all');
  const [nameError, setNameError] = useState('');

  // Initial permissions calculation
  const initialPermissions = useMemo(() => {
    if (!role) return [];
    const perms = Array.isArray(role.permissions) ? role.permissions : [];
    if (perms.includes('*')) {
      return catalog.map((p) => p.key);
    }
    return [...perms];
  }, [role, catalog]);

  // Sync state whenever drawer opens or target role changes
  useEffect(() => {
    if (isOpen) {
      setName(role?.name || '');
      setDescription(role?.description || '');
      setSelected(initialPermissions);
      setSelectedModule('all');
      setSearchQuery('');
      setNameError('');
    }
  }, [isOpen, role, initialPermissions]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent background scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Group permissions by module
  const permissionsByModule = useMemo(() => {
    const map: Record<string, PermissionItem[]> = {};
    for (const p of catalog) {
      const mod = p.module || 'other';
      if (!map[mod]) map[mod] = [];
      map[mod].push(p);
    }
    return map;
  }, [catalog]);

  // Compute available modules (ordered by modulesList, plus extras)
  const availableModules = useMemo(() => {
    const list = Array.isArray(modulesList) ? modulesList : [];
    const fromList = list.filter((m) => (permissionsByModule[m] || []).length > 0);
    const others = Object.keys(permissionsByModule).filter((m) => !list.includes(m));
    return [...fromList, ...others];
  }, [modulesList, permissionsByModule]);

  // Quick lookup set for selected keys
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  // Filter permission item by search query
  const matchesSearch = (p: PermissionItem) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.key && p.key.toLowerCase().includes(q)) ||
      (p.description && p.description.toLowerCase().includes(q))
    );
  };

  // Toggle single permission
  const handleTogglePermission = (key: string) => {
    if (mode === 'view') return;
    setSelected((prev) => {
      const set = new Set(prev);
      if (set.has(key)) {
        set.delete(key);
      } else {
        set.add(key);
      }
      return Array.from(set);
    });
  };

  // Select all permissions
  const handleSelectAll = () => {
    if (mode === 'view') return;
    setSelected(catalog.map((p) => p.key));
  };

  // Clear all permissions
  const handleClearAll = () => {
    if (mode === 'view') return;
    setSelected([]);
  };

  // Toggle all permissions in a specific module
  const handleToggleModule = (modKey: string) => {
    if (mode === 'view') return;
    const modPermKeys = (permissionsByModule[modKey] || []).map((p) => p.key);
    if (modPermKeys.length === 0) return;

    const allModChosen = modPermKeys.every((k) => selectedSet.has(k));
    setSelected((prev) => {
      const set = new Set(prev);
      if (allModChosen) {
        modPermKeys.forEach((k) => set.delete(k));
      } else {
        modPermKeys.forEach((k) => set.add(k));
      }
      return Array.from(set);
    });
  };

  // Form submission
  const handleSave = () => {
    if (mode === 'view') return;
    if (!name.trim()) {
      setNameError('Role name is required');
      onError('Role name required', 'Please provide a name for this role.');
      return;
    }
    setNameError('');
    onSave({
      name: name.trim(),
      description: description.trim(),
      permissions: selected,
    });
  };

  if (!isOpen) return null;

  // Compute stats for current module or search
  const currentModulePerms =
    selectedModule === 'all'
      ? catalog
      : permissionsByModule[selectedModule] || [];

  const shownPerms = currentModulePerms.filter(matchesSearch);

  return (
    <RoleDrawerErrorBoundary onClose={onClose}>
      <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity duration-300"
          onClick={onClose}
          aria-hidden="true"
        />

        {/* Drawer slide-over panel */}
        <div
          className="relative w-full sm:max-w-2xl lg:max-w-3xl xl:max-w-4xl bg-white shadow-2xl z-10 flex flex-col h-full transform transition-transform duration-300 ease-in-out border-l border-slate-200"
          role="dialog"
          aria-modal="true"
        >
          {/* Top Sticky Header */}
          <div className="px-6 py-4 border-b border-slate-200 bg-white sticky top-0 z-20 flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3 min-w-0">
              {/* Back to Roles Button */}
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded-lg transition-colors border border-slate-200 shrink-0"
                title="Back to roles list"
              >
                <ArrowLeft className="w-4 h-4 text-slate-600" />
                <span>Back to Roles</span>
              </button>

              <div className="h-5 w-px bg-slate-200 shrink-0 hidden sm:block" />

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900 truncate">
                    {mode === 'create'
                      ? 'Create Custom Role'
                      : mode === 'edit'
                      ? `Edit Role: ${role?.name || ''}`
                      : `Role Details: ${role?.name || ''}`}
                  </h2>

                  {role?.isSystem ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0">
                      <Lock className="w-3 h-3" /> System Role
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                      <Sparkles className="w-3 h-3" /> Custom Role
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5 truncate">
                  {mode === 'view'
                    ? 'Review granted permissions and access scope'
                    : 'Manage identity, module permissions, and company access controls'}
                </p>
              </div>
            </div>

            {/* Close (X) button */}
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 p-2 rounded-lg hover:bg-slate-100 transition-colors shrink-0"
              aria-label="Close drawer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Drawer Scrollable Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* 1. Role Identity Form */}
            <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-indigo-600" />
                  Role Profile
                </span>
                {role?.slug && (
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-white text-slate-600 border border-slate-200">
                    slug: {role.slug}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Role Name <span className="text-rose-500">*</span>
                  </label>
                  {mode === 'view' ? (
                    <div className="text-sm font-semibold text-slate-900 bg-white px-3 py-2 rounded-lg border border-slate-200">
                      {name || 'Untitled Role'}
                    </div>
                  ) : (
                    <div>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value);
                          if (nameError) setNameError('');
                        }}
                        disabled={role?.isSystem}
                        placeholder="e.g. Senior Telecaller, Operations Supervisor"
                        className={`w-full px-3 py-2 text-sm bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors ${
                          nameError ? 'border-rose-400 bg-rose-50/30' : 'border-slate-300'
                        } ${role?.isSystem ? 'bg-slate-100 text-slate-600 cursor-not-allowed' : ''}`}
                      />
                      {nameError && <p className="text-xs text-rose-500 mt-1">{nameError}</p>}
                    </div>
                  )}
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Description
                  </label>
                  {mode === 'view' ? (
                    <div className="text-xs text-slate-600 bg-white px-3 py-2 rounded-lg border border-slate-200 italic min-h-[40px]">
                      {description || 'No description provided.'}
                    </div>
                  ) : (
                    <textarea
                      rows={2}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe the scope of responsibilities and permissions for this role..."
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
                    />
                  )}
                </div>
              </div>

              {role?.isSystem && mode !== 'view' && (
                <div className="flex items-start gap-2 bg-indigo-50/60 p-2.5 rounded-lg border border-indigo-100 text-indigo-800 text-xs">
                  <Lock className="w-4 h-4 shrink-0 mt-0.5 text-indigo-600" />
                  <span>
                    System role identities cannot be renamed, but you can configure granted permissions.
                  </span>
                </div>
              )}
            </div>

            {/* 2. Permissions Header & Search Bar */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-600" />
                    Permissions Matrix
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Select the granular privileges granted to users assigned to this role.
                  </p>
                </div>

                {/* Bulk Actions */}
                {mode !== 'view' && (
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="px-2.5 py-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg border border-indigo-200/80 transition-colors"
                    >
                      Select All ({catalog.length})
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAll}
                      className="px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
                    >
                      Clear All
                    </button>
                  </div>
                )}
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter permissions by name, key (e.g. leads:read), or description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                    aria-label="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* 3. Module Filter Navigation Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 no-scrollbar text-xs">
                {/* All tab */}
                <button
                  type="button"
                  onClick={() => setSelectedModule('all')}
                  className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 border ${
                    selectedModule === 'all'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <span>All Modules</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      selectedModule === 'all'
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {selected.length}/{catalog.length}
                  </span>
                </button>

                {/* Module-specific tabs */}
                {availableModules.map((mod) => {
                  const meta = moduleLabels[mod] || { label: mod, icon: '📦' };
                  const modPerms = permissionsByModule[mod] || [];
                  const modGranted = modPerms.filter((p) => selectedSet.has(p.key)).length;
                  const isActiveTab = selectedModule === mod;

                  return (
                    <button
                      key={mod}
                      type="button"
                      onClick={() => setSelectedModule(mod)}
                      className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 border ${
                        isActiveTab
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <span>{meta.icon}</span>
                      <span>{meta.label}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                          isActiveTab
                            ? 'bg-white/20 text-white'
                            : modGranted > 0
                            ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {modGranted}/{modPerms.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4. Permissions List */}
            {catalog.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs text-slate-500">Loading platform permissions catalog...</p>
              </div>
            ) : shownPerms.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <Search className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <h4 className="text-sm font-semibold text-slate-800">No permissions match your search</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  Try adjusting your search terms or switch to "All Modules".
                </p>
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="mt-3 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                  >
                    Clear search filter
                  </button>
                )}
              </div>
            ) : selectedModule === 'all' ? (
              /* View all modules grouped */
              <div className="space-y-5">
                {availableModules.map((mod) => {
                  const meta = moduleLabels[mod] || {
                    label: mod,
                    icon: '📦',
                    description: '',
                  };
                  const modPerms = permissionsByModule[mod] || [];
                  const shownInMod = modPerms.filter(matchesSearch);
                  if (shownInMod.length === 0) return null;

                  const modGranted = modPerms.filter((p) => selectedSet.has(p.key)).length;
                  const allChosen = modPerms.length > 0 && modGranted === modPerms.length;

                  return (
                    <div
                      key={mod}
                      className="bg-white rounded-xl border border-slate-200/90 overflow-hidden shadow-xs"
                    >
                      {/* Module Sub-Header */}
                      <div className="px-4 py-3 bg-slate-50/70 border-b border-slate-200/80 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-base leading-none">{meta.icon}</span>
                          <div>
                            <span className="text-xs font-bold text-slate-900">{meta.label}</span>
                            {meta.description && (
                              <p className="text-[11px] text-slate-500 hidden sm:block truncate max-w-md">
                                {meta.description}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-medium text-slate-500">
                            {modGranted} of {modPerms.length}
                          </span>
                          {mode !== 'view' && (
                            <button
                              type="button"
                              onClick={() => handleToggleModule(mod)}
                              className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border transition-colors ${
                                allChosen
                                  ? 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                                  : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                              }`}
                            >
                              {allChosen ? 'Deselect Module' : 'Select Module'}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Permission Cards Grid */}
                      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {shownInMod.map((perm) => {
                          const isSelected = selectedSet.has(perm.key);
                          return (
                            <div
                              key={perm.key}
                              onClick={() => handleTogglePermission(perm.key)}
                              role={mode === 'view' ? 'article' : 'button'}
                              tabIndex={mode === 'view' ? -1 : 0}
                              onKeyDown={(e) => {
                                if (mode !== 'view' && (e.key === ' ' || e.key === 'Enter')) {
                                  e.preventDefault();
                                  handleTogglePermission(perm.key);
                                }
                              }}
                              className={`group relative p-3 rounded-lg border text-left transition-all ${
                                mode !== 'view' ? 'cursor-pointer select-none' : ''
                              } ${
                                isSelected
                                  ? 'bg-indigo-50/70 border-indigo-300 ring-1 ring-indigo-500/20 shadow-xs'
                                  : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
                              }`}
                            >
                              <div className="flex items-start gap-2.5">
                                {/* Checkbox Indicator */}
                                <div
                                  className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                    isSelected
                                      ? 'bg-indigo-600 border-indigo-600 text-white'
                                      : 'bg-white border-slate-300 group-hover:border-slate-400'
                                  }`}
                                >
                                  {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between gap-1">
                                    <span
                                      className={`text-xs font-bold leading-tight ${
                                        isSelected ? 'text-indigo-950' : 'text-slate-900'
                                      }`}
                                    >
                                      {perm.name}
                                    </span>
                                  </div>
                                  {perm.description && (
                                    <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                                      {perm.description}
                                    </p>
                                  )}
                                  <span className="font-mono text-[10px] text-slate-400 mt-1 inline-block">
                                    {perm.key}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* View specific module */
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">
                      {moduleLabels[selectedModule]?.icon || '📦'}
                    </span>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">
                        {moduleLabels[selectedModule]?.label || selectedModule}
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        {moduleLabels[selectedModule]?.description || ''}
                      </p>
                    </div>
                  </div>

                  {mode !== 'view' && (
                    <button
                      type="button"
                      onClick={() => handleToggleModule(selectedModule)}
                      className="text-xs font-semibold px-2.5 py-1 rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                    >
                      {currentModulePerms.every((p) => selectedSet.has(p.key))
                        ? 'Deselect All in Module'
                        : 'Select All in Module'}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {shownPerms.map((perm) => {
                    const isSelected = selectedSet.has(perm.key);
                    return (
                      <div
                        key={perm.key}
                        onClick={() => handleTogglePermission(perm.key)}
                        role={mode === 'view' ? 'article' : 'button'}
                        tabIndex={mode === 'view' ? -1 : 0}
                        onKeyDown={(e) => {
                          if (mode !== 'view' && (e.key === ' ' || e.key === 'Enter')) {
                            e.preventDefault();
                            handleTogglePermission(perm.key);
                          }
                        }}
                        className={`group relative p-3 rounded-lg border text-left transition-all ${
                          mode !== 'view' ? 'cursor-pointer select-none' : ''
                        } ${
                          isSelected
                            ? 'bg-indigo-50/70 border-indigo-300 ring-1 ring-indigo-500/20 shadow-xs'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <div
                            className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                              isSelected
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : 'bg-white border-slate-300 group-hover:border-slate-400'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>

                          <div className="min-w-0 flex-1">
                            <span
                              className={`text-xs font-bold leading-tight block ${
                                isSelected ? 'text-indigo-950' : 'text-slate-900'
                              }`}
                            >
                              {perm.name}
                            </span>
                            {perm.description && (
                              <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                                {perm.description}
                              </p>
                            )}
                            <span className="font-mono text-[10px] text-slate-400 mt-1 inline-block">
                              {perm.key}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Sticky Drawer Footer */}
          <div className="px-6 py-4 bg-white border-t border-slate-200 sticky bottom-0 z-20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
            {/* Live Progress Summary */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-semibold text-slate-800">
                  <span className="font-bold text-indigo-600">{selected.length}</span> of{' '}
                  {catalog.length} privileges granted
                </span>
              </div>

              <div className="hidden md:block w-32 bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                <div
                  className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${
                      catalog.length > 0 ? (selected.length / catalog.length) * 100 : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 justify-end">
              <Button variant="secondary" size="sm" onClick={onClose} type="button">
                {mode === 'view' ? 'Close' : 'Cancel'}
              </Button>

              {mode !== 'view' && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSave}
                  loading={saving}
                  type="button"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-xs"
                >
                  {mode === 'create' ? 'Create Role' : 'Save Changes'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </RoleDrawerErrorBoundary>
  );
};

export default RoleDrawer;

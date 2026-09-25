import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Sparkles, Lock, Users, Plus, Search, Eye, Edit3, Trash2 } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/common/Toast';
import ConfirmModal from '../components/common/ConfirmModal';
import Button from '../components/common/Button';
import RoleDrawer, { RoleItem, PermissionItem } from '../components/roles/RoleDrawer';

const MODULE_LABELS: Record<string, { label: string; icon: string; description: string }> = {
  leads: {
    label: 'Leads & Pipeline',
    icon: '👥',
    description: 'Lead records, creation, status editing, assignment, and CSV exports',
  },
  branches: {
    label: 'Branch Management',
    icon: '🏢',
    description: 'Branch locations, regional office configurations, and team routing',
  },
  users: {
    label: 'Users & Team',
    icon: '👤',
    description: 'Employee user profiles, provisioning, and branch membership',
  },
  campaigns: {
    label: 'Marketing & Campaigns',
    icon: '📊',
    description: 'Meta ad campaigns, branch-level spend analytics, and routing',
  },
  integrations: {
    label: 'Integrations & Webhooks',
    icon: '🔌',
    description: 'Website forms, webhook delivery logs, and WhatsApp connectors',
  },
  roles: {
    label: 'Roles & RBAC',
    icon: '🛡️',
    description: 'Role creation, privilege assignment, and access control policies',
  },
  audit_settings: {
    label: 'Audit & Settings',
    icon: '⚙️',
    description: 'Company-level settings, security parameters, and audit log inspection',
  },
};

export const RolesPage: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const isSuper = user?.role === 'SUPER_ADMIN';
  const isCompanyAdmin = user?.role === 'COMPANY_ADMIN';
  const canCreateRole = isSuper || isCompanyAdmin || hasPermission('roles:create');
  const canUpdateRole = isSuper || isCompanyAdmin || hasPermission('roles:update');
  const canDeleteRole = isSuper || isCompanyAdmin || hasPermission('roles:delete');

  const NO_CREATE_ROLE_PERMISSION =
    'You do not have permission to create custom roles. Please contact your company administrator to request access.';
  const NO_UPDATE_ROLE_PERMISSION =
    'You do not have permission to edit roles or modify permissions. Please contact your company administrator to request access.';
  const NO_DELETE_ROLE_PERMISSION =
    'You do not have permission to delete roles. Please contact your company administrator to request access.';

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Drawer state for Create / Edit / View
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit' | 'view'>('create');
  const [activeRole, setActiveRole] = useState<RoleItem | null>(null);

  // Deleting role state
  const [deletingRole, setDeletingRole] = useState<RoleItem | null>(null);

  // 1. Fetch available roles
  const { data: rolesData, isLoading: rolesLoading } = useQuery<{ success: boolean; data: RoleItem[] }>({
    queryKey: ['rbac-roles'],
    queryFn: () => api.get('/rbac/roles').then((res) => res.data),
  });
  const roles = useMemo(() => {
    return Array.isArray(rolesData?.data) ? rolesData.data : [];
  }, [rolesData]);

  // 2. Fetch permission definitions catalog
  const { data: permissionsData } = useQuery<{
    success: boolean;
    data: { modules: string[]; permissions: PermissionItem[] };
  }>({
    queryKey: ['rbac-permissions'],
    queryFn: () => api.get('/rbac/permissions').then((res) => res.data),
  });

  const allPermissions = useMemo(() => {
    return Array.isArray(permissionsData?.data?.permissions) ? permissionsData.data.permissions : [];
  }, [permissionsData]);

  const modulesList = useMemo(() => {
    return Array.isArray(permissionsData?.data?.modules) ? permissionsData.data.modules : [];
  }, [permissionsData]);

  // Group permissions by module for quick lookups in card tags
  const permissionsByModule = useMemo(() => {
    const map: Record<string, PermissionItem[]> = {};
    for (const p of allPermissions) {
      if (!p || typeof p.key !== 'string') continue;
      const mod = p.module || 'other';
      if (!map[mod]) map[mod] = [];
      map[mod].push(p);
    }
    return map;
  }, [allPermissions]);

  // Filtered roles
  const filteredRoles = useMemo(() => {
    if (!searchQuery.trim()) return roles;
    const q = searchQuery.toLowerCase();
    return roles.filter(
      (r) =>
        (r.name && r.name.toLowerCase().includes(q)) ||
        (r.slug && r.slug.toLowerCase().includes(q)) ||
        (r.description && r.description.toLowerCase().includes(q))
    );
  }, [roles, searchQuery]);

  // Mutations
  const createMutation = useMutation({
    mutationFn: (newRole: { name: string; description: string; permissions: string[] }) =>
      api.post('/rbac/roles', newRole).then((res) => res.data),
    onSuccess: () => {
      toast.success('Role created successfully');
      queryClient.invalidateQueries({ queryKey: ['rbac-roles'] });
      closeDrawer();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to create role');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<RoleItem> }) =>
      api.put(`/rbac/roles/${id}`, data).then((res) => res.data),
    onSuccess: () => {
      toast.success('Role updated successfully');
      queryClient.invalidateQueries({ queryKey: ['rbac-roles'] });
      closeDrawer();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to update role');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/rbac/roles/${id}`).then((res) => res.data),
    onSuccess: () => {
      toast.success('Role deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['rbac-roles'] });
      setDeletingRole(null);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to delete role');
    },
  });

  // Drawer handlers
  const openCreateDrawer = () => {
    setActiveRole(null);
    setDrawerMode('create');
    setDrawerOpen(true);
  };

  const openEditDrawer = (role: RoleItem) => {
    setActiveRole(role);
    setDrawerMode('edit');
    setDrawerOpen(true);
  };

  const openViewDrawer = (role: RoleItem) => {
    setActiveRole(role);
    setDrawerMode('view');
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setActiveRole(null);
  };

  // Save Role (dispatched from Drawer)
  const handleSaveRole = (draft: { name: string; description: string; permissions: string[] }) => {
    if (drawerMode === 'edit' && activeRole) {
      updateMutation.mutate({ id: activeRole._id, data: draft });
    } else {
      createMutation.mutate(draft);
    }
  };

  // Metrics
  const systemCount = roles.filter((r) => r.isSystem).length;
  const customCount = roles.filter((r) => !r.isSystem).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
              <Shield className="w-5 h-5" />
            </span>
            Roles & Permissions (RBAC)
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage system templates, create custom company roles, and configure granular permissions across all modules.
          </p>
        </div>

        <Button
          variant="primary"
          onClick={() => {
            if (!canCreateRole) {
              toast.warning('Access Restricted', NO_CREATE_ROLE_PERMISSION);
              return;
            }
            openCreateDrawer();
          }}
          disabled={!canCreateRole}
          title={!canCreateRole ? NO_CREATE_ROLE_PERMISSION : 'Create Custom Role'}
          className={`flex items-center gap-2 shadow-sm font-semibold whitespace-nowrap ${
            !canCreateRole ? 'opacity-40 cursor-not-allowed bg-slate-200 text-slate-500 hover:bg-slate-200' : ''
          }`}
        >
          <Plus className="w-4 h-4" />
          Create Custom Role
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Roles</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{roles.length}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">System Templates</div>
          <div className="text-2xl font-bold text-indigo-600 mt-1">{systemCount}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Custom Roles</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">{customCount}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Catalog Privileges</div>
          <div className="text-2xl font-bold text-purple-600 mt-1">{allPermissions.length} items</div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            placeholder="Search roles by name or slug..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
        </div>

        <div className="text-xs text-slate-500 self-end sm:self-center">
          Showing {filteredRoles.length} of {roles.length} roles
        </div>
      </div>

      {/* Role Cards Grid */}
      {rolesLoading ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200/80">
          <div className="inline-block animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full mb-3" />
          <p className="text-slate-500 text-sm">Loading roles and permission profiles...</p>
        </div>
      ) : filteredRoles.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-slate-300">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
            <Shield className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-slate-900">No roles found</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
            {searchQuery ? 'No roles match your search criteria.' : 'Create your first custom company role to get started.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredRoles.map((role) => {
            const rolePerms = Array.isArray(role?.permissions) ? role.permissions : [];
            const isWildcard = rolePerms.includes('*');
            const permCount = isWildcard ? allPermissions.length : rolePerms.length;

            return (
              <div
                key={role._id}
                className="bg-white rounded-xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between overflow-hidden"
              >
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                        {role.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                          {role.slug}
                        </span>
                        {role.isSystem ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                            <Lock className="w-3 h-3" /> System Built-in
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <Sparkles className="w-3 h-3" /> Custom Company Role
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg bg-slate-100 text-slate-700">
                        <Users className="w-3 h-3 text-slate-500" />
                        {role.userCount ?? 0} {role.userCount === 1 ? 'user' : 'users'}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 mt-3 line-clamp-2 min-h-[32px]">
                    {role.description || 'No description provided.'}
                  </p>

                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                      <span className="font-medium text-slate-700">Granted Permissions</span>
                      <span className="font-bold text-indigo-600">
                        {isWildcard ? 'Full Access (*)' : `${permCount} of ${allPermissions.length}`}
                      </span>
                    </div>

                    {/* Module tags */}
                    <div className="flex flex-wrap gap-1">
                      {isWildcard ? (
                        <span className="text-[11px] bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-md font-medium">
                          ★ Complete System Access
                        </span>
                      ) : (
                        modulesList.map((mod) => {
                          const modPerms = permissionsByModule[mod] || [];
                          const grantedInMod = modPerms.filter((p) => rolePerms.includes(p.key)).length;
                          if (grantedInMod === 0) return null;
                          return (
                            <span
                              key={mod}
                              className="text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200"
                            >
                              {MODULE_LABELS[mod]?.label || mod} ({grantedInMod})
                            </span>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="bg-slate-50/70 px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => openViewDrawer(role)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-indigo-600 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    View Permissions
                  </button>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        if (!canUpdateRole) {
                          toast.warning('Access Restricted', NO_UPDATE_ROLE_PERMISSION);
                          return;
                        }
                        openEditDrawer(role);
                      }}
                      disabled={!canUpdateRole}
                      title={!canUpdateRole ? NO_UPDATE_ROLE_PERMISSION : 'Edit role permissions'}
                      className={`text-xs py-1 px-2.5 flex items-center gap-1 ${
                        !canUpdateRole ? 'opacity-40 cursor-not-allowed' : ''
                      }`}
                    >
                      <Edit3 className="w-3 h-3 text-slate-500" />
                      Edit Permissions
                    </Button>

                    {!role.isSystem && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          if (!canDeleteRole) {
                            toast.warning('Access Restricted', NO_DELETE_ROLE_PERMISSION);
                            return;
                          }
                          setDeletingRole(role);
                        }}
                        disabled={!canDeleteRole || (role.userCount || 0) > 0}
                        title={
                          !canDeleteRole
                            ? NO_DELETE_ROLE_PERMISSION
                            : (role.userCount || 0) > 0
                            ? 'Cannot delete role with assigned active users'
                            : 'Delete role'
                        }
                        className="text-xs py-1 px-2 text-rose-600 hover:bg-rose-50 hover:border-rose-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Role & Permissions Slide-Over Drawer (Replaces modal for Edit, Create, and View) */}
      <RoleDrawer
        isOpen={drawerOpen}
        mode={drawerMode}
        role={activeRole}
        allPermissions={allPermissions}
        modulesList={modulesList}
        moduleLabels={MODULE_LABELS}
        saving={createMutation.isPending || updateMutation.isPending}
        onSave={handleSaveRole}
        onClose={closeDrawer}
        onError={(title, message) => toast.error(title, message)}
      />

      {/* Delete Confirmation Modal */}
      {deletingRole && (
        <ConfirmModal
          isOpen={!!deletingRole}
          onClose={() => setDeletingRole(null)}
          onConfirm={() => deleteMutation.mutate(deletingRole._id)}
          title={`Delete Role: ${deletingRole.name}`}
          message="Are you sure you want to delete this custom role? Users cannot be assigned to this role once deleted."
          confirmText="Yes, Delete Role"
          variant="danger"
          loading={deleteMutation.isPending}
        />
      )}
    </div>
  );
};

export default RolesPage;

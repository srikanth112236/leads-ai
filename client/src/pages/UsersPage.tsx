import React, { useState, useCallback, useMemo } from 'react';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import ConfirmModal from '../components/common/ConfirmModal';
import CustomSelect from '../components/common/CustomSelect';
import ActionMenu, { ActionMenuItem } from '../components/common/ActionMenu';
import { useToast } from '../components/common/Toast';
import { useGet, usePost, usePut } from '../hooks/useApi';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useCompanyScope } from '../context/CompanyScopeContext';

const emptyForm = {
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  role: 'SALES_AGENT',
  branchId: '',
  branchIds: [] as string[],
  phone: '',
  companyId: '',
};

const EDITABLE_ROLES = ['SALES_AGENT', 'BRANCH_MANAGER', 'COMPANY_MANAGER', 'COMPANY_ADMIN'];

const roleBadgeStyles: Record<string, string> = {
  SUPER_ADMIN: 'bg-purple-50 text-purple-700 border-purple-200/80',
  COMPANY_ADMIN: 'bg-blue-50 text-blue-700 border-blue-200/80',
  COMPANY_MANAGER: 'bg-indigo-50 text-indigo-700 border-indigo-200/80',
  BRANCH_MANAGER: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
  SALES_AGENT: 'bg-slate-100 text-slate-700 border-slate-200/80',
};

const NO_CREATE_USER_PERMISSION = 'You do not have permission to provision new users. Please contact your company administrator to request access.';
const NO_UPDATE_USER_PERMISSION = 'You do not have permission to edit user profiles or assignments. Please contact your company administrator to request access.';
const NO_DELETE_USER_PERMISSION = 'You do not have permission to deactivate team members. Please contact your company administrator to request access.';

const UsersPage: React.FC = () => {
  const { user, activeBranchId, hasPermission } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isSuper = user?.role === 'SUPER_ADMIN';
  const isCompanyAdmin = user?.role === 'COMPANY_ADMIN';
  const canCreateUser = isSuper || isCompanyAdmin || hasPermission('users:create');
  const canUpdateUser = isSuper || isCompanyAdmin || hasPermission('users:update');
  const canDeleteUser = isSuper || isCompanyAdmin || hasPermission('users:delete');
  const canManageCampaigns = isSuper || isCompanyAdmin || hasPermission('campaigns:assign');
  const [tab, setTab] = useState<'staff' | 'companies'>('staff');
  const [campaignAccessUser, setCampaignAccessUser] = useState<any | null>(null);

  const listUrl = isSuper && tab === 'staff' ? '/users?scope=staff' : '/users';
  const { data, isLoading } = useGet(listUrl);
  const users: any[] = (data as any)?.data || [];

  const { data: companiesData } = useQuery({
    queryKey: ['companies-list'],
    queryFn: () => api.get('/companies').then((r) => r.data),
    enabled: isSuper,
    retry: false,
  });
  const companies = isSuper ? ((companiesData as any)?.data || []) : [];

  const { data: branchesData } = useQuery({
    queryKey: ['branches-for-users'],
    queryFn: () => api.get('/branches').then((r) => r.data),
    retry: false,
  });
  const branches: any[] = (branchesData as any)?.data || [];

  const { data: rbacRolesData } = useQuery({
    queryKey: ['rbac-roles'],
    queryFn: () => api.get('/rbac/roles').then((r) => r.data),
    retry: false,
  });
  const dynamicRoles: any[] = (rbacRolesData as any)?.data || [];

  const roleOptions = useMemo(() => {
    if (dynamicRoles.length > 0) {
      return dynamicRoles
        .filter((r) => {
          if (user?.role === 'BRANCH_MANAGER') {
            return r.rank > 30;
          }
          if (!isSuper && (r.slug === 'super_admin' || r.name === 'Super Admin')) {
            return false;
          }
          return true;
        })
        .map((r) => ({
          value: r.slug,
          label: r.name,
          badge: r.isSystem
            ? r.slug === 'super_admin'
              ? 'Root'
              : r.slug === 'company_admin'
              ? 'Admin'
              : undefined
            : 'Custom',
        }));
    }

    return [
      ...(user?.role === 'BRANCH_MANAGER' ? ['SALES_AGENT'] : EDITABLE_ROLES).map((r) => ({
        value: r,
        label: r.replace(/_/g, ' '),
        badge: r === 'COMPANY_ADMIN' ? 'Admin' : undefined,
      })),
      ...(isSuper ? [{ value: 'SUPER_ADMIN', label: 'SUPER ADMIN', badge: 'Root' }] : []),
    ];
  }, [dynamicRoles, user?.role, isSuper]);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');

  // Deactivate Modal State
  const [userToDeactivate, setUserToDeactivate] = useState<any | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);

  // Modal State
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [activeTab, setActiveTab] = useState<'details' | 'access'>('details');

  const { scopedCompanyId } = useCompanyScope();
  const filteredUsers = useMemo(() => {
    return users.filter((u: any) => {
      if (isSuper && scopedCompanyId && String(u.companyId) !== String(scopedCompanyId)) return false;
      if (roleFilter && u.role !== roleFilter) return false;
      if (branchFilter && u.branchId !== branchFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const name = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase();
        const email = (u.email || '').toLowerCase();
        const accessId = (u.accessId || '').toLowerCase();
        return name.includes(q) || email.includes(q) || accessId.includes(q);
      }
      return true;
    });
  }, [users, searchQuery, roleFilter, branchFilter]);

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['/users'] });
    queryClient.invalidateQueries({ queryKey: ['/users?scope=staff'] });
    queryClient.invalidateQueries({ queryKey: ['branches-for-users'] });
  }, [queryClient]);

  const handleConfirmDeactivate = async () => {
    if (!userToDeactivate) return;
    setIsDeactivating(true);
    try {
      await api.delete(`/users/${userToDeactivate._id}`);
      toast.info('Account Deactivated', `${userToDeactivate.email} has been deactivated.`);
      setUserToDeactivate(null);
      refresh();
    } catch (err: any) {
      toast.error('Deactivation Failed', err?.response?.data?.error || 'Could not deactivate account.');
    } finally {
      setIsDeactivating(false);
    }
  };

  const create = usePost('/users');
  const update = usePut(`/users/${editingId || ''}`);

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(false);
    setActiveTab('details');
  };

  const startCreate = () => {
    setEditingId(null);
    setForm({
      ...emptyForm,
      branchId: activeBranchId || '',
      branchIds: activeBranchId ? [activeBranchId] : [],
    });
    setShowForm(true);
    setActiveTab('details');
  };

  const startEdit = (u: any) => {
    setEditingId(u._id);
    const existingBranchIds: string[] = Array.isArray(u.branchIds) && u.branchIds.length > 0
      ? u.branchIds
      : (Array.isArray(u.branches) && u.branches.length > 0
        ? u.branches.map((b: any) => b.id || b._id)
        : (u.branchId ? [u.branchId] : []));

    setForm({
      email: u.email,
      password: '',
      firstName: u.firstName || '',
      lastName: u.lastName || '',
      role: u.roleId?.slug || u.role,
      branchId: u.branchId || '',
      branchIds: existingBranchIds,
      phone: u.phone || '',
      companyId: u.companyId || '',
    });
    setShowForm(true);
    setActiveTab('details');
  };

  // Step 1 -> Step 2 validation
  const goToAssignBranch = () => {
    if (isSuper && !form.companyId && !editingId) {
      toast.error('Company Required', 'Please select a company for this user.');
      return;
    }
    if (!form.email || !form.email.includes('@')) {
      toast.error('Invalid Email', 'Please provide a valid email address.');
      return;
    }
    if (!editingId && (!form.password || form.password.length < 6)) {
      toast.error('Password Required', 'Password must be at least 6 characters.');
      return;
    }
    if (!form.firstName.trim() || !form.lastName.trim()) {
      toast.error('Name Required', 'Please provide both first and last name.');
      return;
    }
    setActiveTab('access');
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();

    const onError = (err: any) => {
      const code = err?.response?.data?.code;
      const msg = err?.response?.data?.error;
      if (code === 'USER_EXISTS' || msg?.toLowerCase().includes('already exists')) {
        toast.error('Account Already Exists', `The email ${form.email} is already registered.`);
      } else {
        toast.error('Save Failed', msg || 'Could not save user account.');
      }
    };

    const onSuccess = () => {
      toast.success(
        editingId ? 'Profile Updated' : 'User Provisioned',
        editingId ? 'User account changes were saved successfully.' : `New user ${form.email} created successfully.`,
      );
      resetForm();
      refresh();
    };

    const matchingRole = dynamicRoles.find(
      (r) =>
        r.slug.toLowerCase() === form.role?.toLowerCase() ||
        (r.name && r.name.toLowerCase() === form.role?.toLowerCase())
    );
    const roleId = matchingRole ? matchingRole._id : undefined;

    if (editingId) {
      const { email, password, ...patch }: any = form;
      void email;
      void password;
      update.mutate(
        {
          ...patch,
          roleId,
          branchIds: form.branchIds,
          branchId: form.branchIds[0] || null,
        },
        { onSuccess, onError }
      );
    } else {
      create.mutate(
        isSuper
          ? { ...form, roleId, branchIds: form.branchIds, branchId: form.branchIds[0] || undefined }
          : { ...form, roleId, companyId: undefined, branchIds: form.branchIds, branchId: form.branchIds[0] || undefined },
        { onSuccess, onError }
      );
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight">Team & User Directory</h1>
          <p className="text-xs text-slate-500">Manage user access permissions, roles, and branch affiliations</p>
        </div>

        <div className="flex items-center gap-2">
          {isSuper && (
            <div className="flex p-0.5 bg-slate-100 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setTab('staff')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  tab === 'staff' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Platform Staff
              </button>
              <button
                type="button"
                onClick={() => setTab('companies')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  tab === 'companies' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Company Users
              </button>
            </div>
          )}

          <Button
            onClick={() => {
              if (!canCreateUser) {
                toast.warning('Access Restricted', NO_CREATE_USER_PERMISSION);
                return;
              }
              startCreate();
            }}
            disabled={!canCreateUser}
            title={!canCreateUser ? NO_CREATE_USER_PERMISSION : 'Provision New Team User'}
            size="sm"
            className={!canCreateUser ? 'opacity-40 cursor-not-allowed bg-slate-200 text-slate-500 hover:bg-slate-200' : ''}
          >
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New User
            </span>
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-2.5 items-stretch md:items-center">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search team member by name, email, or access ID…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-indigo-500"
          />
          <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <div className="w-48">
          <CustomSelect
            value={roleFilter}
            onChange={(val) => setRoleFilter(val)}
            options={[
              { value: '', label: 'All Roles' },
              ...roleOptions.map((r) => ({ value: r.value, label: r.label })),
            ]}
            placeholder="Filter by Role"
          />
        </div>

        <div className="w-48">
          <CustomSelect
            value={branchFilter}
            onChange={(val) => setBranchFilter(val)}
            options={[
              { value: '', label: 'All Branches' },
              ...branches.map((b: any) => ({ value: b._id, label: b.name })),
            ]}
            placeholder="Filter by Branch"
          />
        </div>

        {(searchQuery || roleFilter || branchFilter) && (
          <button
            onClick={() => {
              setSearchQuery('');
              setRoleFilter('');
              setBranchFilter('');
            }}
            className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-800 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-visible">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-slate-400 text-sm">
            <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            Loading team directory…
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <svg className="w-12 h-12 mx-auto text-slate-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <p className="text-base font-semibold text-slate-700">No users found</p>
            <p className="text-xs text-slate-400 mt-1">
              {searchQuery || roleFilter || branchFilter ? 'Try clearing your search or filters.' : 'Click "New User" to provision team members.'}
            </p>
          </div>
        ) : (
          <div className="min-h-[240px] pb-12 overflow-visible">
            <table className="w-full text-left border-collapse table-auto">
              <colgroup>
                <col className="w-[30%] min-w-[220px]" />
                <col className="w-[15%] min-w-[130px]" />
                {isSuper && tab === 'companies' && <col className="w-[15%] min-w-[130px]" />}
                <col className="w-[20%] min-w-[160px]" />
                <col className="w-[12%] min-w-[100px]" />
                <col className="w-[13%] min-w-[100px]" />
                <col className="w-[10%] min-w-[70px]" />
              </colgroup>
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
                  <th className="py-3 px-5">User</th>
                  <th className="py-3 px-4">Role</th>
                  {isSuper && tab === 'companies' && <th className="py-3 px-4">Company</th>}
                  <th className="py-3 px-4">Assigned Branch</th>
                  <th className="py-3 px-4">Access ID</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((u: any) => (
                  <UserTableRow
                    key={u._id}
                    u={u}
                    canUpdateUser={canUpdateUser}
                    canDeleteUser={canDeleteUser}
                    canManageCampaigns={canManageCampaigns}
                    showCompany={isSuper && tab === 'companies'}
                    companies={companies}
                    branches={branches}
                    dynamicRoles={dynamicRoles}
                    onEdit={() => startEdit(u)}
                    onDeactivate={() => setUserToDeactivate(u)}
                    onRefresh={refresh}
                    onCampaignAccess={() => setCampaignAccessUser(u)}
                    onView={() => navigate(`/users/${u._id}`)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: Create / Edit User with Step-by-Step Flow */}
      <Modal
        isOpen={showForm}
        onClose={resetForm}
        title={editingId ? 'Edit Team Member' : 'Provision New Team User'}
        size="lg"
      >
        <form onSubmit={submit} className="space-y-4">
          {/* Step Indicator Tabs */}
          <div className="flex gap-2 border-b border-slate-200 pb-2">
            <button
              type="button"
              onClick={() => setActiveTab('details')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'details' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">1</span>
              Profile Details
            </button>
            <button
              type="button"
              onClick={() => {
                if (!editingId) goToAssignBranch();
                else setActiveTab('access');
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'access' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-slate-300 text-slate-700 flex items-center justify-center text-[10px]">2</span>
              Role & Branch Assignment
            </button>
          </div>

          {/* Tab 1: Profile Details */}
          {activeTab === 'details' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
              {isSuper && !editingId && (
                <div className="md:col-span-2">
                  <CustomSelect
                    label="Company"
                    required
                    value={form.companyId}
                    onChange={(val) => setForm({ ...form, companyId: val })}
                    options={companies.map((c: any) => ({ value: c._id, label: c.name }))}
                    placeholder="Select Company…"
                  />
                </div>
              )}
              {!editingId && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address *</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500"
                    placeholder="user@example.com"
                    required
                  />
                </div>
              )}
              {!editingId && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Temporary Password *</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500"
                    placeholder="Min. 6 characters"
                    required
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">First Name *</label>
                <input
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500"
                  placeholder="Jane"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Last Name *</label>
                <input
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500"
                  placeholder="Doe"
                  required
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number (Optional)</label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500"
                  placeholder="+1 (555) 000-0000"
                />
              </div>
            </div>
          )}

          {/* Tab 2: Role & Branch Assignment */}
          {activeTab === 'access' && (
            <div className="space-y-4 text-xs">
              <div>
                <CustomSelect
                  label="Role & Access Profile"
                  required
                  value={form.role}
                  onChange={(val) => setForm({ ...form, role: val })}
                  options={roleOptions}
                />
                <p className="text-[11px] text-slate-400 mt-1">Controls platform permissions and lead assignment rules.</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    Assigned Branches ({form.branchIds.length} selected)
                  </label>
                  {branches.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const targetBranches = user?.role === 'BRANCH_MANAGER'
                          ? branches.filter((b: any) => user?.allowedBranchIds?.includes(b._id))
                          : branches;
                        if (form.branchIds.length === targetBranches.length) {
                          setForm({ ...form, branchIds: [], branchId: '' });
                        } else {
                          setForm({
                            ...form,
                            branchIds: targetBranches.map((b: any) => b._id),
                            branchId: targetBranches[0]?._id || '',
                          });
                        }
                      }}
                      className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                    >
                      {form.branchIds.length === (user?.role === 'BRANCH_MANAGER' ? branches.filter((b: any) => user?.allowedBranchIds?.includes(b._id)).length : branches.length)
                        ? 'Clear all'
                        : 'Select all'}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2.5 rounded-lg border border-slate-200 bg-slate-50/50">
                  {(user?.role === 'BRANCH_MANAGER'
                    ? branches.filter((b: any) => user?.allowedBranchIds?.includes(b._id))
                    : branches
                  ).length === 0 ? (
                    <p className="text-xs text-slate-400 italic col-span-2 py-2">No accessible branches available</p>
                  ) : (
                    (user?.role === 'BRANCH_MANAGER'
                      ? branches.filter((b: any) => user?.allowedBranchIds?.includes(b._id))
                      : branches
                    ).map((b: any) => {
                      const isChecked = form.branchIds.includes(b._id);
                      return (
                        <label
                          key={b._id}
                          className={`flex items-center gap-2 p-2 rounded-lg border transition-all cursor-pointer ${
                            isChecked
                              ? 'bg-indigo-50/80 border-indigo-200 text-indigo-950 font-semibold shadow-2xs'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${isChecked ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}>
                            {isChecked && (
                              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </span>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                const updated = [...form.branchIds, b._id];
                                setForm({ ...form, branchIds: updated, branchId: updated[0] });
                              } else {
                                const updated = form.branchIds.filter((id) => id !== b._id);
                                setForm({ ...form, branchIds: updated, branchId: updated[0] || '' });
                              }
                            }}
                            className="sr-only"
                            aria-label={`Assign ${b.name}`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs truncate">{b.name}</p>
                            {b.branchCode && <span className="text-[10px] text-slate-400 font-mono">{b.branchCode}</span>}
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">Team member will have operational access across all selected branches.</p>
              </div>
            </div>
          )}

          {/* Modal Action Buttons */}
          <div className="flex justify-between items-center pt-3 border-t border-slate-200">
            {activeTab === 'access' && !editingId ? (
              <button
                type="button"
                onClick={() => setActiveTab('details')}
                className="text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-1"
              >
                ← Back to Details
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={resetForm} size="sm">
                Cancel
              </Button>

              {/* Step 1 button: Assign Branch -> */}
              {activeTab === 'details' && !editingId ? (
                <Button type="button" onClick={goToAssignBranch} size="sm">
                  Assign Branch →
                </Button>
              ) : (
                /* Step 2 or edit mode button: Submit User / Save */
                <Button type="submit" loading={create.isPending || update.isPending} size="sm">
                  {editingId ? 'Save Changes' : 'Submit User'}
                </Button>
              )}
            </div>
          </div>
        </form>
      </Modal>

      {/* MODAL: Deactivate User Confirmation */}
      <ConfirmModal
        isOpen={!!userToDeactivate}
        onClose={() => setUserToDeactivate(null)}
        onConfirm={handleConfirmDeactivate}
        title="Deactivate Team Member"
        message={`Are you sure you want to deactivate ${userToDeactivate?.email}? This user will no longer be able to log in or access company leads.`}
        confirmText="Deactivate Account"
        variant="danger"
        loading={isDeactivating}
      />

      {/* MODAL: Per-campaign access grants */}
      {campaignAccessUser && (
        <CampaignAccessModal
          targetUser={campaignAccessUser}
          branches={branches}
          onClose={() => setCampaignAccessUser(null)}
        />
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------
   Modern Compact User Table Row with 3-Dot ActionMenu
------------------------------------------------------------------------- */
const UserTableRow: React.FC<{
  u: any;
  canUpdateUser: boolean;
  canDeleteUser: boolean;
  canManageCampaigns: boolean;
  showCompany: boolean;
  companies: any[];
  branches: any[];
  dynamicRoles?: any[];
  onEdit: () => void;
  onDeactivate: () => void;
  onRefresh: () => void;
  onCampaignAccess: () => void;
  onView: () => void;
}> = ({ u, canUpdateUser, canDeleteUser, canManageCampaigns, showCompany, companies, branches, dynamicRoles = [], onEdit, onDeactivate, onRefresh, onCampaignAccess, onView }) => {
  const toast = useToast();
  const toggle = usePut(`/users/${u._id}`);
  const companyName = companies.find((c: any) => c._id === u.companyId)?.name;
  const branch = branches.find((b: any) => b._id === u.branchId);

  const fullName = (u.firstName || u.lastName ? `${u.firstName || ''} ${u.lastName || ''}` : u.email.split('@')[0]).trim();
  const initials = fullName
    .split(' ')
    .map((n: string) => n[0])
    .filter(Boolean)
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  const NO_CAMPAIGN_PERMISSION = 'You need campaigns:assign permission to manage campaign access.';
  const menuItems: ActionMenuItem[] = [
    {
      label: 'Edit Profile & Branch',
      onClick: onEdit,
      disabled: !canUpdateUser,
      tooltip: !canUpdateUser ? NO_UPDATE_USER_PERMISSION : undefined,
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      ),
    },
    {
      label: 'Campaign Access',
      onClick: () => {
        if (!canManageCampaigns) {
          toast.warning('Access Restricted', NO_CAMPAIGN_PERMISSION);
          return;
        }
        onCampaignAccess();
      },
      disabled: !canManageCampaigns,
      tooltip: !canManageCampaigns ? NO_CAMPAIGN_PERMISSION : 'Grant per-campaign access inside branches',
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
    },
    ...(u.isActive
      ? [
          {
            label: 'Deactivate Account',
            danger: true,
            onClick: onDeactivate,
            disabled: !canDeleteUser,
            tooltip: !canDeleteUser ? NO_DELETE_USER_PERMISSION : undefined,
            icon: (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            ),
          },
        ]
      : [
          {
            label: 'Reactivate Account',
            disabled: !canUpdateUser,
            tooltip: !canUpdateUser ? NO_UPDATE_USER_PERMISSION : undefined,
            onClick: () => {
              if (!canUpdateUser) {
                toast.warning('Access Restricted', NO_UPDATE_USER_PERMISSION);
                return;
              }
              toggle.mutate(
                { isActive: true },
                {
                  onSuccess: () => {
                    toast.success('Account Reactivated', `${u.email} is active again.`);
                    onRefresh();
                  },
                  onError: (err: any) => {
                    toast.error('Reactivation Failed', err?.response?.data?.error || 'Could not reactivate account.');
                  },
                },
              );
            },
            icon: (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ),
          },
        ]),
  ];

  return (
    <tr className="hover:bg-slate-50/75 transition-colors group cursor-pointer" onClick={onView}>
      {/* User Info with clean non-overlapping line heights */}
      <td className="py-3.5 px-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-50 to-indigo-100/70 border border-indigo-200/60 flex items-center justify-center text-indigo-700 font-bold text-xs shrink-0 shadow-xs">
            {initials}
          </div>
          <div className="flex flex-col min-w-0">
            <span
              className={`text-sm font-semibold leading-tight truncate ${
                canUpdateUser
                  ? 'text-slate-900 hover:text-indigo-600 transition-colors cursor-pointer'
                  : 'text-slate-700 cursor-not-allowed'
              }`}
              onClick={() => {
                if (!canUpdateUser) {
                  toast.warning('Access Restricted', NO_UPDATE_USER_PERMISSION);
                  return;
                }
                onEdit();
              }}
              title={!canUpdateUser ? NO_UPDATE_USER_PERMISSION : undefined}
            >
              {fullName}
            </span>
            <span className="text-xs text-slate-500 leading-tight truncate mt-1">
              {u.email}
            </span>
          </div>
        </div>
      </td>

      {/* Role Badge */}
      <td className="py-3.5 px-4">
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${
            roleBadgeStyles[u.role?.toUpperCase()] || 'bg-slate-100 text-slate-700 border-slate-200'
          }`}
        >
          {u.roleId?.name || dynamicRoles.find((r) => r.slug === u.role)?.name || u.role?.replace(/_/g, ' ')}
        </span>
      </td>

      {/* Company (if Super Admin) */}
      {showCompany && (
        <td className="py-3.5 px-4 text-slate-700 text-sm font-medium">
          {companyName || '—'}
        </td>
      )}

      {/* Assigned Branch */}
      <td className="py-3.5 px-4">
        {u.role?.toUpperCase() === 'COMPANY_ADMIN' ? (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-semibold text-slate-900 leading-tight">
                {u.branches?.[0]?.name || branch?.name || 'Primary Branch'}
              </span>
              <span className="inline-flex items-center gap-1 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/80 tracking-wider uppercase shrink-0">
                ★ PRIMARY
              </span>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">
              {u.branches?.[0]?.branchCode || branch?.branchCode ? `${u.branches?.[0]?.branchCode || branch?.branchCode} · ` : ''}
              Full Company Access
            </span>
          </div>
        ) : u.branchCount > 1 ? (
          <div className="flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80 w-fit">
              {u.branchCount} Branches
            </span>
            <span className="text-[11px] text-slate-500 truncate max-w-[170px]" title={u.branches?.map((b: any) => b.name).join(', ')}>
              {u.branches?.map((b: any) => b.name).join(', ')}
            </span>
          </div>
        ) : u.branches && u.branches.length === 1 ? (
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-medium text-slate-800 leading-tight">{u.branches[0].name}</span>
              {u.branches[0].isDefault && (
                <span className="inline-flex items-center text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/80 tracking-wider uppercase shrink-0">
                  ★ PRIMARY
                </span>
              )}
            </div>
            {u.branches[0].branchCode && (
              <span className="text-[11px] font-mono text-slate-400 mt-1">
                {u.branches[0].branchCode}
              </span>
            )}
          </div>
        ) : branch ? (
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-medium text-slate-800 leading-tight">{branch.name}</span>
              {branch.isDefault && (
                <span className="inline-flex items-center text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/80 tracking-wider uppercase shrink-0">
                  ★ PRIMARY
                </span>
              )}
            </div>
            {branch.branchCode && (
              <span className="text-[11px] font-mono text-slate-400 mt-1">
                {branch.branchCode}
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs text-slate-400 italic">Unassigned</span>
        )}
      </td>

      {/* Access ID */}
      <td className="py-3.5 px-4">
        {u.accessId ? (
          <span className="inline-flex items-center font-mono text-xs font-bold text-indigo-700 bg-indigo-50/80 px-2 py-0.5 rounded border border-indigo-100">
            {u.accessId}
          </span>
        ) : (
          <span className="text-slate-300 font-mono text-xs">—</span>
        )}
      </td>

      {/* Status */}
      <td className="py-3.5 px-4">
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
            u.isActive
              ? u.onboardingStatus === 'pending_onboarding'
                ? 'bg-amber-50 text-amber-700 border border-amber-200/60'
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
              : 'bg-rose-50 text-rose-700 border border-rose-200/60'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              u.isActive
                ? u.onboardingStatus === 'pending_onboarding'
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
                : 'bg-rose-500'
            }`}
          />
          {u.isActive ? (u.onboardingStatus === 'pending_onboarding' ? 'Pending' : 'Active') : 'Inactive'}
        </span>
      </td>

      {/* Three Dot Action Menu */}
      <td className="py-3.5 px-5 text-right">
        <ActionMenu items={menuItems} align="right" />
      </td>
    </tr>
  );
};

/* -------------------------------------------------------------------------
   Per-campaign access grants (Tier-3).
   A restricted user WITH grants sees exactly those campaigns; with NO grants
   they inherit the whole branch scope. Grants never widen branch membership.
------------------------------------------------------------------------- */
const CampaignAccessModal: React.FC<{
  targetUser: any;
  branches: any[];
  onClose: () => void;
}> = ({ targetUser, branches, onClose }) => {
  const toast = useToast();
  const targetName = `${targetUser.firstName || ''} ${targetUser.lastName || ''}`.trim() || targetUser.email;

  // Branches the target belongs to (membership-derived shape varies by endpoint)
  const memberBranchIds: string[] = React.useMemo(() => {
    const ids: string[] = [];
    if (Array.isArray(targetUser.branchIds)) ids.push(...targetUser.branchIds.map(String));
    if (Array.isArray(targetUser.branches)) {
      for (const b of targetUser.branches) {
        const id = b.id || b._id;
        if (id) ids.push(String(id));
      }
    }
    if (targetUser.branchId) ids.push(String(targetUser.branchId));
    return [...new Set(ids)];
  }, [targetUser]);

  const memberBranches = branches.filter((b: any) => memberBranchIds.includes(String(b._id)));
  const [activeBranchId, setActiveBranchId] = React.useState<string>(memberBranchIds[0] || '');
  React.useEffect(() => {
    if (!activeBranchId && memberBranchIds.length > 0) setActiveBranchId(memberBranchIds[0]);
  }, [memberBranchIds, activeBranchId]);

  // All live grants of the target user
  const { data: grantsData, isLoading: grantsLoading, refetch: refetchGrants } = useQuery({
    queryKey: ['campaign-access', targetUser._id],
    queryFn: () => api.get(`/campaign-access/user/${targetUser._id}`).then((r) => r.data),
    retry: false,
  });
  const allGrants: any[] = (grantsData as any)?.data || [];
  const branchGrants = allGrants.filter((g: any) => String(g.branchId) === String(activeBranchId));

  // Synced campaigns of the active branch (checklist source)
  const { data: campaignsData, isLoading: campaignsLoading } = useQuery({
    queryKey: ['campaign-access-branch-campaigns', activeBranchId],
    queryFn: () => api.get(`/campaign-access/branch/${activeBranchId}/campaigns`).then((r) => r.data),
    enabled: !!activeBranchId,
    retry: false,
  });
  const branchCampaigns: any[] = (campaignsData as any)?.data || [];

  const [checked, setChecked] = React.useState<Record<string, boolean>>({});
  const [accessLevel, setAccessLevel] = React.useState<'view' | 'manage'>('view');
  const [expiresOn, setExpiresOn] = React.useState('');
  const [initializedFor, setInitializedFor] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  // Preselect already-granted campaigns when branch data arrives
  React.useEffect(() => {
    const key = `${targetUser._id}:${activeBranchId}`;
    if (!activeBranchId || initializedFor === key || grantsLoading || campaignsLoading) return;
    const next: Record<string, boolean> = {};
    for (const g of branchGrants) next[String(g.campaignId)] = true;
    setChecked(next);
    const hasManage = branchGrants.some((g: any) => g.access === 'manage');
    setAccessLevel(hasManage ? 'manage' : 'view');
    const firstExpiry = branchGrants.find((g: any) => g.expiresAt)?.expiresAt;
    setExpiresOn(firstExpiry ? String(firstExpiry).slice(0, 10) : '');
    setInitializedFor(key);
  }, [targetUser._id, activeBranchId, grantsLoading, campaignsLoading, initializedFor, branchGrants]);

  const toggle = (campaignId: string) =>
    setChecked((prev) => ({ ...prev, [campaignId]: !prev[campaignId] }));
  const selectedIds = Object.keys(checked).filter((k) => checked[k]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/campaign-access/user/${targetUser._id}`, {
        branchId: activeBranchId,
        grants: selectedIds.map((campaignId) => {
          const c = branchCampaigns.find((x: any) => String(x.campaignId) === String(campaignId));
          return {
            campaignId,
            campaignName: c?.name,
            access: accessLevel,
            expiresAt: expiresOn || undefined,
          };
        }),
      });
      toast.success('Campaign access saved', `${selectedIds.length} campaign(s) granted to ${targetName} in this branch.`);
      setInitializedFor('');
      refetchGrants();
    } catch (err: any) {
      toast.error('Save failed', err?.response?.data?.error || 'Could not save campaign grants.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Campaign access — ${targetName}`}
      size="xl"
    >
      <div className="space-y-4 text-xs">
        <div className="p-3 bg-indigo-50/70 border border-indigo-200/80 rounded-xl text-indigo-900 leading-relaxed">
          <p className="font-bold text-xs">Tiered access: branch → role → campaigns</p>
          <p className="text-[11px] mt-0.5">
            Checked campaigns are the ONLY ones this person sees here. Uncheck everything to fall back to full branch scope.
            Grants never widen branch membership — the person must belong to the branch first.
          </p>
        </div>

        {memberBranches.length === 0 ? (
          <p className="text-center py-8 text-slate-400">This user belongs to no branches yet. Assign branches first.</p>
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              {memberBranches.map((b: any) => {
                const count = allGrants.filter((g: any) => String(g.branchId) === String(b._id)).length;
                const active = String(b._id) === String(activeBranchId);
                return (
                  <button
                    key={b._id}
                    type="button"
                    onClick={() => { setActiveBranchId(String(b._id)); setInitializedFor(''); }}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all ${active ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    {b.name} ({count})
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <CustomSelect
                label="Access level for selected"
                value={accessLevel}
                onChange={(val) => setAccessLevel(val as 'view' | 'manage')}
                options={[
                  { value: 'view', label: 'View — see campaigns, ads & leads' },
                  { value: 'manage', label: 'Manage — also assign & import' },
                ]}
              />
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
                    const next: Record<string, boolean> = {};
                    branchCampaigns.forEach((c: any) => { next[String(c.campaignId)] = true; });
                    setChecked(next);
                  }}
                  className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold"
                >
                  Select all
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => setChecked({})}
                  className="text-[11px] text-slate-500 hover:text-slate-700 font-semibold"
                >
                  Clear (branch scope)
                </button>
              </div>
            </div>

            {campaignsLoading || grantsLoading ? (
              <div className="flex items-center justify-center py-8 gap-2 text-slate-400">
                <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                Loading campaigns…
              </div>
            ) : branchCampaigns.length === 0 ? (
              <p className="text-center py-8 text-slate-400">
                No synced campaigns in this branch yet. Assign campaigns to the branch first (Ad Accounts → Assign).
              </p>
            ) : (
              <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                {branchCampaigns.map((c: any) => {
                  const id = String(c.campaignId);
                  const isChecked = !!checked[id];
                  return (
                    <label
                      key={id}
                      className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${isChecked ? 'bg-indigo-50/80 border-indigo-200 shadow-2xs' : 'bg-white border-slate-200 hover:bg-slate-50'}`}
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
                        onChange={() => toggle(id)}
                        className="sr-only"
                        aria-label={`Grant ${c.name || id}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-800 truncate">{c.name || id}</p>
                        <p className="text-[10px] font-mono text-slate-400 truncate">
                          {id} {c.status ? `• ${c.status}` : ''}{c.objective ? ` • ${c.objective}` : ''}
                        </p>
                      </div>
                      {isChecked && (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${accessLevel === 'manage' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                          {accessLevel}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-slate-200">
              <p className="text-[11px] text-slate-500">
                {selectedIds.length === 0
                  ? 'Nothing checked → full branch scope applies.'
                  : `${selectedIds.length} of ${branchCampaigns.length} campaigns granted (${accessLevel}).`}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={onClose} size="sm">Close</Button>
                <Button onClick={handleSave} loading={saving} size="sm" disabled={!activeBranchId}>
                  Save grants
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

export default UsersPage;

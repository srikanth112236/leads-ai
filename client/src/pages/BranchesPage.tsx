import React, { useState, useCallback, useMemo } from 'react';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import ConfirmModal from '../components/common/ConfirmModal';
import CustomSelect from '../components/common/CustomSelect';
import Toggle from '../components/common/Toggle';
import { useCompanyScope } from '../context/CompanyScopeContext';
import ActionMenu, { ActionMenuItem } from '../components/common/ActionMenu';
import { useToast } from '../components/common/Toast';
import { useGet, usePost, usePut } from '../hooks/useApi';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

interface BranchForm {
  name: string;
  location: string;
  branchCode: string;
  parentBranchId: string;
  branchType: string;
  timezone: string;
  status: string;
  companyId?: string;
}

const emptyForm: BranchForm = {
  name: '',
  location: '',
  branchCode: '',
  parentBranchId: '',
  branchType: 'sales_office',
  timezone: 'UTC',
  status: 'active',
};

const emptyTeamMember = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  role: 'sales_executive',
  accessLevel: 'full_manage',
};

const BRANCH_TYPES = ['hq', 'regional_hub', 'sales_office', 'franchise'];

interface Provisioned {
  email: string;
  accessId: string;
  tempPassword: string;
  role: string;
}

// Helper to generate a unique branch code from the name
const generateUniqueBranchCode = (name: string, branchList: any[]): string => {
  if (!name.trim()) return '';
  const clean = name.trim().toUpperCase().replace(/[^A-Z0-9\s]/g, '');
  const words = clean.split(/\s+/).filter(Boolean);
  let prefix = '';
  if (words.length >= 2) {
    prefix = words.map((w) => w[0]).join('').slice(0, 4);
  } else if (words.length === 1) {
    prefix = words[0].slice(0, 3);
  }
  if (!prefix) prefix = 'BR';

  const existingCodes = new Set(
    branchList.map((b) => String(b.branchCode || '').toUpperCase())
  );
  let seq = 1;
  let candidate = `BR-${prefix}-${String(seq).padStart(3, '0')}`;
  while (existingCodes.has(candidate)) {
    seq++;
    candidate = `BR-${prefix}-${String(seq).padStart(3, '0')}`;
  }
  return candidate;
};

const NO_CREATE_BRANCH_PERMISSION = 'You do not have permission to create new branch offices. Please contact your company administrator to request access.';
const NO_UPDATE_BRANCH_PERMISSION = 'You do not have permission to edit branch details. Please contact your company administrator to request access.';
const NO_DELETE_BRANCH_PERMISSION = 'You do not have permission to delete branch locations. Please contact your company administrator to request access.';
const NO_MANAGE_BRANCH_TEAM_PERMISSION = 'You do not have permission to assign team members to this branch. Please contact your company administrator to request access.';

const BranchesPage: React.FC = () => {
  const { user, activeBranchId, setActiveBranchId, hasPermission } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const isSuper = user?.role === 'SUPER_ADMIN';
  const isCompanyAdmin = user?.role === 'COMPANY_ADMIN';

  const canCreateBranch = isSuper || isCompanyAdmin || hasPermission('branches:create');
  const canUpdateBranch = isSuper || isCompanyAdmin || hasPermission('branches:update');
  const canDeleteBranch = isSuper || isCompanyAdmin || hasPermission('branches:delete');
  const canManageBranchTeam = isSuper || isCompanyAdmin || hasPermission('branches:team_manage');

  // Branch data (super-admin company scope applies when set)
  const { scopedCompanyId } = useCompanyScope();
  const branchesUrl = isSuper && scopedCompanyId ? `/branches?companyId=${scopedCompanyId}` : '/branches';
  const { data, isLoading } = useGet(branchesUrl);
  const branches: any[] = (data as any)?.data || [];

  // Scope filter & search state
  const [scopeFilter, setScopeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Keep scopeFilter synchronized with the top header activeBranchId
  React.useEffect(() => {
    setScopeFilter(activeBranchId || 'all');
  }, [activeBranchId]);

  const handleSelectScope = useCallback((branchId: string | null) => {
    setActiveBranchId(branchId);
    setScopeFilter(branchId || 'all');
    if (branchId) {
      const target = branches.find((b: any) => b._id === branchId);
      toast.info('Branch Switched', `Active scope set to "${target?.name || 'Selected Branch'}".`);
    } else {
      toast.info('Company View', 'Active scope reset to All Branches.');
    }
  }, [branches, setActiveBranchId, toast]);

  const activeBranch = useMemo(() => {
    return branches.find((b: any) => b._id === (activeBranchId || scopeFilter));
  }, [branches, activeBranchId, scopeFilter]);

  const filteredBranches = useMemo(() => {
    let result = branches;
    if (scopeFilter && scopeFilter !== 'all') {
      result = result.filter((b: any) => b._id === scopeFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (b: any) =>
          b.name?.toLowerCase().includes(q) ||
          b.branchCode?.toLowerCase().includes(q) ||
          b.location?.toLowerCase().includes(q) ||
          b.branchType?.toLowerCase().includes(q),
      );
    }
    return result;
  }, [branches, scopeFilter, searchQuery]);

  // Super admin companies
  const { data: companiesData } = useQuery({
    queryKey: ['companies-list'],
    queryFn: () => api.get('/companies').then((r) => r.data),
    enabled: isSuper,
    retry: false,
  });
  const companies = isSuper ? ((companiesData as any)?.data || []) : [];

  // Unassigned pages for portfolio binding
  const { data: pagesData } = useQuery({
    queryKey: ['pages-unassigned'],
    queryFn: () => api.get('/meta/pages').then((r) => r.data),
    retry: false,
  });
  const unassignedPages = ((pagesData as any)?.data || []).filter((p: any) => !p.branchId);

  // Existing company team users for assignment (fetch company-wide with x-branch-id: all)
  const { data: usersData } = useQuery({
    queryKey: ['company-users-list', scopedCompanyId || 'default'],
    queryFn: () => api.get('/users', { headers: { 'x-branch-id': 'all' } }).then((r) => r.data),
    retry: false,
  });
  const companyUsers: any[] = (usersData as any)?.data || [];

  // Modal states
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BranchForm>(emptyForm);
  const [isCodeManuallyEdited, setIsCodeManuallyEdited] = useState(false);
  const [wantAssignTeam, setWantAssignTeam] = useState(false);
  const [team, setTeam] = useState<Array<typeof emptyTeamMember>>([]);
  const [selectedExistingUserIds, setSelectedExistingUserIds] = useState<string[]>([]);
  const [portfolioPageIds, setPortfolioPageIds] = useState<string[]>([]);
  const [credentials, setCredentials] = useState<Provisioned[] | null>(null);
  const [copied, setCopied] = useState(false);

  // Add / Assign Users modal state
  const [addUsersBranchId, setAddUsersBranchId] = useState<string | null>(null);
  const [assignUserIds, setAssignUserIds] = useState<string[]>([]);
  const [newEmails, setNewEmails] = useState('');
  const [newRole, setNewRole] = useState('sales_executive');
  const [newAccessLevel, setNewAccessLevel] = useState('full_manage');
  const [addUsersLoading, setAddUsersLoading] = useState(false);
  const [teamSearch, setTeamSearch] = useState('');
  const [createTeamSearch, setCreateTeamSearch] = useState('');

  // View team modal state
  const [viewTeamBranchId, setViewTeamBranchId] = useState<string | null>(null);
  const [branchToDelete, setBranchToDelete] = useState<any | null>(null);
  const [isDeletingBranch, setIsDeletingBranch] = useState(false);
  const { data: viewTeamData, isLoading: viewTeamLoading } = useQuery({
    queryKey: ['branch-team-view', viewTeamBranchId],
    queryFn: () => api.get(`/branches/${viewTeamBranchId}/users`).then((r) => r.data),
    retry: false,
    enabled: !!viewTeamBranchId,
  });
  const viewTeamMembers: any[] = viewTeamData?.data || [];

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['/branches'] });
    queryClient.invalidateQueries({ queryKey: ['pages-unassigned'] });
    queryClient.invalidateQueries({ queryKey: ['company-users-list'] });
    queryClient.invalidateQueries({ queryKey: ['branch-team-count'] });
    if (viewTeamBranchId) {
      queryClient.invalidateQueries({ queryKey: ['branch-team-view', viewTeamBranchId] });
    }
  }, [queryClient, viewTeamBranchId]);

  const handleConfirmDeleteBranch = async () => {
    if (!branchToDelete) return;
    setIsDeletingBranch(true);
    try {
      await api.delete(`/branches/${branchToDelete._id}`);
      toast.info('Branch Deleted', `Branch "${branchToDelete.name}" was removed.`);
      setBranchToDelete(null);
      refresh();
    } catch (err: any) {
      toast.error('Delete Failed', err?.response?.data?.error || 'Could not delete branch.');
    } finally {
      setIsDeletingBranch(false);
    }
  };

  const create = usePost('/branches');
  const update = usePut(`/branches/${editingId || ''}`);

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
    setIsCodeManuallyEdited(false);
    setWantAssignTeam(false);
    setTeam([]);
    setSelectedExistingUserIds([]);
    setPortfolioPageIds([]);
    setShowForm(false);
  };

  const startCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, companyId: isSuper ? '' : user?.companyId || '' });
    setIsCodeManuallyEdited(false);
    setWantAssignTeam(false);
    setTeam([]);
    setSelectedExistingUserIds([]);
    setPortfolioPageIds([]);
    setShowForm(true);
  };

  const startEdit = (b: any) => {
    setEditingId(b._id);
    setForm({
      name: b.name || '',
      location: b.location || '',
      branchCode: b.branchCode || '',
      parentBranchId: b.parentBranchId || '',
      branchType: b.branchType || 'sales_office',
      timezone: b.timezone || 'UTC',
      status: b.status || 'active',
      companyId: b.companyId || '',
    });
    setIsCodeManuallyEdited(true);
    setWantAssignTeam(false);
    setTeam([]);
    setSelectedExistingUserIds([]);
    setPortfolioPageIds([]);
    setShowForm(true);
  };

  // Immediate code generation on name change
  const handleNameChange = (newName: string) => {
    const autoCode = generateUniqueBranchCode(newName, branches);
    setForm((prev) => ({
      ...prev,
      name: newName,
      branchCode: !isCodeManuallyEdited || !prev.branchCode ? autoCode : prev.branchCode,
    }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();

    const onError = (err: any) => {
      toast.error('Operation Failed', err?.response?.data?.error || 'Could not save branch.');
    };

    if (editingId) {
      const { companyId: _omit, branchCode: _code, ...patch } = form;
      void _omit;
      void _code;
      update.mutate(
        { ...patch, parentBranchId: patch.parentBranchId || undefined },
        {
          onSuccess: () => {
            toast.success('Branch Updated', `Branch "${form.name}" has been updated.`);
            resetForm();
            refresh();
          },
          onError,
        },
      );
    } else {
      create.mutate(
        {
          ...form,
          branchCode: form.branchCode || undefined,
          parentBranchId: form.parentBranchId || undefined,
          portfolioPageIds,
          users: wantAssignTeam ? team : [],
          existingUserIds: wantAssignTeam ? selectedExistingUserIds : [],
        },
        {
          onSuccess: (res: any) => {
            const branchName = form.name;
            const provisioned = res?.data?.data?.provisioned || [];
            toast.success(
              'Branch Created',
              `Branch "${branchName}" has been created with code ${form.branchCode || 'assigned'}.`,
            );
            resetForm();
            refresh();
            if (provisioned.length > 0) {
              setCredentials(provisioned);
              setCopied(false);
            }
          },
          onError,
        },
      );
    }
  };

  const addTeamMember = () => {
    setTeam([...team, { ...emptyTeamMember }]);
  };

  const removeTeamMember = (index: number) => {
    setTeam(team.filter((_, i) => i !== index));
  };

  const updateTeamMember = (index: number, field: string, value: string) => {
    setTeam(team.map((m, i) => (i === index ? { ...m, [field]: value } : m)));
  };

  const handleAddAssignUsers = async () => {
    if (!addUsersBranchId) return;
    const emailsList = newEmails.split(',').map((e) => e.trim()).filter(Boolean);
    if (emailsList.length === 0 && assignUserIds.length === 0) {
      toast.error('Selection Required', 'Please select existing team users or enter email addresses to provision.');
      return;
    }
    setAddUsersLoading(true);
    try {
      const res = await api.post(`/branches/${addUsersBranchId}/users`, {
        emails: emailsList,
        userIds: assignUserIds,
        role: newRole,
        accessLevel: newAccessLevel,
      });
      const provisioned = (res as any)?.data?.data?.provisioned || [];
      const assignedCount = (res as any)?.data?.data?.assignedCount || 0;
      toast.success(
        'Team Updated',
        `Assigned ${assignedCount} existing member(s)${provisioned.length > 0 ? ` and provisioned ${provisioned.length} new account(s)` : ''}.`,
      );
      setAddUsersBranchId(null);
      setAssignUserIds([]);
      setNewEmails('');
      refresh();
      if (provisioned.length > 0) {
        setCredentials(provisioned);
        setCopied(false);
      }
    } catch (err: any) {
      toast.error('Failed to Add Users', err?.response?.data?.error || 'Could not assign team members.');
    } finally {
      setAddUsersLoading(false);
    }
  };

  const copyAllCredentials = async () => {
    if (!credentials) return;
    await navigator.clipboard.writeText(
      credentials
        .map((c) => `Email: ${c.email}\nAccess ID: ${c.accessId}\nTemp Password: ${c.tempPassword}\nRole: ${c.role}`)
        .join('\n\n'),
    );
    setCopied(true);
  };

  // Filter existing users by search
  const filteredUsers = useMemo(() => {
    if (!teamSearch.trim()) return companyUsers;
    const q = teamSearch.toLowerCase();
    return companyUsers.filter(
      (u) =>
        u.email?.toLowerCase().includes(q) ||
        u.firstName?.toLowerCase().includes(q) ||
        u.lastName?.toLowerCase().includes(q),
    );
  }, [companyUsers, teamSearch]);

  const filteredCreateUsers = useMemo(() => {
    if (!createTeamSearch.trim()) return companyUsers;
    const q = createTeamSearch.toLowerCase();
    return companyUsers.filter(
      (u) =>
        u.email?.toLowerCase().includes(q) ||
        u.firstName?.toLowerCase().includes(q) ||
        u.lastName?.toLowerCase().includes(q),
    );
  }, [companyUsers, createTeamSearch]);

  const targetBranch = branches.find((b) => b._id === addUsersBranchId || b._id === viewTeamBranchId);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight">Branches & Regional Units</h1>
          <p className="text-xs text-slate-500">Manage hierarchical branch offices, regional hubs, and team assignments</p>
        </div>
        <Button
          onClick={() => {
            if (!canCreateBranch) {
              toast.warning('Access Restricted', NO_CREATE_BRANCH_PERMISSION);
              return;
            }
            startCreate();
          }}
          disabled={!canCreateBranch}
          title={!canCreateBranch ? NO_CREATE_BRANCH_PERMISSION : 'Create New Branch Office'}
          size="sm"
          className={!canCreateBranch ? 'opacity-40 cursor-not-allowed bg-slate-200 text-slate-500 hover:bg-slate-200' : ''}
        >
          <span className="flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Branch
          </span>
        </Button>
      </div>

      {/* Metrics & Scope Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Branches</p>
            <p className="text-2xl font-extrabold text-slate-900 mt-1">{branches.length}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Registered locations</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Units</p>
            <p className="text-2xl font-extrabold text-emerald-600 mt-1">
              {branches.filter((b) => b.status === 'active').length}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Operational branches</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="min-w-0 pr-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Scope</p>
            <p className="text-sm font-bold text-slate-900 mt-1 truncate" title={activeBranch ? activeBranch.name : 'All Branches (Company View)'}>
              {activeBranch ? activeBranch.name : 'All Branches'}
            </p>
            <p className="text-[11px] text-indigo-600 font-medium mt-0.5 flex items-center gap-1">
              {activeBranch ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {activeBranch.branchCode || 'Scoped View'}
                </>
              ) : (
                'Company-wide view'
              )}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Filtered View</p>
            <p className="text-2xl font-extrabold text-indigo-600 mt-1">{filteredBranches.length}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {scopeFilter === 'all' ? 'Showing all branches' : 'Scoped to selected branch'}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Scope Switcher & Search Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Scope Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 shrink-0">Scope:</span>
          <button
            type="button"
            onClick={() => handleSelectScope(null)}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all shrink-0 ${
              scopeFilter === 'all'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
            }`}
          >
            All Branches ({branches.length})
          </button>
          {branches.map((b: any) => {
            const isSelected = scopeFilter === b._id;
            return (
              <button
                key={b._id}
                type="button"
                onClick={() => handleSelectScope(b._id)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                {b.isDefault && <span className="text-amber-300">★</span>}
                <span>{b.name}</span>
                {b.branchCode && (
                  <span className={`text-[10px] font-mono px-1 rounded ${isSelected ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-200 text-slate-600'}`}>
                    {b.branchCode}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Search & Show All */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 md:w-60">
            <input
              type="text"
              placeholder="Search branches…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500"
            />
            <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          {scopeFilter !== 'all' && (
            <button
              type="button"
              onClick={() => handleSelectScope(null)}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold px-2 py-1 rounded hover:bg-indigo-50 transition-colors shrink-0"
              title="View all branches"
            >
              Show All
            </button>
          )}
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-visible">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-slate-400 text-sm">
            <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            Loading branches…
          </div>
        ) : branches.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <svg className="w-12 h-12 mx-auto text-slate-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <p className="text-base font-semibold text-slate-700">No branches registered</p>
            <p className="text-xs text-slate-400 mt-1">Click "New Branch" to create your first office or regional hub.</p>
          </div>
        ) : filteredBranches.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <svg className="w-10 h-10 mx-auto text-slate-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p className="text-sm font-semibold text-slate-700">No branches match your filter</p>
            <p className="text-xs text-slate-400 mt-1">Try resetting the search or selecting "All Branches".</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => {
                setSearchQuery('');
                handleSelectScope(null);
              }}
            >
              Reset Filters
            </Button>
          </div>
        ) : (
          <div className="min-h-[240px] pb-12 overflow-visible">
            <table className="w-full text-left border-collapse table-auto">
              <colgroup>
                <col className="w-[30%] min-w-[220px]" />
                <col className="w-[14%] min-w-[120px]" />
                <col className="w-[14%] min-w-[120px]" />
                <col className="w-[18%] min-w-[160px]" />
                <col className="w-[11%] min-w-[100px]" />
                <col className="w-[13%] min-w-[110px]" />
                <col className="w-16 min-w-[70px]" />
              </colgroup>
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
                  <th className="py-3 px-5">Branch Name</th>
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Location & Timezone</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Assigned Team</th>
                  <th className="py-3 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBranches.map((b: any) => (
                  <BranchTableRow
                    key={b._id}
                    b={b}
                    isActiveBranch={Boolean(activeBranchId && b._id === activeBranchId)}
                    canUpdateBranch={canUpdateBranch}
                    canDeleteBranch={canDeleteBranch}
                    canManageBranchTeam={canManageBranchTeam}
                    onSelectActive={() => handleSelectScope(b._id)}
                    onEdit={() => startEdit(b)}
                    onViewTeam={() => setViewTeamBranchId(b._id)}
                    onAddUsers={() => {
                      setAddUsersBranchId(b._id);
                      setAssignUserIds([]);
                      setNewEmails('');
                      setTeamSearch('');
                    }}
                    onDelete={() => setBranchToDelete(b)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 1. MODAL: Create / Edit Branch */}
      <Modal
        isOpen={showForm}
        onClose={resetForm}
        title={editingId ? 'Edit Branch' : 'New Branch Setup'}
        size="xl"
      >
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {isSuper && !editingId && (
                <div className="md:col-span-2">
                  <CustomSelect
                    label="Company"
                    required
                    value={form.companyId || ''}
                    onChange={(val) => setForm({ ...form, companyId: val })}
                    options={companies.map((c: any) => ({ value: c._id, label: c.name }))}
                    placeholder="Select Company…"
                  />
                </div>
              )}

              {/* Branch Name with Immediate Code Generation */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Branch Name *</label>
                <input
                  value={form.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500"
                  placeholder="e.g., Downtown Sales Hub"
                  required
                />
              </div>

              {/* Unique Branch Code (Auto-Generated immediately, editable) */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-semibold text-slate-700">Branch Code (Unique) *</label>
                  <span className="text-[10px] text-indigo-600 font-mono">⚡ Auto-generated</span>
                </div>
                <input
                  value={form.branchCode}
                  onChange={(e) => {
                    setIsCodeManuallyEdited(true);
                    setForm({ ...form, branchCode: e.target.value.toUpperCase() });
                  }}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs uppercase font-mono font-medium text-indigo-900 bg-slate-50 focus:bg-white focus:ring-1 focus:ring-indigo-500"
                  placeholder="e.g. BR-DOW-001"
                  required
                />
              </div>

              <div>
                <CustomSelect
                  label="Branch Type"
                  required
                  value={form.branchType}
                  onChange={(val) => setForm({ ...form, branchType: val })}
                  options={BRANCH_TYPES.map((t) => ({
                    value: t,
                    label: t.replace('_', ' ').toUpperCase(),
                    badge: t === 'hq' ? 'Primary' : undefined,
                  }))}
                />
              </div>

              <div>
                <CustomSelect
                  label="Parent Branch (Hierarchy)"
                  value={form.parentBranchId}
                  onChange={(val) => setForm({ ...form, parentBranchId: val })}
                  options={[
                    { value: '', label: 'None (Top-Level Root)' },
                    ...branches
                      .filter((b: any) => b._id !== editingId)
                      .map((b: any) => ({
                        value: b._id,
                        label: b.name,
                        subLabel: b.branchCode || 'No Code',
                      })),
                  ]}
                  placeholder="None (Top-Level Root)"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Location</label>
                <input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500"
                  placeholder="e.g., New York, NY"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Timezone</label>
                <input
                  value={form.timezone}
                  onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500"
                  placeholder="e.g., America/New_York"
                />
              </div>

              <div>
                <CustomSelect
                  label="Status"
                  value={form.status}
                  onChange={(val) => setForm({ ...form, status: val })}
                  options={[
                    { value: 'active', label: 'Active', badge: 'Active' },
                    { value: 'inactive', label: 'Inactive' },
                  ]}
                />
              </div>
            </div>

            {/* Optional Team Assignment Toggle */}
            {!editingId && (
              <div className="pt-3 border-t border-slate-200">
                <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">Assign Team to this Branch now? (Optional)</h4>
                    <p className="text-[11px] text-slate-500">You can select multiple people now, or assign them later at any time.</p>
                  </div>
                  <Toggle checked={wantAssignTeam} onChange={setWantAssignTeam} />
                </div>

                {wantAssignTeam && (
                  <div className="mt-3 p-3 bg-white border border-slate-200 rounded-xl space-y-3">
                    {/* Existing Team Selector */}
                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                          Select Existing Team Members ({selectedExistingUserIds.length} selected)
                        </span>
                        <input
                          type="text"
                          placeholder="Search users…"
                          value={createTeamSearch}
                          onChange={(e) => setCreateTeamSearch(e.target.value)}
                          className="px-2 py-0.5 text-xs border border-slate-300 rounded-lg w-36"
                        />
                      </div>
                      {filteredCreateUsers.length === 0 ? (
                        <p className="text-xs text-slate-400 p-2 bg-slate-50 rounded-lg">No matching users found.</p>
                      ) : (
                        <div className="max-h-36 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                          {filteredCreateUsers.map((u: any) => (
                            <label
                              key={u._id}
                              className={`flex items-center justify-between p-1.5 rounded text-xs cursor-pointer transition-colors ${
                                selectedExistingUserIds.includes(u._id) ? 'bg-indigo-50 text-indigo-900 font-semibold' : 'hover:bg-white text-slate-700'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${selectedExistingUserIds.includes(u._id) ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}>
                                  {selectedExistingUserIds.includes(u._id) && (
                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                </span>
                                <input
                                  type="checkbox"
                                  checked={selectedExistingUserIds.includes(u._id)}
                                  onChange={(e) => {
                                    setSelectedExistingUserIds(
                                      e.target.checked
                                        ? [...selectedExistingUserIds, u._id]
                                        : selectedExistingUserIds.filter((id) => id !== u._id),
                                    );
                                  }}
                                  className="sr-only"
                                  aria-label={`Select ${u.email}`}
                                />
                                <span>{u.firstName || u.lastName ? `${u.firstName} ${u.lastName}` : u.email}</span>
                                <span className="text-[10px] text-slate-400 font-mono">({u.email})</span>
                              </div>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">{u.role}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* New Provisioning */}
                    <div className="pt-2 border-t border-slate-100">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                          Or Provision New Accounts ({team.length})
                        </span>
                        <Button variant="secondary" onClick={addTeamMember} size="sm">
                          + Add New Member
                        </Button>
                      </div>
                      {team.length > 0 && (
                        <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                          {team.map((m, idx) => (
                            <div key={idx} className="grid grid-cols-1 md:grid-cols-6 gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg items-end text-xs">
                              <div>
                                <label className="block text-[10px] font-semibold text-slate-500">First Name *</label>
                                <input
                                  value={m.firstName}
                                  onChange={(e) => updateTeamMember(idx, 'firstName', e.target.value)}
                                  className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
                                  required
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-semibold text-slate-500">Last Name *</label>
                                <input
                                  value={m.lastName}
                                  onChange={(e) => updateTeamMember(idx, 'lastName', e.target.value)}
                                  className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
                                  required
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-semibold text-slate-500">Email *</label>
                                <input
                                  type="email"
                                  value={m.email}
                                  onChange={(e) => updateTeamMember(idx, 'email', e.target.value)}
                                  className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
                                  required
                                />
                              </div>
                              <div>
                                <CustomSelect
                                  label="Role"
                                  value={m.role}
                                  onChange={(val) => updateTeamMember(idx, 'role', val)}
                                  options={[
                                    { value: 'sales_executive', label: 'Sales Exec' },
                                    { value: 'ads_manager', label: 'Ads Manager' },
                                  ]}
                                />
                              </div>
                              <div>
                                <CustomSelect
                                  label="Access Level"
                                  value={m.accessLevel}
                                  onChange={(val) => updateTeamMember(idx, 'accessLevel', val)}
                                  options={[
                                    { value: 'full_manage', label: 'Full Manage' },
                                    { value: 'view_only', label: 'View Only' },
                                  ]}
                                />
                              </div>
                              <div className="flex justify-end">
                                <Button variant="danger" size="sm" onClick={() => removeTeamMember(idx)}>
                                  Remove
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Portfolio binding */}
            {unassignedPages.length > 0 && !editingId && (
              <div className="pt-3 border-t border-slate-200">
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">Bind Meta Portfolios (Optional)</p>
                <div className="max-h-24 overflow-y-auto space-y-1 p-2 bg-slate-50 border border-slate-200 rounded-lg">
                  {unassignedPages.map((p: any) => (
                    <label key={p._id} className="flex items-center gap-2 text-xs text-slate-700 hover:text-slate-900 cursor-pointer">
                      <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${portfolioPageIds.includes(p._id) ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}>
                        {portfolioPageIds.includes(p._id) && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                      <input
                        type="checkbox"
                        checked={portfolioPageIds.includes(p._id)}
                        onChange={(e) =>
                          setPortfolioPageIds(
                            e.target.checked
                              ? [...portfolioPageIds, p._id]
                              : portfolioPageIds.filter((id) => id !== p._id),
                          )
                        }
                        className="sr-only"
                        aria-label={`Select ${p.name || p.metaPageId}`}
                      />
                      <span>{p.name || p.metaPageId}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <Button variant="secondary" onClick={resetForm} size="sm">
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending || update.isPending} size="sm">
              {editingId ? 'Save Changes' : 'Create Branch'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* 2. MODAL: Add / Assign Users to an existing branch */}
      <Modal
        isOpen={!!addUsersBranchId}
        onClose={() => setAddUsersBranchId(null)}
        title={`Add / Assign Team to ${targetBranch?.name || 'Branch'}`}
        size="lg"
      >
        <div className="space-y-4 text-xs">
          {/* Section 1: Assign from existing team */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <span className="font-bold text-slate-800 uppercase tracking-wide">
                1. Select Existing Team Members ({assignUserIds.length} selected)
              </span>
              <input
                type="text"
                placeholder="Search team…"
                value={teamSearch}
                onChange={(e) => setTeamSearch(e.target.value)}
                className="px-2 py-1 text-xs border border-slate-300 rounded-lg w-40"
              />
            </div>
            <div className="max-h-44 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
              {filteredUsers.length === 0 ? (
                <p className="text-slate-400 p-2 italic">No matching team members.</p>
              ) : (
                filteredUsers.map((u: any) => (
                  <label
                    key={u._id}
                    className={`flex items-center justify-between p-1.5 rounded cursor-pointer transition-colors ${
                      assignUserIds.includes(u._id) ? 'bg-indigo-50 text-indigo-900 font-semibold' : 'hover:bg-white text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${assignUserIds.includes(u._id) ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}>
                        {assignUserIds.includes(u._id) && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                      <input
                        type="checkbox"
                        checked={assignUserIds.includes(u._id)}
                        onChange={(e) =>
                          setAssignUserIds(
                            e.target.checked
                              ? [...assignUserIds, u._id]
                              : assignUserIds.filter((id) => id !== u._id),
                          )
                        }
                        className="sr-only"
                        aria-label={`Select ${u.email}`}
                      />
                      <span>{u.firstName || u.lastName ? `${u.firstName} ${u.lastName}` : u.email}</span>
                      <span className="text-[10px] text-slate-400 font-mono">({u.email})</span>
                    </div>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">{u.role}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Section 2: Provision brand new users by email */}
          <div className="pt-3 border-t border-slate-200">
            <span className="font-bold text-slate-800 uppercase tracking-wide block mb-1">
              2. Or Provision New Team Members (Optional)
            </span>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
              <div className="md:col-span-3">
                <label className="block text-[11px] text-slate-500 mb-1">Email Addresses (comma-separated)</label>
                <input
                  type="text"
                  value={newEmails}
                  onChange={(e) => setNewEmails(e.target.value)}
                  placeholder="agent1@company.com, agent2@company.com"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                />
              </div>
              <div>
                <CustomSelect
                  label="Role"
                  value={newRole}
                  onChange={(val) => setNewRole(val)}
                  options={[
                    { value: 'sales_executive', label: 'Sales Executive' },
                    { value: 'ads_manager', label: 'Ads Manager' },
                  ]}
                />
              </div>
              <div>
                <CustomSelect
                  label="Access Level"
                  value={newAccessLevel}
                  onChange={(val) => setNewAccessLevel(val)}
                  options={[
                    { value: 'full_manage', label: 'Full Manage' },
                    { value: 'view_only', label: 'View Only' },
                  ]}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <Button variant="secondary" onClick={() => setAddUsersBranchId(null)} size="sm">
              Cancel
            </Button>
            <Button onClick={handleAddAssignUsers} loading={addUsersLoading} size="sm">
              Assign / Provision Team
            </Button>
          </div>
        </div>
      </Modal>

      {/* 3. MODAL: View Branch Team Members */}
      <Modal
        isOpen={!!viewTeamBranchId}
        onClose={() => setViewTeamBranchId(null)}
        title={`Team Members — ${targetBranch?.name || 'Branch'}`}
        size="xl"
      >
        <div className="space-y-3">
          <div className="flex justify-between items-center pb-2 border-b border-slate-200">
            <span className="text-xs font-semibold text-slate-500">
              Total Members: {viewTeamMembers.length}
            </span>
            <Button
              size="sm"
              onClick={() => {
                const bId = viewTeamBranchId;
                setViewTeamBranchId(null);
                setAddUsersBranchId(bId);
                setAssignUserIds([]);
                setNewEmails('');
              }}
            >
              + Add / Assign Users
            </Button>
          </div>

          {viewTeamLoading ? (
            <div className="py-8 text-center text-xs text-slate-400">Loading team members…</div>
          ) : viewTeamMembers.length === 0 ? (
            <div className="py-8 text-center text-slate-400">
              <p className="text-sm font-semibold">No team assigned to this branch yet</p>
              <p className="text-xs mt-1">Use the "+ Add / Assign Users" button above to assign staff.</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                    <th className="py-2 px-3">Name</th>
                    <th className="py-2 px-3">Email</th>
                    <th className="py-2 px-3">Role</th>
                    <th className="py-2 px-3">Access ID</th>
                    <th className="py-2 px-3">Access Level</th>
                    <th className="py-2 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {viewTeamMembers.map((m: any) => (
                    <tr key={m.email} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-2 px-3 font-semibold text-slate-800">
                        {m.firstName || m.lastName ? `${m.firstName || ''} ${m.lastName || ''}` : '—'}
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-600">{m.email}</td>
                      <td className="py-2 px-3">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px]">
                          {m.role}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-mono font-bold text-indigo-700">{m.accessId || '—'}</td>
                      <td className="py-2 px-3 text-slate-600 capitalize">
                        {m.accessLevel ? m.accessLevel.replace('_', ' ') : 'Full Manage'}
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                            m.onboardingStatus === 'active' || m.isActive
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          ● {m.onboardingStatus || 'active'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>

      {/* 4. MODAL: Team Credentials Popup (Saved Logins) */}
      <Modal
        isOpen={!!credentials}
        onClose={() => setCredentials(null)}
        title="Team Provisioned — Save Logins"
        size="md"
      >
        <div className="space-y-3">
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
            ⚠️ <strong>One-time display:</strong> Temporary passwords cannot be viewed again. Please copy and store them securely or send them to the team.
          </p>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {credentials?.map((c) => (
              <div key={c.email} className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Email:</span>
                  <span className="font-bold text-slate-800">{c.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Access ID:</span>
                  <span className="font-bold text-indigo-600">{c.accessId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Temp Password:</span>
                  <span className="font-bold text-emerald-600 bg-emerald-50 px-1 rounded">{c.tempPassword}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Role:</span>
                  <span className="text-slate-600">{c.role}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <Button variant="secondary" onClick={() => setCredentials(null)} size="sm">
              Dismiss
            </Button>
            <Button onClick={copyAllCredentials} size="sm">
              {copied ? '✓ Copied All!' : 'Copy All Credentials'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* 5. MODAL: Delete Branch Confirmation */}
      <ConfirmModal
        isOpen={!!branchToDelete}
        onClose={() => setBranchToDelete(null)}
        onConfirm={handleConfirmDeleteBranch}
        title="Delete Branch"
        message={`Are you sure you want to delete branch "${branchToDelete?.name}"? Assigned leads and team members may need reassignment. This action cannot be undone.`}
        confirmText="Delete Branch"
        variant="danger"
        loading={isDeletingBranch}
      />
    </div>
  );
};

/* -------------------------------------------------------------------------
   Modern Compact Table Row with 3-Dot ActionMenu
------------------------------------------------------------------------- */
const BranchTableRow: React.FC<{
  b: any;
  isActiveBranch: boolean;
  canUpdateBranch: boolean;
  canDeleteBranch: boolean;
  canManageBranchTeam: boolean;
  onSelectActive: () => void;
  onEdit: () => void;
  onViewTeam: () => void;
  onAddUsers: () => void;
  onDelete: () => void;
}> = ({
  b,
  isActiveBranch,
  canUpdateBranch,
  canDeleteBranch,
  canManageBranchTeam,
  onSelectActive,
  onEdit,
  onViewTeam,
  onAddUsers,
  onDelete,
}) => {
  const toast = useToast();
  const { data: companyData } = useQuery({
    queryKey: ['company-default', b.companyId],
    queryFn: () => api.get(`/companies/${b.companyId}`).then((r) => r.data),
    retry: false,
  });
  const isDefault = Boolean(b.isDefault || (companyData as any)?.data?.defaultBranchId === b._id);

  const { data: teamData } = useQuery({
    queryKey: ['branch-team-count', b._id],
    queryFn: () => api.get(`/branches/${b._id}/users`).then((r) => r.data),
    retry: false,
  });
  const teamCount = (teamData as any)?.data?.length || 0;

  const menuItems: ActionMenuItem[] = [
    ...(!isActiveBranch
      ? [
          {
            label: 'Switch Active Scope to this Branch',
            onClick: onSelectActive,
            icon: (
              <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            ),
          },
        ]
      : []),
    {
      label: 'Edit Branch',
      onClick: onEdit,
      disabled: !canUpdateBranch,
      tooltip: !canUpdateBranch ? NO_UPDATE_BRANCH_PERMISSION : undefined,
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      ),
    },
    {
      label: 'View Team Members',
      onClick: onViewTeam,
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      label: 'Add / Assign Users',
      onClick: onAddUsers,
      disabled: !canManageBranchTeam,
      tooltip: !canManageBranchTeam ? NO_MANAGE_BRANCH_TEAM_PERMISSION : undefined,
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
        </svg>
      ),
    },
    ...(!isDefault
      ? [
          {
            label: 'Delete Branch',
            danger: true,
            onClick: onDelete,
            disabled: !canDeleteBranch,
            tooltip: !canDeleteBranch ? NO_DELETE_BRANCH_PERMISSION : undefined,
            icon: (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            ),
          },
        ]
      : []),
  ];

  return (
    <tr
      className={`transition-colors group ${
        isActiveBranch
          ? 'bg-indigo-50/50 hover:bg-indigo-50/75 border-l-4 border-l-indigo-600'
          : 'hover:bg-slate-50/75'
      }`}
    >
      {/* Branch Name */}
      <td className="py-3.5 px-5">
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-xl border flex items-center justify-center font-bold text-xs shrink-0 shadow-xs ${
              isActiveBranch
                ? 'bg-indigo-600 border-indigo-700 text-white'
                : 'bg-gradient-to-br from-indigo-50 to-indigo-100/70 border-indigo-200/60 text-indigo-700'
            }`}
          >
            {b.name?.charAt(0)?.toUpperCase() || 'B'}
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-sm font-semibold leading-tight truncate ${
                  canUpdateBranch
                    ? 'text-slate-900 hover:text-indigo-600 transition-colors cursor-pointer'
                    : 'text-slate-700 cursor-not-allowed'
                }`}
                onClick={() => {
                  if (!canUpdateBranch) {
                    toast.warning('Access Restricted', NO_UPDATE_BRANCH_PERMISSION);
                    return;
                  }
                  onEdit();
                }}
                title={!canUpdateBranch ? NO_UPDATE_BRANCH_PERMISSION : undefined}
              >
                {b.name}
              </span>
              {isActiveBranch && (
                <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-300 tracking-wider uppercase shrink-0 flex items-center gap-1 shadow-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  CURRENT ACTIVE
                </span>
              )}
              {isDefault && (
                <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 tracking-wider uppercase shrink-0 flex items-center gap-1">
                  ★ DEFAULT / PRIMARY
                </span>
              )}
            </div>
            {isActiveBranch ? (
              <span className="text-[11px] text-emerald-600 font-semibold mt-1 flex items-center gap-1">
                ● Currently Selected Branch Scope
              </span>
            ) : isDefault ? (
              <span className="text-[11px] text-indigo-600 font-medium mt-1 flex items-center gap-1">
                Default Admin Primary Branch
              </span>
            ) : b.parentBranchId ? (
              <span className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                <span>↳</span> Sub-branch
              </span>
            ) : (
              <span className="text-[11px] text-slate-400 mt-1">Secondary Branch</span>
            )}
          </div>
        </div>
      </td>

      {/* Code */}
      <td className="py-3.5 px-4">
        <span className="inline-flex items-center font-mono text-xs font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
          {b.branchCode || '—'}
        </span>
      </td>

      {/* Type */}
      <td className="py-3.5 px-4">
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 capitalize border border-slate-200/60">
          {b.branchType?.replace(/_/g, ' ') || 'sales office'}
        </span>
      </td>

      {/* Location */}
      <td className="py-3.5 px-4 text-slate-600">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-slate-800 leading-tight">
            {b.location || '—'}
          </span>
          <span className="text-xs text-slate-400 font-mono mt-1 flex items-center gap-1">
            <svg className="w-3 h-3 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {b.timezone || 'UTC'}
          </span>
        </div>
      </td>

      {/* Status */}
      <td className="py-3.5 px-4">
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
            b.status === 'active'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
              : 'bg-slate-100 text-slate-600 border-slate-200'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${b.status === 'active' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
          {b.status === 'active' ? 'Active' : 'Inactive'}
        </span>
      </td>

      {/* Team count & view button */}
      <td className="py-3.5 px-4">
        <button
          type="button"
          onClick={onViewTeam}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50/70 hover:bg-indigo-100/80 px-2.5 py-1 rounded-lg border border-indigo-100 transition-colors"
        >
          <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <span>{teamCount} member{teamCount === 1 ? '' : 's'}</span>
        </button>
      </td>

      {/* Three Dot Action Menu */}
      <td className="py-3.5 px-5 text-right">
        <ActionMenu items={menuItems} align="right" />
      </td>
    </tr>
  );
};

export default BranchesPage;

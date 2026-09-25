import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import Modal from '../components/common/Modal';
import Toggle from '../components/common/Toggle';
import ConfirmModal from '../components/common/ConfirmModal';
import CustomSelect, { SelectOption } from '../components/common/CustomSelect';
import CustomDatePicker from '../components/common/CustomDatePicker';
import { useToast } from '../components/common/Toast';
import { useGet } from '../hooks/useApi';
import { useRealtime } from '../hooks/useRealtime';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  Table,
  Kanban,
  UserCheck,
  Sparkles,
  Plus,
  Flame,
  Zap,
  Snowflake,
  Calendar,
  Clock,
  CheckCircle,
  AlertCircle,
  Phone,
  Video,
  Mail,
  MessageSquare,
  CheckSquare,
  Square,
  User,
  Trash2,
  Edit,
  Globe,
} from 'lucide-react';

function nameMap(rows: any[], label: (r: any) => string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const r of rows) map[r._id] = label(r);
  return map;
}

const STATUS_OPTIONS: SelectOption[] = [
  { value: '', label: 'All Statuses' },
  { value: 'new', label: 'New', badge: 'NEW', badgeColor: 'bg-blue-100 text-blue-700' },
  { value: 'contacted', label: 'Contacted', badge: 'CONTACTED', badgeColor: 'bg-amber-100 text-amber-700' },
  { value: 'qualified', label: 'Qualified', badge: 'QUALIFIED', badgeColor: 'bg-emerald-100 text-emerald-700' },
  { value: 'proposal', label: 'Proposal', badge: 'PROPOSAL', badgeColor: 'bg-purple-100 text-purple-700' },
  { value: 'converted', label: 'Converted', badge: 'CONVERTED', badgeColor: 'bg-indigo-100 text-indigo-700' },
  { value: 'lost', label: 'Lost', badge: 'LOST', badgeColor: 'bg-rose-100 text-rose-700' },
];

const SOURCE_OPTIONS: SelectOption[] = [
  { value: '', label: 'All Sources' },
  { value: 'website_form', label: 'Website Form' },
  { value: 'meta_ads', label: 'Meta Ads' },
  { value: 'meta_lead_ads', label: 'Meta Ads' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'referral', label: 'Referral' },
  { value: 'manual', label: 'Manual' },
  { value: 'csv_import', label: 'CSV Import' },
];

const FOLLOWUP_TYPE_ICONS: Record<string, React.ReactNode> = {
  call: <Phone size={11} className="text-blue-500" />,
  meeting: <Video size={11} className="text-purple-500" />,
  email: <Mail size={11} className="text-emerald-500" />,
  whatsapp: <MessageSquare size={11} className="text-green-500" />,
};

interface LeadFormState {
  name: string;
  email: string;
  phone: string;
  company: string;
  companyId: string;
  branchId: string;
  status: string;
  source: string;
  priority: string;
  score: number;
  assignedTo: string;
  notes: string;
}

const initialForm: LeadFormState = {
  name: '',
  email: '',
  phone: '',
  company: '',
  companyId: '',
  branchId: '',
  status: 'new',
  source: 'meta_ads',
  priority: 'medium',
  score: 65,
  assignedTo: '',
  notes: '',
};

const LeadsPage: React.FC = () => {
  const { user, activeBranchId, hasPermission } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const isSuper = user?.role === 'SUPER_ADMIN';

  const canCreate = hasPermission('leads:create');
  const canUpdate = hasPermission('leads:update');
  const canDelete = hasPermission('leads:delete');
  const canAssign = hasPermission('leads:assign');
  const canExport = hasPermission('leads:export');

  const NO_CREATE_PERMISSION = 'You do not have permission to create leads. Please contact your company administrator to request access.';
  const NO_UPDATE_PERMISSION = 'You do not have permission to edit leads. Please contact your company administrator to request access.';
  const NO_DELETE_PERMISSION = 'You do not have permission to delete leads. Please contact your company administrator to request access.';
  const NO_ASSIGN_PERMISSION = 'You do not have permission to assign leads. Please contact your company administrator to request access.';
  const NO_EXPORT_PERMISSION = 'You do not have permission to export leads. Please contact your company administrator to request access.';

  // Real-time live synchronization
  const { isConnected } = useRealtime({
    onLeadCreated: (lead) => {
      queryClient.invalidateQueries({ queryKey: ['/leads?limit=300'] });
      toast.info(`⚡ Live Lead Received: ${lead?.name || 'Inbound'} (${lead?.source || 'Meta'})`);
    },
    onLeadUpdated: () => {
      queryClient.invalidateQueries({ queryKey: ['/leads?limit=300'] });
    },
  });

  // Leads Query
  const { data, isLoading } = useGet('/leads?limit=300');
  const leads: any[] = (data as any)?.data || [];

  // Users and Branches
  const { data: usersData } = useQuery({
    queryKey: ['users-map'],
    queryFn: () => api.get('/users').then((r) => r.data),
    retry: false,
  });
  const usersList: any[] = (usersData as any)?.data || [];
  const usersById = useMemo(
    () => nameMap(usersList, (u) => `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email),
    [usersList]
  );

  const { data: branchesData } = useQuery({
    queryKey: ['branches-map'],
    queryFn: () => api.get('/branches').then((r) => r.data),
    retry: false,
  });
  const branchesList: any[] = (branchesData as any)?.data || [];
  const branchesById = useMemo(() => nameMap(branchesList, (b) => b.name), [branchesList]);

  // Companies for Super Admin
  const { data: companiesData } = useQuery({
    queryKey: ['companies-list'],
    queryFn: () => api.get('/companies').then((r) => r.data),
    enabled: isSuper,
    retry: false,
  });
  const companiesList: any[] = (companiesData as any)?.data || [];

  // Filtering states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  // Bulk Selection
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [batchTargetAgent, setBatchTargetAgent] = useState('');
  const [isConfirmBatchOpen, setIsConfirmBatchOpen] = useState(false);

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [form, setForm] = useState<LeadFormState>(initialForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Follow-Up Modal
  const [isFollowUpModalOpen, setIsFollowUpModalOpen] = useState(false);
  const [selectedFollowUpLead, setSelectedFollowUpLead] = useState<any>(null);
  const [followUpForm, setFollowUpForm] = useState({
    scheduledDate: '',
    type: 'call',
    note: '',
    isCompleted: false,
    outcome: '',
  });

  // Delete & Seed Confirmation
  const [leadToDelete, setLeadToDelete] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [isSeedModalOpen, setIsSeedModalOpen] = useState(false);

  // Dynamic Options
  const branchOptions: SelectOption[] = useMemo(() => {
    return [
      { value: '', label: 'All Branches' },
      ...branchesList.map((b) => ({ value: b._id, label: b.name })),
    ];
  }, [branchesList]);

  const formBranchOptions: SelectOption[] = useMemo(() => {
    return branchesList
      .filter((b) => !form.companyId || b.companyId === form.companyId)
      .map((b) => ({ value: b._id, label: b.name }));
  }, [branchesList, form.companyId]);

  const userOptions: SelectOption[] = useMemo(() => {
    return [
      { value: '', label: 'Unassigned' },
      ...usersList.map((u) => ({
        value: u._id,
        label: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email,
        subLabel: u.role?.replace('_', ' '),
      })),
    ];
  }, [usersList]);

  // Filtered Leads
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      // Text search across name, email, phone, company, tags, campaign/ad name
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchName = lead.name?.toLowerCase().includes(term);
        const matchEmail = lead.email?.toLowerCase().includes(term);
        const matchPhone = lead.phone?.toLowerCase().includes(term);
        const matchCompany = lead.company?.toLowerCase().includes(term);
        const matchTags = Array.isArray(lead.tags) && lead.tags.some((t: string) => t.toLowerCase().includes(term));
        const matchMeta =
          lead.metadata?.adName?.toLowerCase().includes(term) ||
          lead.metadata?.campaignName?.toLowerCase().includes(term);
        if (!matchName && !matchEmail && !matchPhone && !matchCompany && !matchTags && !matchMeta) return false;
      }
      // Status (case-insensitive)
      if (statusFilter && (lead.status || '').toLowerCase() !== statusFilter.toLowerCase()) return false;
      // Source (robust matching for Meta Ads / WhatsApp / forms)
      if (sourceFilter) {
        const s = (lead.source || '').toLowerCase();
        const sf = sourceFilter.toLowerCase();
        if (sf === 'meta_ads' || sf === 'meta_lead_ads') {
          const isMeta =
            s.includes('meta') ||
            (Array.isArray(lead.tags) && lead.tags.some((t: string) => t.toLowerCase().includes('meta')));
          if (!isMeta) return false;
        } else if (s !== sf) {
          return false;
        }
      }
      // Branch
      if (branchFilter && lead.branchId !== branchFilter) return false;
      // Date filter (YYYY-MM-DD prefix match)
      if (dateFilter) {
        const leadDate = new Date(lead.createdAt).toISOString().slice(0, 10);
        if (leadDate !== dateFilter) return false;
      }
      return true;
    });
  }, [leads, searchTerm, statusFilter, sourceFilter, branchFilter, dateFilter]);

  // Seed Demo Mutation
  const seedDemoMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/leads/seed-demo', {});
      return res.data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/leads'] });
      queryClient.invalidateQueries({ queryKey: ['leads-pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['leads-assignment'] });
      toast.success('12 Demo Leads Seeded', data.message || '12 rich demo leads seeded successfully!');
      setIsSeedModalOpen(false);
    },
    onError: (err: any) => {
      toast.error('Seed Failed', err.response?.data?.error || 'Failed to seed leads');
    },
  });

  // Batch Assign Mutation
  const batchAssignMutation = useMutation({
    mutationFn: async ({ leadIds, assignedTo }: { leadIds: string[]; assignedTo: string }) => {
      const res = await api.post('/leads/batch-assign', {
        leadIds,
        assignedTo: assignedTo || null,
      });
      return res.data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/leads'] });
      queryClient.invalidateQueries({ queryKey: ['leads-pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['leads-assignment'] });
      toast.success('Assignment Complete', data.message || `Assigned ${selectedLeadIds.length} lead(s) successfully!`);
      setSelectedLeadIds([]);
      setBatchTargetAgent('');
      setIsConfirmBatchOpen(false);
    },
    onError: (err: any) => {
      toast.error('Assignment Failed', err.response?.data?.error || 'Failed to batch assign leads');
    },
  });

  // Follow-Up Mutation
  const followUpMutation = useMutation({
    mutationFn: async ({ leadId, followUpData }: { leadId: string; followUpData: any }) => {
      const currentMeta = selectedFollowUpLead?.metadata || {};
      const updatedMeta = {
        ...currentMeta,
        followUp: followUpData,
      };
      const res = await api.put(`/leads/${leadId}`, { metadata: updatedMeta });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/leads'] });
      queryClient.invalidateQueries({ queryKey: ['leads-pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['leads-assignment'] });
      toast.success('Follow-Up Scheduled', 'Follow-up scheduled successfully');
      setIsFollowUpModalOpen(false);
    },
    onError: (err: any) => {
      toast.error('Save Failed', err.response?.data?.error || 'Failed to save follow-up');
    },
  });

  // Form handling
  const openCreateModal = () => {
    setEditingLeadId(null);
    setForm({
      ...initialForm,
      companyId: user?.companyId || (companiesList[0]?._id || ''),
      branchId: activeBranchId || branchesList[0]?._id || '',
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  const openEditModal = (lead: any) => {
    setEditingLeadId(lead._id);
    setForm({
      name: lead.name || '',
      email: lead.email || '',
      phone: lead.phone || '',
      company: lead.company || '',
      companyId: lead.companyId || user?.companyId || '',
      branchId: lead.branchId || '',
      status: (lead.status || 'new').toLowerCase(),
      source: lead.source || 'meta_ads',
      priority: lead.priority || 'medium',
      score: lead.score ?? 65,
      assignedTo: lead.assignedTo || '',
      notes: lead.message || '',
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = 'Contact name is required';
    if (!form.email.trim() && !form.phone.trim()) {
      errors.phone = 'Either phone number or email is required';
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errors.email = 'Please enter a valid email address';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      if (editingLeadId) {
        await api.put(`/leads/${editingLeadId}`, form);
        toast.success('Lead Updated', `Lead '${form.name}' updated successfully.`);
      } else {
        await api.post('/leads', form);
        toast.success('Lead Created', `Lead '${form.name}' created successfully.`);
      }
      queryClient.invalidateQueries({ queryKey: ['/leads'] });
      queryClient.invalidateQueries({ queryKey: ['leads-pipeline'] });
      setIsModalOpen(false);
    } catch (err: any) {
      toast.error('Save Failed', err?.response?.data?.error || 'Failed to save lead');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteLead = async () => {
    if (!leadToDelete) return;
    if (!canDelete) {
      toast.error('Permission Denied', NO_DELETE_PERMISSION);
      setLeadToDelete(null);
      return;
    }
    setDeleting(true);
    try {
      await api.delete(`/leads/${leadToDelete._id}`);
      toast.success('Lead Deleted', `Lead '${leadToDelete.name}' has been deleted.`);
      queryClient.invalidateQueries({ queryKey: ['/leads'] });
      queryClient.invalidateQueries({ queryKey: ['leads-pipeline'] });
      setLeadToDelete(null);
    } catch (err: any) {
      toast.error('Delete Failed', err?.response?.data?.error || 'Failed to delete lead');
    } finally {
      setDeleting(false);
    }
  };

  const handleExportCSV = async () => {
    if (!canExport) {
      toast.error('Permission Denied', NO_EXPORT_PERMISSION);
      return;
    }
    try {
      const res = await api.get('/leads/export', { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leads-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Export Successful', 'Leads CSV downloaded.');
    } catch (err: any) {
      toast.error('Export Failed', err?.response?.data?.error || 'Failed to export leads');
    }
  };

  // Follow-Up modal open
  const openFollowUpModal = (lead: any) => {
    setSelectedFollowUpLead(lead);
    const existing = lead.metadata?.followUp;
    if (existing) {
      setFollowUpForm({
        scheduledDate: existing.scheduledAt ? new Date(existing.scheduledAt).toISOString().split('T')[0] : '',
        type: existing.type || 'call',
        note: existing.note || '',
        isCompleted: existing.completed || false,
        outcome: existing.outcome || '',
      });
    } else {
      setFollowUpForm({
        scheduledDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        type: 'call',
        note: '',
        isCompleted: false,
        outcome: '',
      });
    }
    setIsFollowUpModalOpen(true);
  };

  // Checkbox helpers
  const handleSelectLead = (id: string) => {
    setSelectedLeadIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedLeadIds.length === filteredLeads.length) {
      setSelectedLeadIds([]);
    } else {
      setSelectedLeadIds(filteredLeads.map((l) => l._id));
    }
  };

  // Helper for Score Pill
  const renderScorePill = (score?: number) => {
    const val = score ?? 50;
    if (val >= 80) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
          <Flame size={11} className="text-rose-600 fill-rose-500" />
          {val} Hot
        </span>
      );
    }
    if (val >= 60) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
          <Zap size={11} className="text-amber-600 fill-amber-500" />
          {val} Warm
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
        <Snowflake size={11} className="text-blue-500" />
        {val} Cold
      </span>
    );
  };

  // Helper for Follow-up indicator in Table
  const renderFollowUpIndicator = (lead: any) => {
    const fu = lead.metadata?.followUp;
    if (!fu) {
      return (
        <button
          onClick={() => openFollowUpModal(lead)}
          className="text-[11px] font-medium text-slate-400 hover:text-indigo-600 flex items-center gap-1 transition-colors"
        >
          <Calendar size={11} /> + Schedule
        </button>
      );
    }

    if (fu.completed) {
      return (
        <div
          onClick={() => openFollowUpModal(lead)}
          className="cursor-pointer inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200"
          title={`Completed: ${fu.outcome || ''}`}
        >
          <CheckCircle size={11} className="text-emerald-600" />
          Done
          {fu.type && FOLLOWUP_TYPE_ICONS[fu.type]}
        </div>
      );
    }

    const isOverdue = fu.scheduledAt && new Date(fu.scheduledAt).getTime() < Date.now();
    const dateStr = fu.scheduledAt
      ? new Date(fu.scheduledAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : '';

    return (
      <div
        onClick={() => openFollowUpModal(lead)}
        className={`cursor-pointer inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded border ${
          isOverdue
            ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
            : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
        }`}
      >
        {isOverdue ? <AlertCircle size={11} className="text-rose-600" /> : <Clock size={11} className="text-indigo-600" />}
        {fu.type && FOLLOWUP_TYPE_ICONS[fu.type]}
        <span>{isOverdue ? `Overdue (${dateStr})` : dateStr}</span>
      </div>
    );
  };

  return (
    <div className="space-y-3.5 pb-16">
      {/* Top Header & View Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            <h2 className="text-lg font-black text-slate-900 tracking-tight">Leads Management</h2>
            <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              {filteredLeads.length} Leads
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                isConnected
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-50 text-slate-500 border-slate-200'
              }`}
              title={isConnected ? 'Connected to real-time webhook event stream' : 'Reconnecting to real-time event stream'}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              {isConnected ? 'Real-Time Sync' : 'Connecting...'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Full lifecycle lead tracking, scoring breakdown, assignment routing, and follow-ups.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-semibold">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white text-indigo-700 shadow-sm font-bold">
              <Table size={13} /> Table
            </div>
            <Link
              to="/leads/pipeline"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-slate-600 hover:text-slate-900 hover:bg-white/60 transition-all"
            >
              <Kanban size={13} /> Pipeline
            </Link>
            <Link
              to="/leads/assignment"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-slate-600 hover:text-slate-900 hover:bg-white/60 transition-all"
            >
              <UserCheck size={13} /> Assignment
            </Link>
          </div>

          <Button
            size="sm"
            variant="secondary"
            onClick={() => setIsSeedModalOpen(true)}
            className="flex items-center gap-1.5 border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold"
          >
            <Sparkles size={14} className="text-indigo-600" />
            Seed Demo Leads
          </Button>

          <Button
            size="sm"
            variant="secondary"
            disabled={!canExport}
            onClick={handleExportCSV}
            title={!canExport ? NO_EXPORT_PERMISSION : 'Export Leads to CSV'}
            className="font-bold text-xs disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Export CSV
          </Button>

          <Button
            size="sm"
            disabled={!canCreate}
            onClick={openCreateModal}
            title={!canCreate ? NO_CREATE_PERMISSION : 'Create New Lead'}
            className="flex items-center gap-1.5 font-bold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus size={14} />
            Add Lead
          </Button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5 items-center">
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search name, phone, email, company..."
              className="w-full text-xs px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white"
            />
          </div>

          <CustomSelect
            compact
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={setStatusFilter}
            placeholder="Filter Status"
          />

          <CustomSelect
            compact
            options={SOURCE_OPTIONS}
            value={sourceFilter}
            onChange={setSourceFilter}
            placeholder="Filter Source"
          />

          <CustomSelect
            compact
            options={branchOptions}
            value={branchFilter}
            onChange={setBranchFilter}
            placeholder="Filter Branch"
          />

          <CustomDatePicker
            compact
            value={dateFilter}
            onChange={setDateFilter}
            placeholder="Filter Date"
          />
        </div>

        {(searchTerm || statusFilter || sourceFilter || branchFilter || dateFilter) && (
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              Showing <strong>{filteredLeads.length}</strong> of {leads.length} leads
            </span>
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('');
                setSourceFilter('');
                setBranchFilter('');
                setDateFilter('');
              }}
              className="text-indigo-600 hover:text-indigo-800 font-bold hover:underline"
            >
              Reset all filters
            </button>
          </div>
        )}
      </div>

      {/* Sticky Floating Batch Bar */}
      {selectedLeadIds.length > 0 && (
        <div className="sticky top-16 z-20 bg-slate-900 text-white p-3 rounded-xl shadow-xl border border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-indigo-500 text-white font-extrabold text-[11px] flex items-center justify-center">
              {selectedLeadIds.length}
            </span>
            <span className="text-xs font-bold text-slate-200">
              Selected leads for batch assignment
            </span>
            <button
              onClick={() => setSelectedLeadIds([])}
              className="text-[11px] text-slate-400 hover:text-white underline ml-2"
            >
              Clear
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="w-56 text-slate-900">
              <CustomSelect
                placeholder="Assign to Sales Rep..."
                options={userOptions}
                value={batchTargetAgent}
                onChange={setBatchTargetAgent}
                compact
              />
            </div>

            <Button
              size="sm"
              disabled={!batchTargetAgent || !canAssign}
              title={!canAssign ? NO_ASSIGN_PERMISSION : !batchTargetAgent ? 'Select a sales representative to assign' : 'Assign selected leads'}
              onClick={() => {
                if (!canAssign) {
                  toast.warning('Access Restricted', NO_ASSIGN_PERMISSION);
                  return;
                }
                setIsConfirmBatchOpen(true);
              }}
              className={`text-white font-bold shrink-0 ${!canAssign ? 'opacity-40 cursor-not-allowed bg-slate-400' : 'bg-indigo-500 hover:bg-indigo-600'}`}
            >
              Apply Assignment
            </Button>
          </div>
        </div>
      )}

      {/* Leads Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-xs text-slate-400">Loading leads data...</div>
        ) : filteredLeads.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-bold text-slate-700">No leads found</p>
            <p className="text-xs text-slate-400 mt-1">Try adjusting your filters or click "Seed Demo Leads" above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-extrabold">
                  <th className="py-2.5 px-3 w-9 text-center">
                    <button
                      onClick={handleSelectAll}
                      className="text-slate-400 hover:text-indigo-600 flex items-center justify-center mx-auto"
                    >
                      {selectedLeadIds.length > 0 && selectedLeadIds.length === filteredLeads.length ? (
                        <CheckSquare size={15} className="text-indigo-600" />
                      ) : (
                        <Square size={15} />
                      )}
                    </button>
                  </th>
                  <th className="py-2.5 px-3 text-slate-800">Lead Contact</th>
                  <th className="py-2.5 px-3 text-slate-800">Score</th>
                  <th className="py-2.5 px-3 text-slate-800">Stage</th>
                  <th className="py-2.5 px-3 text-slate-800">Source / Tags</th>
                  <th className="py-2.5 px-3 text-slate-800">Follow-Up</th>
                  <th className="py-2.5 px-3 text-slate-800">Branch</th>
                  <th className="py-2.5 px-3 text-slate-800">Assigned Agent</th>
                  <th className="py-2.5 px-3 text-right text-slate-800">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLeads.map((lead) => {
                  const isSelected = selectedLeadIds.includes(lead._id);
                  const agentName = lead.assignedTo ? usersById[lead.assignedTo] : null;
                  const isMeta =
                    lead.source === 'meta_ads' ||
                    lead.source === 'META_LEAD_ADS' ||
                    lead.source === 'meta' ||
                    (Array.isArray(lead.tags) && lead.tags.some((t: string) => t.toLowerCase().includes('meta')));

                  return (
                    <tr
                      key={lead._id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isSelected ? 'bg-indigo-50/30' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={() => handleSelectLead(lead._id)}
                          className="text-slate-400 hover:text-indigo-600 flex items-center justify-center mx-auto"
                        >
                          {isSelected ? (
                            <CheckSquare size={15} className="text-indigo-600" />
                          ) : (
                            <Square size={15} />
                          )}
                        </button>
                      </td>

                      {/* Lead Contact */}
                      <td className="py-2.5 px-3">
                        <Link
                          to={`/leads/${lead._id}`}
                          className="font-bold text-slate-900 hover:text-indigo-600 transition-colors"
                        >
                          {lead.name}
                        </Link>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                          {lead.company && <span className="font-semibold text-slate-700">{lead.company} •</span>}
                          <span>{lead.phone || lead.email}</span>
                        </div>
                      </td>

                      {/* Score Pill */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {renderScorePill(lead.score)}
                      </td>

                      {/* Stage */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase ${
                            lead.status === 'new'
                              ? 'bg-blue-100 text-blue-700'
                              : lead.status === 'qualified'
                              ? 'bg-amber-100 text-amber-700'
                              : lead.status === 'proposal'
                              ? 'bg-purple-100 text-purple-700'
                              : lead.status === 'converted'
                              ? 'bg-emerald-100 text-emerald-700'
                              : lead.status === 'lost'
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-indigo-100 text-indigo-700'
                          }`}
                        >
                          {lead.status || 'new'}
                        </span>
                      </td>

                      {/* Source & Tags */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="flex flex-col gap-1 items-start">
                          {isMeta ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              <Globe size={10} /> Meta Ads
                            </span>
                          ) : lead.source === 'whatsapp' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              WhatsApp
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                              {lead.source || 'Direct'}
                            </span>
                          )}
                          {((lead.tags && lead.tags.length > 0) || lead.metadata?.adName || lead.metadata?.campaignName) && (
                            <span
                              className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded truncate max-w-[150px]"
                              title={lead.metadata?.adName || lead.metadata?.campaignName || lead.tags?.[0]}
                            >
                              {lead.metadata?.adName || lead.metadata?.campaignName || lead.tags?.[0]}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Follow-up */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {renderFollowUpIndicator(lead)}
                      </td>

                      {/* Branch */}
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-600">
                        {lead.branchId ? branchesById[lead.branchId] || 'Branch' : 'Default'}
                      </td>

                      {/* Assigned Agent */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {agentName ? (
                          <span className="font-bold text-slate-800 flex items-center gap-1">
                            <User size={11} className="text-slate-400" />
                            {agentName}
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                            Unassigned
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => {
                              if (!canUpdate) {
                                toast.warning('Access Restricted', NO_UPDATE_PERMISSION);
                                return;
                              }
                              openEditModal(lead);
                            }}
                            disabled={!canUpdate}
                            title={!canUpdate ? NO_UPDATE_PERMISSION : 'Edit Lead'}
                            className={`p-1 rounded transition-colors ${
                              !canUpdate
                                ? 'text-slate-300 opacity-40 cursor-not-allowed'
                                : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-100'
                            }`}
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            onClick={() => {
                              if (!canDelete) {
                                toast.warning('Access Restricted', NO_DELETE_PERMISSION);
                                return;
                              }
                              setLeadToDelete(lead);
                            }}
                            disabled={!canDelete}
                            title={!canDelete ? NO_DELETE_PERMISSION : 'Delete Lead'}
                            className={`p-1 rounded transition-colors ${
                              !canDelete
                                ? 'text-slate-300 opacity-40 cursor-not-allowed'
                                : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                            }`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Follow-Up Action Modal */}
      <Modal
        isOpen={isFollowUpModalOpen}
        onClose={() => setIsFollowUpModalOpen(false)}
        title={`Follow-Up Flow: ${selectedFollowUpLead?.name || 'Lead'}`}
        size="md"
      >
        <div className="space-y-3.5">
          <p className="text-xs text-slate-500">Schedule appointments, log call notes, and track follow-up progress.</p>
          <div className="grid grid-cols-2 gap-3">
            <CustomDatePicker
              label="Scheduled Date *"
              value={followUpForm.scheduledDate}
              onChange={(d) => setFollowUpForm({ ...followUpForm, scheduledDate: d })}
              compact
            />

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Action Type *
              </label>
              <CustomSelect
                options={[
                  { value: 'call', label: 'Phone Call', icon: <Phone size={13} className="text-blue-500" /> },
                  { value: 'meeting', label: 'Video / In-person Meeting', icon: <Video size={13} className="text-purple-500" /> },
                  { value: 'email', label: 'Email', icon: <Mail size={13} className="text-emerald-500" /> },
                  { value: 'whatsapp', label: 'WhatsApp Message', icon: <MessageSquare size={13} className="text-green-500" /> },
                ]}
                value={followUpForm.type}
                onChange={(t) => setFollowUpForm({ ...followUpForm, type: t })}
                compact
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Agenda & Notes
            </label>
            <textarea
              rows={3}
              value={followUpForm.note}
              onChange={(e) => setFollowUpForm({ ...followUpForm, note: e.target.value })}
              placeholder="e.g. Inquire on branch requirements, discuss terms..."
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white resize-none"
            />
          </div>

          <div className="pt-2 border-t border-slate-100">
            <Toggle
              checked={followUpForm.isCompleted}
              onChange={(checked) => setFollowUpForm({ ...followUpForm, isCompleted: checked })}
              label="Mark Follow-Up as Completed"
            />

            {followUpForm.isCompleted && (
              <div className="mt-2.5">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Outcome / Resolution
                </label>
                <input
                  type="text"
                  value={followUpForm.outcome}
                  onChange={(e) => setFollowUpForm({ ...followUpForm, outcome: e.target.value })}
                  placeholder="e.g. Call connected, agreed to sign proposal"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white"
                />
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsFollowUpModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              loading={followUpMutation.isPending}
              onClick={() => {
                if (!followUpForm.scheduledDate) {
                  toast.warning('Please select a scheduled date');
                  return;
                }
                const followUpPayload = {
                  scheduledAt: new Date(followUpForm.scheduledDate).toISOString(),
                  type: followUpForm.type,
                  note: followUpForm.note,
                  completed: followUpForm.isCompleted,
                  completedAt: followUpForm.isCompleted ? new Date().toISOString() : undefined,
                  outcome: followUpForm.outcome || undefined,
                };
                followUpMutation.mutate({
                  leadId: selectedFollowUpLead._id,
                  followUpData: followUpPayload,
                });
              }}
            >
              Save Follow-up
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit / Create Lead Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingLeadId ? 'Edit Lead' : 'Register New Lead'}
        size="md"
      >
        <form onSubmit={handleSaveLead} className="space-y-3">
          <p className="text-xs text-slate-500">Manage lead profile, contact info, scoring, and ownership.</p>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Contact Name *"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              error={formErrors.name}
              required
            />
            <Input
              label="Company Name"
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
              placeholder="e.g. Acme Corp"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Phone Number"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              error={formErrors.phone}
              placeholder="+1 (555) 000-0000"
            />
            <Input
              label="Email Address"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              error={formErrors.email}
              placeholder="john@example.com"
            />
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Stage</label>
              <CustomSelect
                compact
                options={STATUS_OPTIONS.filter((o) => o.value !== '')}
                value={form.status}
                onChange={(val) => setForm({ ...form, status: val })}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Source</label>
              <CustomSelect
                compact
                options={SOURCE_OPTIONS.filter((o) => o.value !== '')}
                value={form.source}
                onChange={(val) => setForm({ ...form, source: val })}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Score (0-100)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={form.score}
                onChange={(e) => setForm({ ...form, score: Number(e.target.value) })}
                className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Branch</label>
              <CustomSelect
                compact
                placeholder="Select Branch..."
                options={formBranchOptions}
                value={form.branchId}
                onChange={(val) => setForm({ ...form, branchId: val })}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Assigned Agent</label>
              <CustomSelect
                compact
                placeholder="Unassigned"
                options={userOptions}
                value={form.assignedTo}
                onChange={(val) => setForm({ ...form, assignedTo: val })}
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" loading={submitting} onClick={handleSaveLead}>
              {editingLeadId ? 'Update Lead' : 'Create Lead'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Lead Confirm Modal */}
      <ConfirmModal
        isOpen={!!leadToDelete}
        onClose={() => setLeadToDelete(null)}
        onConfirm={handleDeleteLead}
        title="Delete Lead Confirmation"
        message={`Are you sure you want to permanently delete lead '${leadToDelete?.name}'? This action cannot be undone.`}
        confirmText="Delete Lead"
        variant="danger"
        loading={deleting}
      />

      {/* Batch Assign Confirm Modal */}
      <ConfirmModal
        isOpen={isConfirmBatchOpen}
        onClose={() => setIsConfirmBatchOpen(false)}
        onConfirm={() => {
          batchAssignMutation.mutate({
            leadIds: selectedLeadIds,
            assignedTo: batchTargetAgent,
          });
        }}
        title={`Assign ${selectedLeadIds.length} Leads?`}
        message={`Are you sure you want to assign ${selectedLeadIds.length} selected lead(s) to ${
          batchTargetAgent ? usersById[batchTargetAgent] || 'selected sales rep' : 'Unassigned'
        }?`}
        confirmText="Confirm Assignment"
        variant="primary"
        loading={batchAssignMutation.isPending}
      />

      {/* Seed Demo Leads Modal */}
      <ConfirmModal
        isOpen={isSeedModalOpen}
        onClose={() => setIsSeedModalOpen(false)}
        onConfirm={() => seedDemoMutation.mutate()}
        title="Seed Realistic Demo Leads?"
        message="This will insert 12 rich sample leads with scoring (38 to 98), follow-up schedules, notes, and stages into your company database."
        confirmText="Seed Demo Leads"
        variant="primary"
        loading={seedDemoMutation.isPending}
      />
    </div>
  );
};

export default LeadsPage;

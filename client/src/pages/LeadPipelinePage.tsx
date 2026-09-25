import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { useToast } from '../components/common/Toast';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../hooks/useRealtime';
import CustomSelect, { SelectOption } from '../components/common/CustomSelect';
import CustomDatePicker from '../components/common/CustomDatePicker';
import Modal from '../components/common/Modal';
import Toggle from '../components/common/Toggle';
import ConfirmModal from '../components/common/ConfirmModal';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import {
  Kanban,
  Table,
  UserCheck,
  Plus,
  Sparkles,
  Search,
  Phone,
  Mail,
  Building,
  Calendar,
  Clock,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  User,
  AlertCircle,
  Flame,
  Zap,
  Snowflake,
  MessageSquare,
  Video,
} from 'lucide-react';

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'proposal' | 'converted' | 'lost';

interface PipelineColumn {
  id: LeadStatus;
  title: string;
  badgeColor: string;
  headerBg: string;
  borderColor: string;
}

const PIPELINE_COLUMNS: PipelineColumn[] = [
  {
    id: 'new',
    title: 'New Leads',
    badgeColor: 'bg-blue-100 text-blue-700',
    headerBg: 'bg-blue-50/70 border-b border-blue-100',
    borderColor: 'border-blue-200',
  },
  {
    id: 'contacted',
    title: 'Contacted',
    badgeColor: 'bg-indigo-100 text-indigo-700',
    headerBg: 'bg-indigo-50/70 border-b border-indigo-100',
    borderColor: 'border-indigo-200',
  },
  {
    id: 'qualified',
    title: 'Qualified',
    badgeColor: 'bg-amber-100 text-amber-700',
    headerBg: 'bg-amber-50/70 border-b border-amber-100',
    borderColor: 'border-amber-200',
  },
  {
    id: 'proposal',
    title: 'Proposal Sent',
    badgeColor: 'bg-purple-100 text-purple-700',
    headerBg: 'bg-purple-50/70 border-b border-purple-100',
    borderColor: 'border-purple-200',
  },
  {
    id: 'converted',
    title: 'Won / Converted',
    badgeColor: 'bg-emerald-100 text-emerald-700',
    headerBg: 'bg-emerald-50/70 border-b border-emerald-100',
    borderColor: 'border-emerald-200',
  },
  {
    id: 'lost',
    title: 'Lost / Closed',
    badgeColor: 'bg-slate-100 text-slate-700',
    headerBg: 'bg-slate-50/70 border-b border-slate-200',
    borderColor: 'border-slate-200',
  },
];

const SOURCE_LABELS: Record<string, string> = {
  meta_ads: 'Meta Ads',
  meta_lead_ads: 'Meta Ads',
  whatsapp: 'WhatsApp',
  website_form: 'Website Form',
  google_ads: 'Google Ads',
  referral: 'Referral',
  manual: 'Manual',
};

const FOLLOWUP_TYPE_ICONS: Record<string, React.ReactNode> = {
  call: <Phone size={12} className="text-blue-500" />,
  meeting: <Video size={12} className="text-purple-500" />,
  email: <Mail size={12} className="text-emerald-500" />,
  whatsapp: <MessageSquare size={12} className="text-green-500" />,
};

const LeadPipelinePage: React.FC = () => {
  const { activeBranchId } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  // Real-time live synchronization
  const { isConnected } = useRealtime({
    onLeadCreated: (lead) => {
      queryClient.invalidateQueries({ queryKey: ['leads-pipeline'] });
      toast.info(`⚡ Live Pipeline: ${lead?.name || 'Inbound'} added to Pipeline`);
    },
    onLeadUpdated: () => {
      queryClient.invalidateQueries({ queryKey: ['leads-pipeline'] });
    },
  });

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');

  // Modals & Active Lead Selection
  const [isSeedModalOpen, setIsSeedModalOpen] = useState(false);
  const [isNewLeadModalOpen, setIsNewLeadModalOpen] = useState(false);
  const [isFollowUpModalOpen, setIsFollowUpModalOpen] = useState(false);
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<any>(null);

  // Drag and Drop state
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [activeDropColumn, setActiveDropColumn] = useState<LeadStatus | null>(null);

  // New Lead Form State
  const [newLeadForm, setNewLeadForm] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    status: 'new' as LeadStatus,
    priority: 'medium',
    score: 75,
    source: 'meta_ads',
    branchId: '',
    assignedTo: '',
    message: '',
  });

  // Follow-Up Form State
  const [followUpForm, setFollowUpForm] = useState({
    scheduledDate: '',
    type: 'call',
    note: '',
    isCompleted: false,
    outcome: '',
  });

  // Reassign Form State
  const [reassignForm, setReassignForm] = useState({
    assignedTo: '',
    branchId: '',
  });

  // Fetch Leads
  const { data: leadsData } = useQuery({
    queryKey: ['leads-pipeline', branchFilter, agentFilter, sourceFilter],
    queryFn: async () => {
      const params: any = { limit: 200 };
      if (branchFilter) params.branchId = branchFilter;
      if (agentFilter) params.assignedTo = agentFilter;
      if (sourceFilter) params.source = sourceFilter;
      const res = await api.get('/leads', { params });
      return res.data;
    },
  });
  const leads: any[] = leadsData?.data || [];

  // Fetch Users (Sales Agents)
  const { data: usersData } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => api.get('/users').then((r) => r.data),
  });
  const usersList: any[] = usersData?.data || [];

  // Fetch Branches
  const { data: branchesData } = useQuery({
    queryKey: ['branches-list'],
    queryFn: () => api.get('/branches').then((r) => r.data),
  });
  const branchesList: any[] = branchesData?.data || [];

  // Helper Maps
  const usersMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of usersList) {
      map[u._id] = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email;
    }
    return map;
  }, [usersList]);

  // Options for Dropdowns
  const branchOptions: SelectOption[] = useMemo(() => [
    { value: '', label: 'All Branches' },
    ...branchesList.map((b) => ({ value: b._id, label: b.name })),
  ], [branchesList]);

  const agentOptions: SelectOption[] = useMemo(() => [
    { value: '', label: 'All Sales Agents' },
    { value: 'unassigned', label: 'Unassigned Leads Only' },
    ...usersList.map((u) => ({
      value: u._id,
      label: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email,
      subLabel: u.role?.replace('_', ' '),
    })),
  ], [usersList]);

  const sourceOptions: SelectOption[] = useMemo(() => [
    { value: '', label: 'All Sources' },
    { value: 'meta_ads', label: 'Meta Ads' },
    { value: 'whatsapp', label: 'WhatsApp' },
    { value: 'website_form', label: 'Website Form' },
    { value: 'google_ads', label: 'Google Ads' },
    { value: 'referral', label: 'Referral' },
  ], []);

  // Update Lead Status Mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ leadId, status }: { leadId: string; status: LeadStatus }) => {
      const res = await api.put(`/leads/${leadId}`, { status });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads-pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['/leads'] });
      toast.success('Lead status updated successfully');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to update lead status');
    },
  });

  // Seed Demo Leads Mutation
  const seedDemoMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/leads/seed-demo', {});
      return res.data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['leads-pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['/leads'] });
      queryClient.invalidateQueries({ queryKey: ['leads-assignment'] });
      toast.success('12 Demo Leads Seeded', data.message || '12 rich demo leads seeded successfully!');
      setIsSeedModalOpen(false);
    },
    onError: (err: any) => {
      toast.error('Seed Failed', err.response?.data?.error || 'Failed to seed demo leads');
    },
  });

  // Save Follow-Up Mutation
  const followUpMutation = useMutation({
    mutationFn: async ({ leadId, followUpData }: { leadId: string; followUpData: any }) => {
      const currentMeta = selectedLead?.metadata || {};
      const updatedMeta = {
        ...currentMeta,
        followUp: followUpData,
      };
      const res = await api.put(`/leads/${leadId}`, { metadata: updatedMeta });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads-pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['/leads'] });
      toast.success('Follow-Up Saved', 'Follow-up schedule updated');
      setIsFollowUpModalOpen(false);
    },
    onError: (err: any) => {
      toast.error('Failed to save follow-up', err.response?.data?.error);
    },
  });

  // Reassign Lead Mutation
  const reassignMutation = useMutation({
    mutationFn: async ({ leadId, assignedTo, branchId }: { leadId: string; assignedTo?: string; branchId?: string }) => {
      const res = await api.put(`/leads/${leadId}`, {
        assignedTo: assignedTo || null,
        branchId: branchId || undefined,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads-pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['/leads'] });
      toast.success('Assignment Updated', 'Lead reassigned successfully');
      setIsReassignModalOpen(false);
    },
    onError: (err: any) => {
      toast.error('Failed to reassign lead', err.response?.data?.error);
    },
  });

  // Create Lead Mutation
  const createLeadMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/leads', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads-pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['/leads'] });
      toast.success('Lead Created', 'Lead created successfully');
      setIsNewLeadModalOpen(false);
      setNewLeadForm({
        name: '',
        email: '',
        phone: '',
        company: '',
        status: 'new',
        priority: 'medium',
        score: 75,
        source: 'meta_ads',
        branchId: '',
        assignedTo: '',
        message: '',
      });
    },
    onError: (err: any) => {
      toast.error('Creation Failed', err.response?.data?.error || 'Failed to create lead');
    },
  });

  // Filter Leads locally by Search term
  const filteredLeads = useMemo(() => {
    if (!searchTerm.trim()) return leads;
    const lower = searchTerm.toLowerCase();
    return leads.filter(
      (l) =>
        l.name?.toLowerCase().includes(lower) ||
        l.company?.toLowerCase().includes(lower) ||
        l.phone?.toLowerCase().includes(lower) ||
        l.email?.toLowerCase().includes(lower)
    );
  }, [leads, searchTerm]);

  // Group leads into pipeline stages
  const columnsData = useMemo(() => {
    const map: Record<LeadStatus, any[]> = {
      new: [],
      contacted: [],
      qualified: [],
      proposal: [],
      converted: [],
      lost: [],
    };

    for (const lead of filteredLeads) {
      let st = (lead.status || 'new').toLowerCase() as LeadStatus;
      if (!map[st]) {
        if (st === 'dead' as any) st = 'lost';
        else st = 'new';
      }
      map[st].push(lead);
    }
    return map;
  }, [filteredLeads]);

  // Handlers for Drag and Drop
  const handleDragStart = (leadId: string) => {
    setDraggedLeadId(leadId);
  };

  const handleDragOver = (e: React.DragEvent, colId: LeadStatus) => {
    e.preventDefault();
    if (activeDropColumn !== colId) {
      setActiveDropColumn(colId);
    }
  };

  const handleDrop = (e: React.DragEvent, targetStatus: LeadStatus) => {
    e.preventDefault();
    setActiveDropColumn(null);
    if (!draggedLeadId) return;

    const lead = leads.find((l) => l._id === draggedLeadId);
    if (lead && lead.status !== targetStatus) {
      updateStatusMutation.mutate({ leadId: draggedLeadId, status: targetStatus });
    }
    setDraggedLeadId(null);
  };

  // Move forward / backward
  const handleShiftStage = (lead: any, direction: 'prev' | 'next') => {
    const order: LeadStatus[] = ['new', 'contacted', 'qualified', 'proposal', 'converted', 'lost'];
    const currentIdx = order.indexOf(lead.status as LeadStatus);
    if (currentIdx === -1) return;
    const nextIdx = direction === 'next' ? currentIdx + 1 : currentIdx - 1;
    if (nextIdx >= 0 && nextIdx < order.length) {
      updateStatusMutation.mutate({ leadId: lead._id, status: order[nextIdx] });
    }
  };

  // Open Follow-up modal
  const openFollowUpModal = (lead: any) => {
    setSelectedLead(lead);
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

  // Open Reassign Modal
  const openReassignModal = (lead: any) => {
    setSelectedLead(lead);
    setReassignForm({
      assignedTo: lead.assignedTo || '',
      branchId: lead.branchId || '',
    });
    setIsReassignModalOpen(true);
  };

  // Helper for Score Pill
  const renderScorePill = (score?: number) => {
    const val = score ?? 50;
    if (val >= 80) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200" title={`High Intent Lead Score: ${val}/100`}>
          <Flame size={11} className="text-rose-600 fill-rose-500" />
          {val} Hot
        </span>
      );
    }
    if (val >= 60) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200" title={`Moderate Lead Score: ${val}/100`}>
          <Zap size={11} className="text-amber-600 fill-amber-500" />
          {val} Warm
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200" title={`Standard Lead Score: ${val}/100`}>
        <Snowflake size={11} className="text-blue-500" />
        {val} Cold
      </span>
    );
  };

  // Follow-up status check
  const renderFollowUpBadge = (lead: any) => {
    const fu = lead.metadata?.followUp;
    if (!fu) {
      return (
        <button
          onClick={() => openFollowUpModal(lead)}
          className="text-[11px] font-medium text-slate-500 hover:text-indigo-600 flex items-center gap-1 transition-colors"
        >
          <Calendar size={11} /> + Schedule Follow-up
        </button>
      );
    }

    if (fu.completed) {
      return (
        <div
          onClick={() => openFollowUpModal(lead)}
          className="cursor-pointer inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200"
          title={`Completed: ${fu.outcome || 'No outcome logged'}`}
        >
          <CheckCircle size={11} className="text-emerald-600" />
          <span>Done</span>
          {fu.type && FOLLOWUP_TYPE_ICONS[fu.type]}
        </div>
      );
    }

    const isOverdue = fu.scheduledAt && new Date(fu.scheduledAt).getTime() < Date.now();
    const dateStr = fu.scheduledAt ? new Date(fu.scheduledAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';

    return (
      <div
        onClick={() => openFollowUpModal(lead)}
        className={`cursor-pointer inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded border transition-colors ${
          isOverdue
            ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
            : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
        }`}
        title={`Follow-up note: ${fu.note || 'None'}`}
      >
        {isOverdue ? <AlertCircle size={11} className="text-rose-600" /> : <Clock size={11} className="text-indigo-600" />}
        {fu.type && FOLLOWUP_TYPE_ICONS[fu.type]}
        <span>{isOverdue ? `Overdue (${dateStr})` : `Due ${dateStr}`}</span>
      </div>
    );
  };

  return (
    <div className="space-y-4 pb-12">
      {/* Top Header & View Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <h2 className="text-lg font-black text-slate-900 tracking-tight">Leads Pipeline</h2>
            <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              {filteredLeads.length} Total Leads
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
            Interactive Kanban board with drag & drop stages, lead scoring, and instant follow-up tracking.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-semibold">
            <Link
              to="/leads"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-slate-600 hover:text-slate-900 hover:bg-white/60 transition-all"
            >
              <Table size={13} /> Table
            </Link>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white text-indigo-700 shadow-sm font-bold">
              <Kanban size={13} /> Pipeline
            </div>
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
            onClick={() => {
              setNewLeadForm((prev) => ({
                ...prev,
                branchId: activeBranchId || prev.branchId || branchesList[0]?._id || '',
              }));
              setIsNewLeadModalOpen(true);
            }}
            className="flex items-center gap-1.5 font-bold"
          >
            <Plus size={14} />
            Add Lead
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 items-center">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search leads by name, company, phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white transition-all"
          />
        </div>

        <CustomSelect
          placeholder="Filter by Branch"
          options={branchOptions}
          value={branchFilter}
          onChange={setBranchFilter}
          compact
        />

        <CustomSelect
          placeholder="Filter by Agent"
          options={agentOptions}
          value={agentFilter}
          onChange={setAgentFilter}
          compact
        />

        <CustomSelect
          placeholder="Filter by Source"
          options={sourceOptions}
          value={sourceFilter}
          onChange={setSourceFilter}
          compact
        />
      </div>

      {/* Kanban Board Horizontal Scroll Container */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-3.5 min-w-[1300px]">
          {PIPELINE_COLUMNS.map((col, colIdx) => {
            const columnLeads = columnsData[col.id] || [];
            const isDropActive = activeDropColumn === col.id;

            return (
              <div
                key={col.id}
                onDragOver={(e) => handleDragOver(e, col.id)}
                onDrop={(e) => handleDrop(e, col.id)}
                className={`flex-1 min-w-[220px] max-w-[280px] bg-slate-50/70 rounded-xl border flex flex-col transition-all duration-200 ${
                  isDropActive
                    ? `${col.borderColor} ring-2 ring-indigo-400 bg-indigo-50/40`
                    : 'border-slate-200 hover:border-slate-300'
                }`}
                style={{ minHeight: '620px' }}
              >
                {/* Column Header */}
                <div className={`p-3 rounded-t-xl ${col.headerBg} flex items-center justify-between`}>
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-xs text-slate-800 tracking-tight">
                      {col.title}
                    </span>
                    <span
                      className={`text-[11px] font-black px-1.5 py-0.5 rounded-full ${col.badgeColor}`}
                    >
                      {columnLeads.length}
                    </span>
                  </div>
                </div>

                {/* Lead Cards List */}
                <div className="p-2 space-y-2.5 flex-1 overflow-y-auto max-h-[720px]">
                  {columnLeads.length === 0 ? (
                    <div className="h-32 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-lg text-slate-400 text-xs">
                      <span>No leads in stage</span>
                      <span className="text-[10px] text-slate-400">Drag leads here</span>
                    </div>
                  ) : (
                    columnLeads.map((lead) => {
                      const assignedName = lead.assignedTo ? usersMap[lead.assignedTo] : null;

                      return (
                        <div
                          key={lead._id}
                          draggable
                          onDragStart={() => handleDragStart(lead._id)}
                          className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs hover:shadow-md hover:border-slate-300 transition-all cursor-grab active:cursor-grabbing group relative"
                        >
                          {/* Card Top: Lead Name & Score */}
                          <div className="flex items-start justify-between gap-1 mb-1.5">
                            <Link
                              to={`/leads/${lead._id}`}
                              className="font-bold text-[13px] text-slate-900 hover:text-indigo-600 transition-colors line-clamp-1"
                            >
                              {lead.name}
                            </Link>
                            {renderScorePill(lead.score)}
                          </div>

                          {/* Company / Contact Details */}
                          {lead.company && (
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-600 mb-1">
                              <Building size={11} className="text-slate-400 shrink-0" />
                              <span className="truncate">{lead.company}</span>
                            </div>
                          )}

                          {lead.phone && (
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-1">
                              <Phone size={11} className="text-slate-400 shrink-0" />
                              <span className="truncate font-mono">{lead.phone}</span>
                            </div>
                          )}

                          {/* Source & Priority Badges */}
                          <div className="flex items-center gap-1.5 flex-wrap my-2">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                              {SOURCE_LABELS[lead.source] || lead.source || 'Inbound'}
                            </span>
                            {lead.priority && (
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  lead.priority === 'urgent'
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                    : lead.priority === 'high'
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                    : 'bg-slate-50 text-slate-600 border border-slate-200'
                                }`}
                              >
                                {lead.priority.toUpperCase()}
                              </span>
                            )}
                          </div>

                          {/* Follow-up status */}
                          <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between">
                            {renderFollowUpBadge(lead)}
                          </div>

                          {/* Card Footer: Assignee & Stage Shift Buttons */}
                          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between gap-1">
                            {/* Assigned Rep Pill */}
                            <button
                              onClick={() => openReassignModal(lead)}
                              className={`text-[11px] font-semibold flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors ${
                                assignedName
                                  ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-100'
                                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                              }`}
                              title="Click to reassign sales agent"
                            >
                              <User size={10} />
                              <span className="max-w-[85px] truncate">
                                {assignedName || 'Unassigned'}
                              </span>
                            </button>

                            {/* Quick Advance / Move Back Buttons */}
                            <div className="flex items-center gap-0.5 opacity-80 group-hover:opacity-100 transition-opacity">
                              {colIdx > 0 && (
                                <button
                                  onClick={() => handleShiftStage(lead, 'prev')}
                                  title="Move to previous stage"
                                  className="w-5 h-5 rounded flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                                >
                                  <ArrowLeft size={11} />
                                </button>
                              )}
                              {colIdx < PIPELINE_COLUMNS.length - 1 && (
                                <button
                                  onClick={() => handleShiftStage(lead, 'next')}
                                  title="Advance to next stage"
                                  className="w-5 h-5 rounded flex items-center justify-center bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold transition-colors"
                                >
                                  <ArrowRight size={11} />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Follow-Up Action Modal */}
      <Modal
        isOpen={isFollowUpModalOpen}
        onClose={() => setIsFollowUpModalOpen(false)}
        title={`Follow-Up Flow: ${selectedLead?.name || 'Lead'}`}
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
              placeholder="e.g. Discuss multi-branch setup, demonstrate dashboard..."
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
                  placeholder="e.g. Demo successful, requested quotation for 5 branches"
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
                  leadId: selectedLead._id,
                  followUpData: followUpPayload,
                });
              }}
            >
              Save Follow-up
            </Button>
          </div>
        </div>
      </Modal>

      {/* Quick Reassign Modal */}
      <Modal
        isOpen={isReassignModalOpen}
        onClose={() => setIsReassignModalOpen(false)}
        title="Reassign Sales Agent"
        size="sm"
      >
        <div className="space-y-3.5">
          <p className="text-xs text-slate-500">Allocate {selectedLead?.name || 'this lead'} to a sales executive or branch.</p>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Sales Agent
            </label>
            <CustomSelect
              placeholder="Select Sales Agent..."
              options={[
                { value: '', label: 'None (Unassign)' },
                ...usersList.map((u) => ({
                  value: u._id,
                  label: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email,
                  subLabel: u.role?.replace('_', ' '),
                })),
              ]}
              value={reassignForm.assignedTo}
              onChange={(val) => setReassignForm({ ...reassignForm, assignedTo: val })}
              compact
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Branch Assignment
            </label>
            <CustomSelect
              placeholder="Select Branch..."
              options={[
                { value: '', label: 'Keep Current Branch' },
                ...branchesList.map((b) => ({ value: b._id, label: b.name })),
              ]}
              value={reassignForm.branchId}
              onChange={(val) => setReassignForm({ ...reassignForm, branchId: val })}
              compact
            />
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsReassignModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              loading={reassignMutation.isPending}
              onClick={() => {
                reassignMutation.mutate({
                  leadId: selectedLead._id,
                  assignedTo: reassignForm.assignedTo,
                  branchId: reassignForm.branchId,
                });
              }}
            >
              Confirm Assignment
            </Button>
          </div>
        </div>
      </Modal>

      {/* New Lead Modal */}
      <Modal
        isOpen={isNewLeadModalOpen}
        onClose={() => setIsNewLeadModalOpen(false)}
        title="Create Inbound Lead"
        size="md"
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-500">Manually register an inbound prospect into the pipeline.</p>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Contact Name *"
              value={newLeadForm.name}
              onChange={(e) => setNewLeadForm({ ...newLeadForm, name: e.target.value })}
              placeholder="e.g. John Doe"
              required
            />
            <Input
              label="Company Name"
              value={newLeadForm.company}
              onChange={(e) => setNewLeadForm({ ...newLeadForm, company: e.target.value })}
              placeholder="e.g. Acme Corp"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Phone Number"
              value={newLeadForm.phone}
              onChange={(e) => setNewLeadForm({ ...newLeadForm, phone: e.target.value })}
              placeholder="+1 (555) 000-0000"
            />
            <Input
              label="Email Address"
              value={newLeadForm.email}
              onChange={(e) => setNewLeadForm({ ...newLeadForm, email: e.target.value })}
              placeholder="john@example.com"
            />
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Stage</label>
              <CustomSelect
                options={PIPELINE_COLUMNS.map((c) => ({ value: c.id, label: c.title }))}
                value={newLeadForm.status}
                onChange={(val) => setNewLeadForm({ ...newLeadForm, status: val as LeadStatus })}
                compact
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Priority</label>
              <CustomSelect
                options={[
                  { value: 'urgent', label: 'Urgent' },
                  { value: 'high', label: 'High' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'low', label: 'Low' },
                ]}
                value={newLeadForm.priority}
                onChange={(val) => setNewLeadForm({ ...newLeadForm, priority: val })}
                compact
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Source</label>
              <CustomSelect
                options={[
                  { value: 'meta_ads', label: 'Meta Ads' },
                  { value: 'whatsapp', label: 'WhatsApp' },
                  { value: 'website_form', label: 'Website Form' },
                  { value: 'google_ads', label: 'Google Ads' },
                  { value: 'manual', label: 'Manual' },
                ]}
                value={newLeadForm.source}
                onChange={(val) => setNewLeadForm({ ...newLeadForm, source: val })}
                compact
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Assign Agent</label>
              <CustomSelect
                placeholder="Unassigned"
                options={[
                  { value: '', label: 'Unassigned' },
                  ...usersList.map((u) => ({
                    value: u._id,
                    label: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email,
                  })),
                ]}
                value={newLeadForm.assignedTo}
                onChange={(val) => setNewLeadForm({ ...newLeadForm, assignedTo: val })}
                compact
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Assign Branch</label>
              <CustomSelect
                placeholder="Default Branch"
                options={[
                  { value: '', label: 'Default Branch' },
                  ...branchesList.map((b) => ({ value: b._id, label: b.name })),
                ]}
                value={newLeadForm.branchId}
                onChange={(val) => setNewLeadForm({ ...newLeadForm, branchId: val })}
                compact
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Initial Notes</label>
            <textarea
              rows={2}
              value={newLeadForm.message}
              onChange={(e) => setNewLeadForm({ ...newLeadForm, message: e.target.value })}
              placeholder="Requirement details, inquiry message..."
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white resize-none"
            />
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsNewLeadModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              loading={createLeadMutation.isPending}
              onClick={() => {
                if (!newLeadForm.name.trim()) {
                  toast.warning('Lead name is required');
                  return;
                }
                createLeadMutation.mutate(newLeadForm);
              }}
            >
              Create Lead
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirm Seed Demo Leads Modal */}
      <ConfirmModal
        isOpen={isSeedModalOpen}
        onClose={() => setIsSeedModalOpen(false)}
        onConfirm={() => seedDemoMutation.mutate()}
        title="Seed Realistic Demo Leads?"
        message="This will insert 12 rich sample leads with diverse stages (New, Contacted, Qualified, Proposal, Won, Lost), lead scoring factors (38 to 98), follow-up schedules, notes, and sources. All data will be live and synced with the backend."
        confirmText="Seed 12 Demo Leads"
        variant="primary"
        loading={seedDemoMutation.isPending}
      />
    </div>
  );
};

export default LeadPipelinePage;

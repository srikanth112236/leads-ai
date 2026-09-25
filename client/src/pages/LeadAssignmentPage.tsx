import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { useToast } from '../components/common/Toast';
import { useRealtime } from '../hooks/useRealtime';
import CustomSelect, { SelectOption } from '../components/common/CustomSelect';
import ConfirmModal from '../components/common/ConfirmModal';
import Button from '../components/common/Button';
import {
  UserCheck,
  Kanban,
  Table,
  Sparkles,
  Search,
  CheckSquare,
  Square,
  Flame,
  Zap,
  Snowflake,
  RefreshCw,
} from 'lucide-react';

const LeadAssignmentPage: React.FC = () => {
  const toast = useToast();
  const queryClient = useQueryClient();

  // Real-time live synchronization
  const { isConnected } = useRealtime({
    onLeadCreated: (lead) => {
      queryClient.invalidateQueries({ queryKey: ['leads-assignment'] });
      toast.info(`⚡ Live Queue: New lead added (${lead?.name || 'Inbound'})`);
    },
    onLeadUpdated: () => {
      queryClient.invalidateQueries({ queryKey: ['leads-assignment'] });
    },
  });

  // State
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [assignmentMode, setAssignmentMode] = useState<'all' | 'unassigned' | 'assigned'>('all');

  // Batch action selection
  const [targetAgentId, setTargetAgentId] = useState('');
  const [targetBranchId, setTargetBranchId] = useState('');
  const [isConfirmBatchOpen, setIsConfirmBatchOpen] = useState(false);
  const [isConfirmRoundRobinOpen, setIsConfirmRoundRobinOpen] = useState(false);
  const [isSeedModalOpen, setIsSeedModalOpen] = useState(false);

  // Fetch Leads
  const { data: leadsData } = useQuery({
    queryKey: ['leads-assignment', branchFilter, agentFilter, statusFilter],
    queryFn: async () => {
      const params: any = { limit: 300 };
      if (branchFilter) params.branchId = branchFilter;
      if (agentFilter) params.assignedTo = agentFilter;
      if (statusFilter) params.status = statusFilter;
      const res = await api.get('/leads', { params });
      return res.data;
    },
  });
  const leads: any[] = leadsData?.data || [];

  // Fetch Users
  const { data: usersData } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => api.get('/users').then((r) => r.data),
  });
  const usersList: any[] = usersData?.data || [];

  // Sales reps only
  const salesReps = useMemo(() => {
    return usersList.filter(
      (u) =>
        u.role === 'SALES_AGENT' ||
        u.role === 'BRANCH_MANAGER' ||
        u.role === 'COMPANY_MANAGER'
    );
  }, [usersList]);

  // Fetch Branches
  const { data: branchesData } = useQuery({
    queryKey: ['branches-list'],
    queryFn: () => api.get('/branches').then((r) => r.data),
  });
  const branchesList: any[] = branchesData?.data || [];

  // Users and Branches Lookup Maps
  const usersMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of usersList) {
      map[u._id] = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email;
    }
    return map;
  }, [usersList]);

  const branchesMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const b of branchesList) {
      map[b._id] = b.name;
    }
    return map;
  }, [branchesList]);

  // Dropdown Options
  const agentOptions: SelectOption[] = useMemo(() => [
    { value: '', label: 'Select Target Sales Rep...' },
    ...salesReps.map((u) => ({
      value: u._id,
      label: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email,
      subLabel: `${u.role.replace('_', ' ')} ${u.branchId ? `• ${branchesMap[u.branchId] || ''}` : ''}`,
    })),
  ], [salesReps, branchesMap]);

  const branchOptions: SelectOption[] = useMemo(() => [
    { value: '', label: 'All Branches' },
    ...branchesList.map((b) => ({ value: b._id, label: b.name })),
  ], [branchesList]);

  // Filter Leads
  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      // Search
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matches =
          l.name?.toLowerCase().includes(q) ||
          l.company?.toLowerCase().includes(q) ||
          l.phone?.toLowerCase().includes(q) ||
          l.email?.toLowerCase().includes(q);
        if (!matches) return false;
      }

      // Assignment Tab Mode
      if (assignmentMode === 'unassigned' && l.assignedTo) return false;
      if (assignmentMode === 'assigned' && !l.assignedTo) return false;

      return true;
    });
  }, [leads, searchTerm, assignmentMode]);

  // Statistics
  const stats = useMemo(() => {
    const total = leads.length;
    const unassigned = leads.filter((l) => !l.assignedTo).length;
    const assigned = total - unassigned;
    return { total, unassigned, assigned, salesRepsCount: salesReps.length };
  }, [leads, salesReps]);

  // Batch Assign Mutation
  const batchAssignMutation = useMutation({
    mutationFn: async ({ leadIds, assignedTo, branchId }: { leadIds: string[]; assignedTo?: string; branchId?: string }) => {
      const res = await api.post('/leads/batch-assign', {
        leadIds,
        assignedTo,
        branchId: branchId || undefined,
      });
      return res.data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['leads-assignment'] });
      queryClient.invalidateQueries({ queryKey: ['leads-pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['/leads'] });
      toast.success('Assignment Complete', data.message || `Successfully assigned ${selectedLeadIds.length} lead(s)!`);
      setSelectedLeadIds([]);
      setTargetAgentId('');
      setTargetBranchId('');
      setIsConfirmBatchOpen(false);
    },
    onError: (err: any) => {
      toast.error('Assignment Failed', err.response?.data?.error || 'Failed to batch assign leads');
    },
  });

  // Individual Assign Mutation
  const individualAssignMutation = useMutation({
    mutationFn: async ({ leadId, assignedTo }: { leadId: string; assignedTo: string }) => {
      const res = await api.put(`/leads/${leadId}`, { assignedTo: assignedTo || null });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads-assignment'] });
      queryClient.invalidateQueries({ queryKey: ['leads-pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['/leads'] });
      toast.success('Lead Assigned', 'Lead assigned successfully');
    },
    onError: (err: any) => {
      toast.error('Assignment Failed', err.response?.data?.error || 'Failed to update assignment');
    },
  });

  // Seed Demo Leads Mutation
  const seedDemoMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/leads/seed-demo', {});
      return res.data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['leads-assignment'] });
      queryClient.invalidateQueries({ queryKey: ['leads-pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['/leads'] });
      toast.success('12 Demo Leads Seeded', data.message || '12 rich demo leads seeded!');
      setIsSeedModalOpen(false);
    },
    onError: (err: any) => {
      toast.error('Seed Failed', err.response?.data?.error || 'Failed to seed leads');
    },
  });

  // Round-Robin Distribution Handler
  const handleRoundRobinDistribute = async () => {
    if (salesReps.length === 0) {
      toast.error('Error', 'No sales representatives available to distribute leads to');
      return;
    }

    const targetLeads = selectedLeadIds.length > 0
      ? leads.filter((l) => selectedLeadIds.includes(l._id))
      : leads.filter((l) => !l.assignedTo);

    if (targetLeads.length === 0) {
      toast.warning('Warning', 'No unassigned leads found to distribute');
      setIsConfirmRoundRobinOpen(false);
      return;
    }

    // Group leads by target rep index
    const assignmentsByRep: Record<string, string[]> = {};
    for (let i = 0; i < targetLeads.length; i++) {
      const rep = salesReps[i % salesReps.length];
      if (!assignmentsByRep[rep._id]) assignmentsByRep[rep._id] = [];
      assignmentsByRep[rep._id].push(targetLeads[i]._id);
    }

    try {
      for (const [repId, ids] of Object.entries(assignmentsByRep)) {
        await api.post('/leads/batch-assign', {
          leadIds: ids,
          assignedTo: repId,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['leads-assignment'] });
      queryClient.invalidateQueries({ queryKey: ['leads-pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['/leads'] });
      toast.success(
        'Round-Robin Complete',
        `Distributed ${targetLeads.length} leads across ${salesReps.length} sales reps!`
      );
      setSelectedLeadIds([]);
      setIsConfirmRoundRobinOpen(false);
    } catch (err: any) {
      toast.error('Round-robin failed', err.response?.data?.error);
    }
  };

  // Toggle selection
  const handleSelectLead = (id: string) => {
    setSelectedLeadIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAllVisible = () => {
    if (selectedLeadIds.length === filteredLeads.length) {
      setSelectedLeadIds([]);
    } else {
      setSelectedLeadIds(filteredLeads.map((l) => l._id));
    }
  };

  const handleSelectAllUnassigned = () => {
    const unassignedIds = leads.filter((l) => !l.assignedTo).map((l) => l._id);
    setSelectedLeadIds(unassignedIds);
  };

  // Render Score Pill
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

  return (
    <div className="space-y-4 pb-16">
      {/* Header and View Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
            <h2 className="text-lg font-black text-slate-900 tracking-tight">Lead Assignment Hub</h2>
            <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              Multi-Lead Allocation
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
            Assign inbound leads individually or in bulk to sales reps, or distribute leads automatically with Round-Robin.
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
            <Link
              to="/leads/pipeline"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-slate-600 hover:text-slate-900 hover:bg-white/60 transition-all"
            >
              <Kanban size={13} /> Pipeline
            </Link>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white text-indigo-700 shadow-sm font-bold">
              <UserCheck size={13} /> Assignment
            </div>
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
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Inbound Leads</p>
          <p className="text-2xl font-black text-slate-900 mt-1">{stats.total}</p>
        </div>

        <div className="bg-white p-3 rounded-xl border border-amber-200 bg-amber-50/30 shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">Unassigned Queue</p>
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
          </div>
          <p className="text-2xl font-black text-amber-900 mt-1">{stats.unassigned}</p>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Assigned Leads</p>
          <p className="text-2xl font-black text-emerald-600 mt-1">{stats.assigned}</p>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Sales Representatives</p>
          <p className="text-2xl font-black text-indigo-600 mt-1">{stats.salesRepsCount}</p>
        </div>
      </div>

      {/* Quick Selection & Round-Robin Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Sub-Tabs */}
        <div className="flex items-center gap-1.5 self-start md:self-auto">
          <button
            onClick={() => setAssignmentMode('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              assignmentMode === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Leads ({leads.length})
          </button>
          <button
            onClick={() => setAssignmentMode('unassigned')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              assignmentMode === 'unassigned'
                ? 'bg-amber-500 text-white'
                : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
            }`}
          >
            Unassigned Queue ({stats.unassigned})
          </button>
          <button
            onClick={() => setAssignmentMode('assigned')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              assignmentMode === 'assigned'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Assigned Leads ({stats.assigned})
          </button>
        </div>

        {/* Shortcuts & Round-Robin */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <button
            onClick={handleSelectAllUnassigned}
            className="text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1.5 rounded-lg transition-colors"
          >
            Select All Unassigned
          </button>

          <Button
            size="sm"
            variant="secondary"
            onClick={() => setIsConfirmRoundRobinOpen(true)}
            className="flex items-center gap-1.5 border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 font-bold"
          >
            <RefreshCw size={13} className="text-purple-600" />
            Auto Round-Robin Distribute
          </Button>
        </div>
      </div>

      {/* Filter Row */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 items-center">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search leads by name, email, company..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white"
          />
        </div>

        <CustomSelect
          placeholder="Filter by Rep"
          options={[
            { value: '', label: 'All Sales Reps' },
            { value: 'unassigned', label: 'Unassigned Leads' },
            ...salesReps.map((u) => ({
              value: u._id,
              label: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email,
            })),
          ]}
          value={agentFilter}
          onChange={setAgentFilter}
          compact
        />

        <CustomSelect
          placeholder="Filter by Branch"
          options={branchOptions}
          value={branchFilter}
          onChange={setBranchFilter}
          compact
        />

        <CustomSelect
          placeholder="Filter by Stage"
          options={[
            { value: '', label: 'All Stages' },
            { value: 'new', label: 'New' },
            { value: 'contacted', label: 'Contacted' },
            { value: 'qualified', label: 'Qualified' },
            { value: 'proposal', label: 'Proposal' },
            { value: 'converted', label: 'Converted' },
            { value: 'lost', label: 'Lost' },
          ]}
          value={statusFilter}
          onChange={setStatusFilter}
          compact
        />
      </div>

      {/* Floating / Sticky Batch Assignment Action Bar */}
      {selectedLeadIds.length > 0 && (
        <div className="sticky top-16 z-20 bg-slate-900 text-white p-3.5 rounded-xl shadow-xl border border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <span className="w-6 h-6 rounded-full bg-indigo-500 text-white font-extrabold text-xs flex items-center justify-center">
              {selectedLeadIds.length}
            </span>
            <span className="text-xs font-bold text-slate-200">
              Leads selected for batch assignment
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
                placeholder="Select Target Rep..."
                options={agentOptions}
                value={targetAgentId}
                onChange={setTargetAgentId}
                compact
              />
            </div>

            <div className="w-48 text-slate-900">
              <CustomSelect
                placeholder="Branch (optional)..."
                options={branchOptions}
                value={targetBranchId}
                onChange={setTargetBranchId}
                compact
              />
            </div>

            <Button
              size="sm"
              disabled={!targetAgentId && !targetBranchId}
              onClick={() => setIsConfirmBatchOpen(true)}
              className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold shrink-0"
            >
              Assign Selected
            </Button>
          </div>
        </div>
      )}

      {/* Leads Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                <th className="py-2.5 px-3 w-10 text-center">
                  <button
                    onClick={handleSelectAllVisible}
                    className="text-slate-500 hover:text-indigo-600 flex items-center justify-center mx-auto"
                  >
                    {selectedLeadIds.length > 0 && selectedLeadIds.length === filteredLeads.length ? (
                      <CheckSquare size={16} className="text-indigo-600" />
                    ) : (
                      <Square size={16} />
                    )}
                  </button>
                </th>
                <th className="py-2.5 px-3 font-extrabold text-slate-800">Lead Contact</th>
                <th className="py-2.5 px-3 font-extrabold text-slate-800">Score</th>
                <th className="py-2.5 px-3 font-extrabold text-slate-800">Stage</th>
                <th className="py-2.5 px-3 font-extrabold text-slate-800">Branch</th>
                <th className="py-2.5 px-3 font-extrabold text-slate-800 min-w-[200px]">
                  Assigned Sales Representative
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
                    <p className="text-sm font-semibold">No leads match the selected criteria</p>
                    <p className="text-xs text-slate-400 mt-1">Try resetting filters or click "Seed Demo Leads"</p>
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead) => {
                  const isSelected = selectedLeadIds.includes(lead._id);

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
                            <CheckSquare size={16} className="text-indigo-600" />
                          ) : (
                            <Square size={16} />
                          )}
                        </button>
                      </td>

                      {/* Contact Info */}
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900 hover:text-indigo-600 cursor-pointer">
                          <Link to={`/leads/${lead._id}`}>{lead.name}</Link>
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                          {lead.company && <span className="font-medium text-slate-700">{lead.company} •</span>}
                          <span>{lead.phone || lead.email}</span>
                        </div>
                      </td>

                      {/* Lead Score */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {renderScorePill(lead.score)}
                      </td>

                      {/* Stage Badge */}
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

                      {/* Branch */}
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-600">
                        {lead.branchId ? (
                          <span className="font-medium text-slate-700">
                            {branchesMap[lead.branchId] || 'Branch'}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Default</span>
                        )}
                      </td>

                      {/* Individual Reassign Dropdown */}
                      <td className="py-2.5 px-3">
                        <div className="w-56">
                          <CustomSelect
                            placeholder="Unassigned"
                            options={[
                              { value: '', label: 'Unassigned' },
                              ...salesReps.map((u) => ({
                                value: u._id,
                                label: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email,
                              })),
                            ]}
                            value={lead.assignedTo || ''}
                            onChange={(newAgentId) => {
                              individualAssignMutation.mutate({
                                leadId: lead._id,
                                assignedTo: newAgentId,
                              });
                            }}
                            compact
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirm Batch Assignment Modal */}
      <ConfirmModal
        isOpen={isConfirmBatchOpen}
        onClose={() => setIsConfirmBatchOpen(false)}
        onConfirm={() => {
          batchAssignMutation.mutate({
            leadIds: selectedLeadIds,
            assignedTo: targetAgentId || undefined,
            branchId: targetBranchId || undefined,
          });
        }}
        title={`Assign ${selectedLeadIds.length} Leads?`}
        message={`Are you sure you want to assign ${selectedLeadIds.length} selected lead(s) to ${
          targetAgentId ? usersMap[targetAgentId] || 'selected sales rep' : 'selected branch'
        }?`}
        confirmText="Confirm Batch Assignment"
        variant="primary"
        loading={batchAssignMutation.isPending}
      />

      {/* Confirm Round-Robin Modal */}
      <ConfirmModal
        isOpen={isConfirmRoundRobinOpen}
        onClose={() => setIsConfirmRoundRobinOpen(false)}
        onConfirm={handleRoundRobinDistribute}
        title="Distribute Leads via Round-Robin?"
        message={`This will evenly divide ${
          selectedLeadIds.length > 0 ? selectedLeadIds.length : stats.unassigned
        } lead(s) cyclically across all ${salesReps.length} active sales representatives in your company.`}
        confirmText="Execute Round-Robin"
        variant="primary"
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

export default LeadAssignmentPage;

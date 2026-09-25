import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import { useToast } from '../components/common/Toast';
import { useAuth } from '../context/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import {
  Phone,
  Mail,
  MessageSquare,
  Globe,
  Tag,
  ExternalLink,
  Building2,
  Clock,
  Send,
} from 'lucide-react';

const LeadDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  const toast = useToast();
  const canUpdate = hasPermission('leads:update');
  const NO_UPDATE_PERMISSION = 'You do not have permission to add notes or update lead details. Please contact your company administrator to request access.';

  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const q = (key: string, url: string) =>
    useQuery({ queryKey: [key, id], queryFn: () => api.get(url).then((r) => r.data), retry: false });

  const { data: leadData, isLoading: isLeadLoading } = q('lead', `/leads/${id}`);
  const { data: sourcesData } = q('sources', `/leads/${id}/sources`);
  const { data: trackerData } = q('tracker', `/leads/${id}/tracker`);
  const { data: notesData } = q('notes', `/leads/${id}/notes`);
  const { data: convData } = q('conversations', `/leads/${id}/conversations`);

  const lead = (leadData as any)?.data;
  const sources = (sourcesData as any)?.data || [];
  const timeline = (trackerData as any)?.data || [];
  const notes = (notesData as any)?.data || [];
  const conversations = (convData as any)?.data || [];
  const adSource = sources.find((s: any) => s?.metadata?.adPreview);

  const refreshNotes = () => queryClient.invalidateQueries({ queryKey: ['notes', id] });

  const addNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canUpdate) {
      toast.warning('Access Restricted', NO_UPDATE_PERMISSION);
      return;
    }
    if (!note.trim()) return;
    setError(null);
    try {
      await api.post(`/leads/${id}/notes`, { body: note });
      setNote('');
      refreshNotes();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not add note');
    }
  };

  if (isLeadLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] gap-2 text-slate-500 text-xs">
        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        Loading lead dossier…
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="p-8 text-center bg-white rounded-xl border border-slate-200">
        <p className="text-sm font-bold text-slate-800">Lead not found</p>
        <Link to="/leads" className="text-xs text-indigo-600 hover:underline mt-2 inline-block">
          ← Return to Leads list
        </Link>
      </div>
    );
  }

  const isMeta =
    lead.source === 'meta_ads' ||
    lead.source === 'META_LEAD_ADS' ||
    lead.source === 'meta' ||
    (Array.isArray(lead.tags) && lead.tags.some((t: string) => t.toLowerCase().includes('meta')));

  const rawPhone = lead.phone ? String(lead.phone).replace(/[^0-9]/g, '') : '';

  // Extract custom form responses from metadata
  const metaObj = (lead.metadata as Record<string, any>) || {};
  const standardFields = new Set([
    'name',
    'full_name',
    'email',
    'phone',
    'company',
    'message',
    'leadgenId',
    'adId',
    'adName',
    'campaignId',
    'campaignName',
    'formId',
    'tags',
    'followUp',
    'pageUrl',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'lastInboundForm',
    'lastInboundAt',
  ]);

  const customFormQuestions = Object.entries(metaObj).filter(
    ([k, v]) => !standardFields.has(k) && typeof v !== 'object' && v != null,
  );

  return (
    <div className="space-y-5 pb-16">
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
              <Link to="/leads" className="hover:text-indigo-600 transition-colors">
                Leads
              </Link>
              <span>/</span>
              <span className="text-slate-700 font-bold">{lead.name}</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">{lead.name}</h1>
              <span
                className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase ${
                  lead.status === 'new'
                    ? 'bg-blue-100 text-blue-700'
                    : lead.status === 'qualified'
                    ? 'bg-amber-100 text-amber-700'
                    : lead.status === 'converted'
                    ? 'bg-emerald-100 text-emerald-700'
                    : lead.status === 'lost'
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-indigo-100 text-indigo-700'
                }`}
              >
                {lead.status}
              </span>
              <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                Score: {lead.score ?? 50}
              </span>
            </div>
            {lead.company && (
              <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5 mt-0.5">
                <Building2 size={13} className="text-slate-400" />
                {lead.company}
              </p>
            )}
          </div>

          {/* Quick Communication Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {lead.phone && (
              <>
                <a
                  href={`https://wa.me/${rawPhone}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-colors"
                >
                  <MessageSquare size={13} />
                  WhatsApp
                </a>
                <a
                  href={`tel:${lead.phone}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 transition-colors"
                >
                  <Phone size={13} />
                  Call
                </a>
              </>
            )}
            {lead.email && (
              <a
                href={`mailto:${lead.email}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors"
              >
                <Mail size={13} />
                Email
              </a>
            )}
          </div>
        </div>

        {/* Lead Tags Strip */}
        <div className="flex flex-wrap items-center gap-1.5 pt-4 mt-4 border-t border-slate-100">
          <span className="text-xs font-bold text-slate-400 flex items-center gap-1 mr-1">
            <Tag size={12} /> Tags:
          </span>
          {isMeta && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
              <Globe size={11} /> Meta Ads
            </span>
          )}
          {metaObj.campaignName && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
              Campaign: {metaObj.campaignName}
            </span>
          )}
          {metaObj.adName && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
              Ad: {metaObj.adName}
            </span>
          )}
          {Array.isArray(lead.tags) &&
            lead.tags
              .filter((t: string) => !t.toLowerCase().includes('meta ads'))
              .map((t: string, idx: number) => (
                <span
                  key={idx}
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200"
                >
                  {t}
                </span>
              ))}
        </div>
      </div>

      {/* Grid: Overview & Contact Info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="Contact & Lead Information">
          <div className="text-xs space-y-2.5 text-slate-700">
            <div className="flex items-center justify-between py-1 border-b border-slate-100">
              <span className="text-slate-400 font-medium">Full Name</span>
              <span className="font-bold text-slate-900">{lead.name}</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-100">
              <span className="text-slate-400 font-medium">Phone</span>
              <span className="font-mono font-bold text-slate-900">{lead.phone || '—'}</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-100">
              <span className="text-slate-400 font-medium">Email Address</span>
              <span className="font-mono font-medium text-slate-900">{lead.email || '—'}</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-100">
              <span className="text-slate-400 font-medium">Primary Source</span>
              <span className="font-bold text-slate-900 capitalize">{lead.source || 'Direct'}</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-100">
              <span className="text-slate-400 font-medium">Created Timestamp</span>
              <span className="font-mono text-slate-600">{new Date(lead.createdAt).toLocaleString()}</span>
            </div>
            {lead.message && (
              <div className="pt-2">
                <p className="text-[11px] font-bold text-slate-400 uppercase">Message / Inbound Note</p>
                <p className="p-2.5 mt-1 rounded-lg bg-slate-50 border border-slate-100 text-slate-800 leading-relaxed">
                  “{lead.message}”
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* Form Submission Answers */}
        <Card
          title={
            lead.source === 'WEBSITE_FORM'
              ? (metaObj.formName ? `${metaObj.formName} — Submission Details` : 'Website Form Submission Details')
              : 'Form Submission Details'
          }
        >
          {customFormQuestions.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              No custom form field responses recorded for this submission.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {customFormQuestions.map(([key, value]) => {
                const strVal = String(value);
                const isUrl = strVal.startsWith('http://') || strVal.startsWith('https://');
                const isInbox = key.toLowerCase().includes('inbox') || isUrl;
                return (
                  <div key={key} className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                    <p className="text-[10px] text-slate-400 font-bold uppercase truncate">
                      {key.replace(/_/g, ' ')}
                    </p>
                    {isInbox && isUrl ? (
                      <a
                        href={strVal}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-bold text-blue-600 hover:text-blue-800 hover:underline mt-1 text-xs"
                      >
                        Open Meta Inbox Chat <ExternalLink size={12} />
                      </a>
                    ) : (
                      <p className="font-bold text-slate-900 mt-0.5 capitalize">
                        {strVal.replace(/_/g, ' ')}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {adSource && (
        <Card title={`Ad that generated this lead (${adSource.metadata.adCreativeId || 'creative'})`}>
          <iframe
            title="Ad preview"
            sandbox=""
            srcDoc={adSource.metadata.adPreview}
            className="w-full max-w-xl h-96 border border-slate-200 rounded-lg bg-white"
          />
        </Card>
      )}

      {/* Grid: Timeline & Internal Team Notes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title={`Activity Timeline (${timeline.length})`}>
          {timeline.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">No lifecycle events recorded yet.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1 text-xs">
              {timeline.map((t: any, i: number) => (
                <div key={i} className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-50 border border-slate-100">
                  <Clock size={13} className="text-slate-400 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-800">
                      {t.action || t.eventType}
                      <span className="font-normal text-slate-400 ml-1">({t.kind || t.source})</span>
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono">
                      {new Date(t.at || t.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title={`Internal Team Notes (${notes.length})`}>
          {error && <p className="text-rose-600 text-xs mb-2 font-medium">{error}</p>}
          <form onSubmit={addNote} className="flex gap-2 mb-3">
            <div className="flex-1">
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Log a call, objection, or follow-up note…"
              />
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={!canUpdate}
              title={!canUpdate ? NO_UPDATE_PERMISSION : 'Add note to lead history'}
              className={`font-bold shrink-0 ${!canUpdate ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <Send size={13} />
              Add
            </Button>
          </form>
          {notes.length === 0 ? (
            <p className="text-xs text-slate-400 py-3 text-center">No notes added yet.</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1 text-xs">
              {notes.map((n: any) => (
                <div key={n._id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                  <p className="text-slate-800 whitespace-pre-wrap">{n.body}</p>
                  <p className="text-[10px] text-slate-400 font-mono mt-1">
                    {new Date(n.createdAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {conversations.length > 0 && (
        <Card title="Conversations">
          {conversations.map((c: any) => (
            <div key={c._id} className="mb-4 last:mb-0">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                {c.channel} · {c.status}
              </p>
              <div className="space-y-1.5 mt-2">
                {(c.messages || []).map((m: any) => (
                  <div key={m._id} className={m.direction === 'outbound' ? 'text-right' : 'text-left'}>
                    <span
                      className={`inline-block px-3 py-1.5 rounded-xl text-xs ${
                        m.direction === 'outbound'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      {m.content}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
};

export default LeadDetailPage;

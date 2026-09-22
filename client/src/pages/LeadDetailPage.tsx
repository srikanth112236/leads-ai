import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';

const LeadDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const q = (key: string, url: string) =>
    useQuery({ queryKey: [key, id], queryFn: () => api.get(url).then((r) => r.data), retry: false });
  const { data: leadData } = q('lead', `/leads/${id}`);
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
    setError(null);
    try {
      await api.post(`/leads/${id}/notes`, { body: note });
      setNote('');
      refreshNotes();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not add note');
    }
  };

  if (!lead) return <p>Loading lead…</p>;

  return (
    <div>
      <Link to="/leads" className="text-sm text-blue-600 hover:underline">← Back to Leads</Link>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-3">
        <Card title="Overview">
          <div className="text-sm space-y-1.5">
            <p><strong>{lead.name}</strong> <span className="text-slate-500">· {lead.status} · score {lead.score ?? 0}</span></p>
            <p>Email: {lead.email || '—'}</p>
            <p>Phone: {lead.phone || '—'}</p>
            <p>Company: {lead.company || '—'}</p>
            <p>Source: {lead.source || '—'}</p>
            <p>Created: {new Date(lead.createdAt).toLocaleString()}</p>
            {lead.message && <p className="pt-1">“{lead.message}”</p>}
          </div>
        </Card>
        <Card title="Sources">
          {sources.length === 0 ? <p className="text-sm text-slate-500">No sources</p> : (
            <ul className="text-sm space-y-1">
              {sources.map((s: any) => (
                <li key={s._id}>{s.sourceType} <span className="text-slate-400 font-mono text-xs">{s.externalId}</span></li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {adSource && (
        <Card title={`Ad that generated this lead (${adSource.metadata.adCreativeId || 'creative'})`} className="mt-4">
          <iframe
            title="Ad preview"
            sandbox=""
            srcDoc={adSource.metadata.adPreview}
            className="w-full max-w-xl h-96 border border-slate-200 rounded-lg bg-white"
          />
        </Card>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <Card title="Timeline">
          {timeline.length === 0 ? <p className="text-sm text-slate-500">No events</p> : (
            <ul className="text-sm space-y-1.5">
              {timeline.map((t: any, i: number) => (
                <li key={i}><span className="text-slate-400">{new Date(t.at || t.createdAt).toLocaleString()}</span> — {t.action || t.eventType} <span className="text-slate-400">({t.kind || t.source})</span></li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Notes">
          {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
          <form onSubmit={addNote} className="flex gap-2 mb-3">
            <div className="flex-1"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" /></div>
            <div className="mb-3"><Button type="submit">Add</Button></div>
          </form>
          {notes.length === 0 ? <p className="text-sm text-slate-500">No notes yet</p> : (
            <ul className="text-sm space-y-2">
              {notes.map((n: any) => (
                <li key={n._id} className="border-b border-slate-100 pb-2">{n.body}<br /><span className="text-xs text-slate-400">{new Date(n.createdAt).toLocaleString()}</span></li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {conversations.length > 0 && (
        <Card title="Conversations" className="mt-4">
          {conversations.map((c: any) => (
            <div key={c._id} className="mb-3">
              <p className="text-xs font-bold text-slate-500 uppercase">{c.channel} · {c.status}</p>
              <ul className="text-sm space-y-1 mt-1">
                {(c.messages || []).map((m: any) => (
                  <li key={m._id} className={m.direction === 'outbound' ? 'text-right' : ''}>
                    <span className={`inline-block px-2.5 py-1.5 rounded-lg ${m.direction === 'outbound' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>{m.content}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
};

export default LeadDetailPage;

import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
const LeadDetailPage = () => {
    const { id } = useParams();
    const queryClient = useQueryClient();
    const [note, setNote] = useState('');
    const [error, setError] = useState(null);
    const q = (key, url) => useQuery({ queryKey: [key, id], queryFn: () => api.get(url).then((r) => r.data), retry: false });
    const { data: leadData } = q('lead', `/leads/${id}`);
    const { data: sourcesData } = q('sources', `/leads/${id}/sources`);
    const { data: trackerData } = q('tracker', `/leads/${id}/tracker`);
    const { data: notesData } = q('notes', `/leads/${id}/notes`);
    const { data: convData } = q('conversations', `/leads/${id}/conversations`);
    const lead = leadData?.data;
    const sources = sourcesData?.data || [];
    const timeline = trackerData?.data || [];
    const notes = notesData?.data || [];
    const conversations = convData?.data || [];
    const adSource = sources.find((s) => s?.metadata?.adPreview);
    const refreshNotes = () => queryClient.invalidateQueries({ queryKey: ['notes', id] });
    const addNote = async (e) => {
        e.preventDefault();
        setError(null);
        try {
            await api.post(`/leads/${id}/notes`, { body: note });
            setNote('');
            refreshNotes();
        }
        catch (err) {
            setError(err?.response?.data?.error || 'Could not add note');
        }
    };
    if (!lead)
        return _jsx("p", { children: "Loading lead\u2026" });
    return (_jsxs("div", { children: [_jsx(Link, { to: "/leads", className: "text-sm text-blue-600 hover:underline", children: "\u2190 Back to Leads" }), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-4 mt-3", children: [_jsx(Card, { title: "Overview", children: _jsxs("div", { className: "text-sm space-y-1.5", children: [_jsxs("p", { children: [_jsx("strong", { children: lead.name }), " ", _jsxs("span", { className: "text-slate-500", children: ["\u00B7 ", lead.status, " \u00B7 score ", lead.score ?? 0] })] }), _jsxs("p", { children: ["Email: ", lead.email || '—'] }), _jsxs("p", { children: ["Phone: ", lead.phone || '—'] }), _jsxs("p", { children: ["Company: ", lead.company || '—'] }), _jsxs("p", { children: ["Source: ", lead.source || '—'] }), _jsxs("p", { children: ["Created: ", new Date(lead.createdAt).toLocaleString()] }), lead.message && _jsxs("p", { className: "pt-1", children: ["\u201C", lead.message, "\u201D"] })] }) }), _jsx(Card, { title: "Sources", children: sources.length === 0 ? _jsx("p", { className: "text-sm text-slate-500", children: "No sources" }) : (_jsx("ul", { className: "text-sm space-y-1", children: sources.map((s) => (_jsxs("li", { children: [s.sourceType, " ", _jsx("span", { className: "text-slate-400 font-mono text-xs", children: s.externalId })] }, s._id))) })) })] }), adSource && (_jsx(Card, { title: `Ad that generated this lead (${adSource.metadata.adCreativeId || 'creative'})`, className: "mt-4", children: _jsx("iframe", { title: "Ad preview", sandbox: "", srcDoc: adSource.metadata.adPreview, className: "w-full max-w-xl h-96 border border-slate-200 rounded-lg bg-white" }) })), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4", children: [_jsx(Card, { title: "Timeline", children: timeline.length === 0 ? _jsx("p", { className: "text-sm text-slate-500", children: "No events" }) : (_jsx("ul", { className: "text-sm space-y-1.5", children: timeline.map((t, i) => (_jsxs("li", { children: [_jsx("span", { className: "text-slate-400", children: new Date(t.at || t.createdAt).toLocaleString() }), " \u2014 ", t.action || t.eventType, " ", _jsxs("span", { className: "text-slate-400", children: ["(", t.kind || t.source, ")"] })] }, i))) })) }), _jsxs(Card, { title: "Notes", children: [error && _jsx("p", { className: "text-red-500 text-sm mb-2", children: error }), _jsxs("form", { onSubmit: addNote, className: "flex gap-2 mb-3", children: [_jsx("div", { className: "flex-1", children: _jsx(Input, { value: note, onChange: (e) => setNote(e.target.value), placeholder: "Add a note\u2026" }) }), _jsx("div", { className: "mb-3", children: _jsx(Button, { type: "submit", children: "Add" }) })] }), notes.length === 0 ? _jsx("p", { className: "text-sm text-slate-500", children: "No notes yet" }) : (_jsx("ul", { className: "text-sm space-y-2", children: notes.map((n) => (_jsxs("li", { className: "border-b border-slate-100 pb-2", children: [n.body, _jsx("br", {}), _jsx("span", { className: "text-xs text-slate-400", children: new Date(n.createdAt).toLocaleString() })] }, n._id))) }))] })] }), conversations.length > 0 && (_jsx(Card, { title: "Conversations", className: "mt-4", children: conversations.map((c) => (_jsxs("div", { className: "mb-3", children: [_jsxs("p", { className: "text-xs font-bold text-slate-500 uppercase", children: [c.channel, " \u00B7 ", c.status] }), _jsx("ul", { className: "text-sm space-y-1 mt-1", children: (c.messages || []).map((m) => (_jsx("li", { className: m.direction === 'outbound' ? 'text-right' : '', children: _jsx("span", { className: `inline-block px-2.5 py-1.5 rounded-lg ${m.direction === 'outbound' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`, children: m.content }) }, m._id))) })] }, c._id))) }))] }));
};
export default LeadDetailPage;
//# sourceMappingURL=LeadDetailPage.js.map
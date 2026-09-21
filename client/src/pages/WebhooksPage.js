import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import { useGet } from '../hooks/useApi';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
const WebhooksPage = () => {
    const [provider, setProvider] = useState('');
    const [status, setStatus] = useState('');
    const [traceKey, setTraceKey] = useState(null);
    const query = `/webhooks?${new URLSearchParams({ ...(provider ? { provider } : {}), ...(status ? { status } : {}) })}`;
    const { data, isLoading, refetch } = useGet(query);
    const events = data?.data || [];
    const { data: traceData, isFetching: traceLoading } = useQuery({
        queryKey: ['trace', traceKey?.provider, traceKey?.externalEventId],
        queryFn: () => api
            .get(`/webhooks/trace?provider=${traceKey.provider}&externalEventId=${traceKey.externalEventId}`)
            .then((r) => r.data),
        enabled: !!traceKey,
        retry: false,
    });
    const trace = traceData?.data;
    return (_jsxs("div", { children: [_jsx(Card, { className: "mb-4", children: _jsxs("div", { className: "flex gap-3 items-end", children: [_jsxs("label", { className: "text-sm", children: ["Provider", _jsxs("select", { value: provider, onChange: (e) => setProvider(e.target.value), className: "ml-2 px-2 py-1 border rounded", children: [_jsx("option", { value: "", children: "All" }), _jsx("option", { value: "meta", children: "Meta" }), _jsx("option", { value: "whatsapp", children: "WhatsApp" }), _jsx("option", { value: "website", children: "Website" })] })] }), _jsxs("label", { className: "text-sm", children: ["Status", _jsxs("select", { value: status, onChange: (e) => setStatus(e.target.value), className: "ml-2 px-2 py-1 border rounded", children: [_jsx("option", { value: "", children: "All" }), _jsx("option", { value: "pending", children: "Pending" }), _jsx("option", { value: "processing", children: "Processing" }), _jsx("option", { value: "processed", children: "Processed" }), _jsx("option", { value: "failed", children: "Failed" })] })] }), _jsx(Button, { variant: "secondary", onClick: () => refetch(), children: "Refresh" })] }) }), _jsx(Card, { children: isLoading ? (_jsx("p", { children: "Loading..." })) : events.length === 0 ? (_jsx("p", { children: "No webhook events" })) : (_jsxs("table", { className: "w-full", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b", children: [_jsx("th", { className: "text-left py-2", children: "Provider" }), _jsx("th", { className: "text-left py-2", children: "Event" }), _jsx("th", { className: "text-left py-2", children: "Status" }), _jsx("th", { className: "text-left py-2", children: "Attempts" }), _jsx("th", { className: "text-left py-2", children: "Error" }), _jsx("th", { className: "text-left py-2", children: "Received" }), _jsx("th", { className: "text-left py-2", children: "Trace" })] }) }), _jsx("tbody", { children: events.map((e) => (_jsxs("tr", { className: "border-b", children: [_jsx("td", { className: "py-2", children: e.provider }), _jsx("td", { className: "py-2 font-mono text-xs", children: e.externalEventId }), _jsx("td", { className: "py-2", children: e.status }), _jsxs("td", { className: "py-2", children: [e.attempts, "/", e.maxAttempts] }), _jsx("td", { className: "py-2 text-red-600 text-xs", children: e.error || '—' }), _jsx("td", { className: "py-2", children: new Date(e.receivedAt).toLocaleString() }), _jsx("td", { className: "py-2", children: _jsx(Button, { variant: "secondary", onClick: () => setTraceKey({ provider: e.provider, externalEventId: e.externalEventId }), children: "Trace" }) })] }, e._id))) })] })) }), traceKey && (_jsx(Card, { title: "Event Trace", className: "mt-4", children: traceLoading ? (_jsx("p", { children: "Loading trace..." })) : trace ? (_jsxs("div", { className: "space-y-2 text-sm", children: [_jsxs("p", { children: [_jsx("strong", { children: "Status:" }), " ", trace.event.status, " (attempts ", trace.event.attempts, ")"] }), _jsxs("p", { children: [_jsx("strong", { children: "Lead:" }), " ", trace.lead ? `${trace.lead.name} (${trace.lead._id})` : '—'] }), _jsxs("p", { children: [_jsx("strong", { children: "Sources:" }), " ", trace.sources?.map((s) => s.sourceType).join(', ') || '—'] }), _jsxs("p", { children: [_jsx("strong", { children: "Tracker:" }), " ", trace.trackerEvents?.map((t) => t.eventType).join(', ') || '—'] }), _jsxs("p", { children: [_jsx("strong", { children: "Duplicate:" }), " ", trace.duplicate ? 'Yes' : 'No'] })] })) : (_jsx("p", { children: "Trace not available" })) }))] }));
};
export default WebhooksPage;
//# sourceMappingURL=WebhooksPage.js.map
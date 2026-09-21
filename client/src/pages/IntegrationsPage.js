import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import { useGet, usePost, usePut } from '../hooks/useApi';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
const IntegrationsPage = () => {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const isSuper = user?.role === 'SUPER_ADMIN';
    const url = isSuper ? '/admin/integrations' : `/companies/${user?.companyId}/integrations`;
    const { data, isLoading } = useGet(url);
    const payload = data?.data || {};
    const { data: branchesData } = useQuery({
        queryKey: ['branches-list'],
        queryFn: () => api.get('/branches').then((r) => r.data),
        retry: false,
    });
    const branches = branchesData?.data || [];
    const [error, setError] = useState(null);
    const [assigning, setAssigning] = useState({});
    const refresh = () => {
        queryClient.invalidateQueries({ queryKey: [url] });
        queryClient.invalidateQueries({ queryKey: ['branches-list'] });
    };
    const [connecting, setConnecting] = useState(false);
    const disconnect = usePost('/meta/disconnect');
    const startConnect = async () => {
        setError(null);
        setConnecting(true);
        try {
            const res = await api.get('/meta/oauth/start');
            const dialogUrl = res?.data?.data?.dialogUrl;
            if (dialogUrl)
                window.location.href = dialogUrl;
            else
                setError('No dialog URL returned');
        }
        catch (err) {
            setError(err?.response?.data?.error || 'Connect failed');
        }
        finally {
            setConnecting(false);
        }
    };
    const doDisconnect = () => {
        if (!window.confirm('Disconnect Meta? Lead flow will stop.'))
            return;
        disconnect.mutate(undefined, {
            onSuccess: refresh,
            onError: (err) => setError(err?.response?.data?.error || 'Disconnect failed'),
        });
    };
    const meta = payload.meta || [];
    const metaPages = payload.metaPages || [];
    const connected = meta.some((m) => m.status === 'active');
    const unassigned = metaPages.filter((p) => !p.branchId);
    const sections = [
        { title: 'WhatsApp', rows: payload.whatsapp || [] },
        { title: 'Website Forms', rows: payload.websiteForms || [] },
    ];
    return (_jsxs("div", { children: [error && _jsx("p", { className: "text-red-500 text-sm mb-3", children: error }), !isSuper && (_jsx(Card, { title: "Meta Lead Ads", className: "mb-4", children: !connected ? (_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("p", { className: "text-sm text-slate-500", children: "Connect your company's Facebook Pages to receive Lead Ads." }), _jsx(Button, { onClick: startConnect, loading: connecting, children: "Connect Meta" })] })) : (_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("p", { className: "text-sm text-green-700 font-semibold", children: ["Connected", metaPages.length > 0 ? ` — ${metaPages.length} page(s)` : ''] }), _jsx(Button, { variant: "danger", onClick: doDisconnect, loading: disconnect.isPending, children: "Disconnect" })] })) })), !isSuper && unassigned.length > 0 && (_jsx(Card, { title: "Pages waiting for branch assignment", className: "mb-4", children: unassigned.map((p) => (_jsx(PageAssignRow, { page: p, branches: branches, branchId: assigning[p._id] || '', onSelect: (v) => setAssigning({ ...assigning, [p._id]: v }), onDone: refresh, onError: setError }, p._id))) })), isLoading ? (_jsx("p", { children: "Loading..." })) : (sections.map((section) => (_jsx(Card, { title: section.title, className: "mb-4", children: section.rows.length === 0 ? (_jsx("p", { className: "text-gray-500", children: "None configured" })) : (_jsxs("table", { className: "w-full", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b", children: [_jsx("th", { className: "text-left py-2", children: "ID" }), _jsx("th", { className: "text-left py-2", children: "Status" }), _jsx("th", { className: "text-left py-2", children: "Company" }), _jsx("th", { className: "text-left py-2", children: "Branch" })] }) }), _jsx("tbody", { children: section.rows.map((row) => (_jsxs("tr", { className: "border-b", children: [_jsx("td", { className: "py-2 font-mono text-xs", children: row._id }), _jsx("td", { className: "py-2", children: row.status }), _jsx("td", { className: "py-2 font-mono text-xs", children: row.companyId }), _jsx("td", { className: "py-2 font-mono text-xs", children: row.branchId || '—' })] }, row._id))) })] })) }, section.title))))] }));
};
const PageAssignRow = ({ page, branches, branchId, onSelect, onDone, onError }) => {
    const assign = usePut(`/meta/pages/${page._id}/assign`);
    return (_jsxs("div", { className: "flex items-center gap-3 py-2 border-b last:border-0", children: [_jsx("span", { className: "text-sm font-semibold flex-1", children: page.name || page.metaPageId }), _jsxs("select", { value: branchId, onChange: (e) => onSelect(e.target.value), className: "px-2 py-1.5 border rounded-lg text-sm", children: [_jsx("option", { value: "", children: "Select branch\u2026" }), branches.map((b) => _jsx("option", { value: b._id, children: b.name }, b._id))] }), _jsx(Button, { variant: "secondary", loading: assign.isPending, onClick: () => {
                    if (!branchId)
                        return;
                    assign.mutate({ branchId }, { onSuccess: onDone, onError: (err) => onError(err?.response?.data?.error || 'Assign failed') });
                }, children: "Assign" })] }));
};
export default IntegrationsPage;
//# sourceMappingURL=IntegrationsPage.js.map
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import { useGet, usePost } from '../hooks/useApi';
import { useQueryClient } from '@tanstack/react-query';
const STATUS_LABELS = {
    1: 'Active',
    2: 'Disabled',
    3: 'Unsettled — payment failed',
    7: 'Pending risk review',
    8: 'Pending settlement',
    9: 'In grace period',
    100: 'Pending closure',
    101: 'Closed',
};
function statusLabel(code) {
    if (code === undefined || code === null)
        return '—';
    return STATUS_LABELS[code] || `Code ${code}`;
}
const AdAccountsPage = () => {
    const queryClient = useQueryClient();
    const { data, isLoading } = useGet('/meta/adaccounts');
    const accounts = data?.data || [];
    const [error, setError] = useState(null);
    const sync = usePost('/meta/adaccounts/sync');
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['/meta/adaccounts'] });
    const runSync = () => {
        setError(null);
        sync.mutate(undefined, {
            onSuccess: refresh,
            onError: (err) => setError(err?.response?.data?.error || 'Sync failed'),
        });
    };
    return (_jsxs("div", { children: [_jsxs("div", { className: "flex justify-between items-center mb-4", children: [_jsx("div", {}), _jsx(Button, { onClick: runSync, loading: sync.isPending, children: "Sync from Meta" })] }), error && _jsx("p", { className: "text-red-500 text-sm mb-3", children: error }), _jsx(Card, { children: isLoading ? (_jsx("p", { children: "Loading..." })) : accounts.length === 0 ? (_jsx("p", { className: "text-sm text-slate-500", children: "No ad accounts yet. Connect Meta on the Integrations page, then Sync." })) : (_jsxs("table", { className: "w-full", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b", children: [_jsx("th", { className: "text-left py-2", children: "Account" }), _jsx("th", { className: "text-left py-2", children: "Status" }), _jsx("th", { className: "text-left py-2", children: "Spent" }), _jsx("th", { className: "text-left py-2", children: "Currency" }), _jsx("th", { className: "text-left py-2", children: "Timezone" }), _jsx("th", { className: "text-left py-2", children: "Business" }), _jsx("th", { className: "text-left py-2", children: "Synced" })] }) }), _jsx("tbody", { children: accounts.map((a) => (_jsxs("tr", { className: "border-b", children: [_jsxs("td", { className: "py-2 font-semibold", children: [a.name || a.metaAdAccountId, _jsx("br", {}), _jsx("span", { className: "text-xs text-slate-500 font-mono font-normal", children: a.metaAdAccountId })] }), _jsx("td", { className: "py-2", children: statusLabel(a.accountStatus) }), _jsx("td", { className: "py-2", children: a.amountSpent ?? '—' }), _jsx("td", { className: "py-2", children: a.currency || '—' }), _jsx("td", { className: "py-2 text-xs", children: a.timezone || '—' }), _jsx("td", { className: "py-2 text-xs", children: a.businessName || a.ownerBusinessId || '—' }), _jsx("td", { className: "py-2 text-xs", children: a.lastSyncedAt ? new Date(a.lastSyncedAt).toLocaleString() : '—' })] }, a._id))) })] })) })] }));
};
export default AdAccountsPage;
//# sourceMappingURL=AdAccountsPage.js.map
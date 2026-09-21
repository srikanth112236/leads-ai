import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import Card from '../components/common/Card';
import { useGet } from '../hooks/useApi';
const AuditLogsPage = () => {
    const { data, isLoading } = useGet('/admin/audit-logs');
    const logs = data?.data || [];
    return (_jsx("div", { children: _jsx(Card, { children: isLoading ? (_jsx("p", { children: "Loading..." })) : logs.length === 0 ? (_jsx("p", { children: "No audit entries" })) : (_jsxs("table", { className: "w-full", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b", children: [_jsx("th", { className: "text-left py-2", children: "Action" }), _jsx("th", { className: "text-left py-2", children: "Actor" }), _jsx("th", { className: "text-left py-2", children: "Company" }), _jsx("th", { className: "text-left py-2", children: "Details" }), _jsx("th", { className: "text-left py-2", children: "Time" })] }) }), _jsx("tbody", { children: logs.map((l) => (_jsxs("tr", { className: "border-b", children: [_jsx("td", { className: "py-2", children: l.action }), _jsx("td", { className: "py-2 font-mono text-xs", children: l.actorId || 'system' }), _jsx("td", { className: "py-2 font-mono text-xs", children: l.companyId || '—' }), _jsx("td", { className: "py-2 text-xs", children: JSON.stringify(l.metadata || {}) }), _jsx("td", { className: "py-2", children: new Date(l.createdAt).toLocaleString() })] }, l._id))) })] })) }) }));
};
export default AuditLogsPage;
//# sourceMappingURL=AuditLogsPage.js.map
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import Card from '../components/common/Card';
import { useGet } from '../hooks/useApi';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../services/api';
function nameMap(rows, label) {
    const map = {};
    for (const r of rows)
        map[r._id] = label(r);
    return map;
}
const LeadsPage = () => {
    const { data, isLoading } = useGet('/leads');
    const leads = data?.data || [];
    const { data: usersData } = useQuery({
        queryKey: ['users-map'],
        queryFn: () => api.get('/users').then((r) => r.data),
        retry: false,
    });
    const { data: branchesData } = useQuery({
        queryKey: ['branches-map'],
        queryFn: () => api.get('/branches').then((r) => r.data),
        retry: false,
    });
    const usersById = nameMap(usersData?.data || [], (u) => `${u.firstName} ${u.lastName}`);
    const branchesById = nameMap(branchesData?.data || [], (b) => b.name);
    return (_jsx("div", { children: _jsx(Card, { children: isLoading ? (_jsx("p", { children: "Loading..." })) : (_jsxs("table", { className: "w-full", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b", children: [_jsx("th", { className: "text-left py-2", children: "Name" }), _jsx("th", { className: "text-left py-2", children: "Source" }), _jsx("th", { className: "text-left py-2", children: "Status" }), _jsx("th", { className: "text-left py-2", children: "Branch" }), _jsx("th", { className: "text-left py-2", children: "Assigned" }), _jsx("th", { className: "text-left py-2", children: "Score" }), _jsx("th", { className: "text-left py-2", children: "Created" })] }) }), _jsx("tbody", { children: leads.map((lead) => (_jsxs("tr", { className: "border-b", children: [_jsx("td", { className: "py-2", children: _jsx(Link, { to: `/leads/${lead._id}`, className: "text-blue-600 hover:underline font-semibold", children: lead.name }) }), _jsx("td", { className: "py-2", children: lead.source }), _jsx("td", { className: "py-2", children: lead.status }), _jsx("td", { className: "py-2", children: lead.branchId ? branchesById[lead.branchId] || lead.branchId : '—' }), _jsx("td", { className: "py-2", children: lead.assignedTo ? usersById[lead.assignedTo] || lead.assignedTo : '—' }), _jsx("td", { className: "py-2", children: lead.score ?? 0 }), _jsx("td", { className: "py-2", children: new Date(lead.createdAt).toLocaleDateString() })] }, lead._id))) })] })) }) }));
};
export default LeadsPage;
//# sourceMappingURL=LeadsPage.js.map
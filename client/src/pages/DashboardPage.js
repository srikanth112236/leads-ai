import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import Card from '../components/common/Card';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
const MANAGERS = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER', 'BRANCH_MANAGER'];
const DashboardPage = () => {
    const { user } = useAuth();
    const isSuper = user?.role === 'SUPER_ADMIN';
    const isManager = !!user && MANAGERS.includes(user.role);
    const { data: leadsData } = useQuery({ queryKey: ['leads'], queryFn: () => api.get('/leads').then((r) => r.data) });
    const { data: companiesData } = useQuery({
        queryKey: ['companies'], queryFn: () => api.get('/companies').then((r) => r.data),
        enabled: isSuper, retry: false,
    });
    const { data: usersData } = useQuery({
        queryKey: ['users'], queryFn: () => api.get('/users').then((r) => r.data),
        enabled: isManager, retry: false,
    });
    const { data: failedData } = useQuery({
        queryKey: ['webhooks-failed'], queryFn: () => api.get('/webhooks?status=failed&limit=1').then((r) => r.data),
        enabled: isManager, retry: false,
    });
    const leads = leadsData?.data || [];
    const companies = companiesData?.data || [];
    const users = usersData?.data || [];
    const failedTotal = failedData?.pagination?.total ?? 0;
    const { data: accountsData } = useQuery({
        queryKey: ['adaccounts-alert'], queryFn: () => api.get('/meta/adaccounts').then((r) => r.data),
        enabled: isManager, retry: false,
    });
    const blockedAccounts = (accountsData?.data || []).filter((a) => [2, 3].includes(a.accountStatus));
    return (_jsxs("div", { children: [_jsxs("p", { className: "text-gray-500 mb-4", children: ["Welcome", user ? `, ${user.firstName}` : ''] }), blockedAccounts.length > 0 && (_jsxs("div", { className: "mb-4 px-4 py-3 bg-amber-50 border border-amber-300 text-amber-800 rounded-xl text-sm font-semibold", children: ["\u26A0 ", blockedAccounts.length, " ad account(s) blocked (", blockedAccounts.map((a) => a.name || a.metaAdAccountId).join(', '), ") \u2014 leads have stopped flowing. Check Ad Accounts."] })), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-4 gap-4 mb-6", children: [_jsx(Card, { title: "Total Leads", children: _jsx("p", { className: "text-3xl font-extrabold text-blue-600", children: leads.length }) }), isSuper && (_jsx(Card, { title: "Companies", children: _jsx("p", { className: "text-3xl font-extrabold text-green-600", children: companies.length }) })), isManager && (_jsx(Card, { title: "Users", children: _jsx("p", { className: "text-3xl font-extrabold text-violet-600", children: users.length }) })), isManager && (_jsx(Card, { title: "Failed Webhooks", children: _jsx("p", { className: "text-3xl font-extrabold text-red-600", children: failedTotal }) }))] })] }));
};
export default DashboardPage;
//# sourceMappingURL=DashboardPage.js.map
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Building2, GitBranch, Plug, Radio, ScrollText, Settings, LogOut, } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
const ALL_ROLES = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER', 'BRANCH_MANAGER', 'SALES_AGENT'];
const MANAGERS = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER', 'BRANCH_MANAGER'];
const NAV = [
    { to: '/dashboard', label: 'Dashboard', icon: _jsx(LayoutDashboard, { size: 17 }), roles: ALL_ROLES },
    { to: '/leads', label: 'Leads', icon: _jsx(Users, { size: 17 }), roles: ALL_ROLES },
    { to: '/branches', label: 'Branches', icon: _jsx(GitBranch, { size: 17 }), roles: MANAGERS },
    { to: '/users', label: 'Users', icon: _jsx(Users, { size: 17 }), roles: MANAGERS },
    { to: '/integrations', label: 'Integrations', icon: _jsx(Plug, { size: 17 }), roles: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER'] },
    { to: '/webhooks', label: 'Webhooks', icon: _jsx(Radio, { size: 17 }), roles: MANAGERS },
    { to: '/audit-logs', label: 'Audit Logs', icon: _jsx(ScrollText, { size: 17 }), roles: ['SUPER_ADMIN'] },
    { to: '/companies', label: 'Companies', icon: _jsx(Building2, { size: 17 }), roles: ['SUPER_ADMIN'] },
    { to: '/settings', label: 'Settings', icon: _jsx(Settings, { size: 17 }), roles: ALL_ROLES },
];
const TITLES = {
    '/dashboard': 'Dashboard',
    '/leads': 'Leads',
    '/branches': 'Branches',
    '/users': 'Users',
    '/integrations': 'Integrations',
    '/webhooks': 'Webhook Events',
    '/audit-logs': 'Audit Logs',
    '/companies': 'Companies',
    '/settings': 'Settings',
};
const Layout = () => {
    const { logout, user } = useAuth();
    const location = useLocation();
    const items = NAV.filter((item) => user && item.roles.includes(user.role));
    const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase();
    return (_jsxs("div", { className: "min-h-screen bg-slate-100 flex", children: [_jsxs("aside", { className: "w-60 shrink-0 bg-slate-900 text-slate-300 flex flex-col min-h-screen sticky top-0 h-screen", children: [_jsxs("div", { className: "px-5 pt-5 pb-4 flex items-center gap-2.5", children: [_jsx("div", { className: "w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center text-white font-extrabold text-sm", children: "L" }), _jsxs("div", { children: [_jsx("p", { className: "text-white font-extrabold text-sm leading-tight", children: "Lead CRM" }), _jsx("p", { className: "text-[11px] text-slate-400 leading-tight", children: "Multi-tenant platform" })] })] }), _jsx("nav", { className: "flex-1 px-3 py-2 space-y-0.5 overflow-y-auto", children: items.map((item) => {
                            const active = location.pathname === item.to;
                            return (_jsxs(Link, { to: item.to, className: `flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-semibold transition-colors ${active ? 'bg-indigo-500/15 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`, children: [item.icon, item.label] }, item.to));
                        }) }), _jsx("div", { className: "p-3 border-t border-white/10", children: _jsxs("div", { className: "flex items-center gap-2.5 px-2 py-1.5", children: [_jsx("div", { className: "w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-[11px] font-bold text-white shrink-0", children: initials }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsxs("p", { className: "text-[13px] font-bold text-white truncate", children: [user?.firstName, " ", user?.lastName] }), _jsx("p", { className: "text-[10px] text-slate-400 truncate", children: user?.role })] }), _jsx("button", { onClick: logout, title: "Logout", className: "text-slate-400 hover:text-white p-1", children: _jsx(LogOut, { size: 16 }) })] }) })] }), _jsxs("div", { className: "flex-1 min-w-0 flex flex-col", children: [_jsx("header", { className: "bg-white/80 backdrop-blur border-b border-slate-200 sticky top-0 z-10", children: _jsxs("div", { className: "px-6 py-3 flex items-center justify-between", children: [_jsx("h1", { className: "text-base font-extrabold text-slate-900", children: TITLES[location.pathname] || 'Lead CRM' }), _jsx("span", { className: "text-[11px] font-bold px-2 py-1 rounded-full bg-indigo-50 text-indigo-700", children: user?.role })] }) }), _jsx("main", { className: "px-6 py-5 max-w-6xl w-full mx-auto", children: _jsx(Outlet, {}) })] })] }));
};
export default Layout;
//# sourceMappingURL=Layout.js.map
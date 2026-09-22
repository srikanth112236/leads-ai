import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Building2,
  GitBranch,
  Plug,
  BarChart3,
  Radio,
  ScrollText,
  Settings,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  roles: string[];
}

const ALL_ROLES = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER', 'BRANCH_MANAGER', 'SALES_AGENT'];
const MANAGERS = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER', 'BRANCH_MANAGER'];

const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={17} />, roles: ALL_ROLES },
  { to: '/leads', label: 'Leads', icon: <Users size={17} />, roles: ALL_ROLES },
  { to: '/branches', label: 'Branches', icon: <GitBranch size={17} />, roles: MANAGERS },
  { to: '/users', label: 'Users', icon: <Users size={17} />, roles: MANAGERS },
  { to: '/integrations', label: 'Integrations', icon: <Plug size={17} />, roles: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER'] },
  { to: '/ad-accounts', label: 'Ad Accounts', icon: <BarChart3 size={17} />, roles: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER'] },
  { to: '/webhooks', label: 'Webhooks', icon: <Radio size={17} />, roles: MANAGERS },
  { to: '/audit-logs', label: 'Audit Logs', icon: <ScrollText size={17} />, roles: ['SUPER_ADMIN'] },
  { to: '/meta-setup', label: 'Meta Setup', icon: <Plug size={17} />, roles: ['SUPER_ADMIN'] },
  { to: '/companies', label: 'Companies', icon: <Building2 size={17} />, roles: ['SUPER_ADMIN'] },
  { to: '/settings', label: 'Settings', icon: <Settings size={17} />, roles: ALL_ROLES },
];

const TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/leads': 'Leads',
  '/branches': 'Branches',
  '/users': 'Users',
  '/integrations': 'Integrations',
  '/ad-accounts': 'Ad Accounts',
  '/webhooks': 'Webhook Events',
  '/audit-logs': 'Audit Logs',
  '/meta-setup': 'Meta Setup',
  '/companies': 'Companies',
  '/settings': 'Settings',
};

const Layout: React.FC = () => {
  const { logout, user } = useAuth();
  const location = useLocation();
  const items = NAV.filter((item) => user && item.roles.includes(user.role));
  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase();

  return (
    <div className="min-h-screen bg-slate-100 flex">
      <aside className="w-60 shrink-0 bg-slate-900 text-slate-300 flex flex-col min-h-screen sticky top-0 h-screen">
        <div className="px-5 pt-5 pb-4 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center text-white font-extrabold text-sm">L</div>
          <div>
            <p className="text-white font-extrabold text-sm leading-tight">Lead CRM</p>
            <p className="text-[11px] text-slate-400 leading-tight">Multi-tenant platform</p>
          </div>
        </div>
        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
          {items.map((item) => {
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-semibold transition-colors ${
                  active ? 'bg-indigo-500/15 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-white/10">
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-[11px] font-bold text-white shrink-0">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-white truncate">{user?.firstName} {user?.lastName}</p>
              <p className="text-[10px] text-slate-400 truncate">{user?.role}</p>
            </div>
            <button onClick={logout} title="Logout" className="text-slate-400 hover:text-white p-1">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white/80 backdrop-blur border-b border-slate-200 sticky top-0 z-10">
          <div className="px-6 py-3 flex items-center justify-between">
            <h1 className="text-base font-extrabold text-slate-900">{TITLES[location.pathname] || 'Lead CRM'}</h1>
            <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-indigo-50 text-indigo-700">{user?.role}</span>
          </div>
        </header>
        <main className="px-6 py-5 max-w-6xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;

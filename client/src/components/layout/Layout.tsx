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
  Kanban,
  UserCheck,
  Menu,
  X,
  ShieldCheck,
  Target,
  MonitorSmartphone,
  KeyRound,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useInactivityLogout } from '../../hooks/useInactivityLogout';
import CustomSelect from '../common/CustomSelect';
import CompanyScopeSelect from './CompanyScopeSelect';
import AccessExpiryBanner from '../common/AccessExpiryBanner';
import { useQueryClient } from '@tanstack/react-query';

type NavGroup = 'Workspace' | 'Manage' | 'System';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  roles: string[];
  anyPermissions?: string[];
  group: NavGroup;
}

const ALL_ROLES = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER', 'BRANCH_MANAGER', 'SALES_AGENT'];
const MANAGERS = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER', 'BRANCH_MANAGER'];

const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={17} />, roles: ALL_ROLES, group: 'Workspace' },
  { to: '/my-campaigns', label: 'My Campaigns', icon: <Target size={17} />, roles: ALL_ROLES, anyPermissions: ['campaigns:read'], group: 'Workspace' },
  { to: '/sessions', label: 'Sessions', icon: <MonitorSmartphone size={17} />, roles: ALL_ROLES, group: 'Workspace' },
  { to: '/leads', label: 'Leads', icon: <Users size={17} />, roles: ALL_ROLES, group: 'Workspace' },
  { to: '/leads/pipeline', label: 'Pipeline', icon: <Kanban size={17} />, roles: ALL_ROLES, group: 'Workspace' },
  { to: '/leads/assignment', label: 'Assignment', icon: <UserCheck size={17} />, roles: MANAGERS, group: 'Manage' },
  { to: '/branches', label: 'Branches', icon: <GitBranch size={17} />, roles: MANAGERS, group: 'Manage' },
  { to: '/users', label: 'Users', icon: <Users size={17} />, roles: MANAGERS, group: 'Manage' },
  { to: '/login-requests', label: 'Login Requests', icon: <KeyRound size={17} />, roles: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER'], anyPermissions: ['logins:approve'], group: 'Manage' },
  { to: '/ad-accounts', label: 'Ad Accounts', icon: <BarChart3 size={17} />, roles: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER', 'BRANCH_MANAGER'], group: 'Manage' },
  { to: '/integrations', label: 'Integrations', icon: <Plug size={17} />, roles: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER'], anyPermissions: ['integrations:read', 'integrations:manage', 'meta:manage', 'campaigns:read'], group: 'Manage' },
  { to: '/webhooks', label: 'Webhooks', icon: <Radio size={17} />, roles: MANAGERS, group: 'Manage' },
  { to: '/roles', label: 'Roles & RBAC', icon: <ShieldCheck size={17} />, roles: ['SUPER_ADMIN', 'COMPANY_ADMIN'], group: 'System' },
  { to: '/audit-logs', label: 'Audit Logs', icon: <ScrollText size={17} />, roles: ['SUPER_ADMIN'], group: 'System' },
  { to: '/meta-setup', label: 'Meta Setup', icon: <Plug size={17} />, roles: ['SUPER_ADMIN'], group: 'System' },
  { to: '/companies', label: 'Companies', icon: <Building2 size={17} />, roles: ['SUPER_ADMIN'], group: 'System' },
  { to: '/settings', label: 'Settings', icon: <Settings size={17} />, roles: MANAGERS, anyPermissions: ['settings:read', 'settings:manage'], group: 'System' },
];

const GROUP_ORDER: NavGroup[] = ['Workspace', 'Manage', 'System'];

const TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/sessions': 'Active Sessions',
  '/my-campaigns': 'My Campaigns',
  '/leads': 'Leads',
  '/leads/pipeline': 'Leads Pipeline',
  '/leads/assignment': 'Lead Assignment Hub',
  '/branches': 'Branches',
  '/users': 'Users',
  '/login-requests': 'Login Requests & Access',
  '/roles': 'Roles & Permissions',
  '/integrations': 'Integrations',
  '/ad-accounts': 'Ad Accounts',
  '/webhooks': 'Webhooks',
  '/audit-logs': 'Audit Logs',
  '/meta-setup': 'Meta Setup',
  '/companies': 'Companies',
  '/settings': 'Settings',
};

const Layout: React.FC = () => {
  const { logout, user, activeBranchId, branches, setActiveBranchId, hasAnyPermission } = useAuth();
  useInactivityLogout();
  const [collapsed, setCollapsed] = React.useState(() => localStorage.getItem('sidebar-collapsed') === '1');

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      localStorage.setItem('sidebar-collapsed', c ? '0' : '1');
      return !c;
    });
  };
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const items = NAV.filter((item) => {
    if (!user) return false;
    const normalizedUserRole = String(user.role || '').toUpperCase();
    if (normalizedUserRole === 'SUPER_ADMIN') return true;
    const allowedRoles = (item.roles || []).map((r) => String(r).toUpperCase());
    if (allowedRoles.includes(normalizedUserRole)) return true;
    // RBAC fallback for custom roles (lowercase slugs): show the item
    // when the user holds any of the mapped permissions.
    if (item.anyPermissions && item.anyPermissions.length > 0 && hasAnyPermission(item.anyPermissions)) {
      return true;
    }
    return false;
  });
  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase();

  const canViewAll = user?.role === 'SUPER_ADMIN' || user?.role === 'COMPANY_ADMIN' || user?.role === 'COMPANY_MANAGER';
  const queryClient = useQueryClient();

  const handleBranchChange = (newBranchId: string) => {
    setActiveBranchId(newBranchId || null);
    // Invalidate active queries so current page re-fetches with new branch scope without redirecting
    queryClient.invalidateQueries();
  };

  // Close mobile nav on route change
  React.useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-slate-100 flex relative">
      {/* Mobile Backdrop */}
      {mobileNavOpen && (
        <div
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-30 md:hidden"
        />
      )}

      {/* Sidebar Navigation – light theme, collapsible on desktop */}
      <aside
        className={`shrink-0 bg-white border-r border-slate-200 text-slate-600 flex flex-col min-h-screen fixed md:sticky top-0 h-screen z-40 transition-all duration-200 ease-in-out ${
          mobileNavOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0'
        } ${collapsed ? 'md:w-[68px]' : 'md:w-64'} w-64`}
      >
        <div className={`pt-5 pb-4 flex items-center ${collapsed ? 'md:justify-center md:px-0 px-5' : 'px-5'} justify-between`}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-extrabold text-sm shadow-xs shrink-0">
              L
            </div>
            <div className={collapsed ? 'md:hidden' : ''}>
              <p className="text-slate-900 font-extrabold text-sm leading-tight tracking-tight">Lead CRM</p>
              <p className="text-[11px] text-slate-400 leading-tight">Multi-tenant platform</p>
            </div>
          </div>
          <button
            onClick={() => setMobileNavOpen(false)}
            className="md:hidden p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-3 overflow-y-auto">
          {GROUP_ORDER.map((group) => {
            const groupItems = items.filter((i) => i.group === group);
            if (groupItems.length === 0) return null;
            return (
              <div key={group}>
                <p className={`px-3 mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 ${collapsed ? 'md:hidden' : ''}`}>
                  {group}
                </p>
                <div className="space-y-0.5">
                  {groupItems.map((item) => {
                    const active =
                      location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        title={collapsed ? item.label : undefined}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-semibold transition-colors ${
                          collapsed ? 'md:justify-center md:px-0' : ''
                        } ${
                          active
                            ? 'bg-indigo-50 text-indigo-700 font-bold'
                            : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                        }`}
                      >
                        <span className="shrink-0">{item.icon}</span>
                        <span className={`truncate ${collapsed ? 'md:hidden' : ''}`}>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className={`p-3 border-t border-slate-200 ${collapsed ? 'md:px-2' : ''}`}>
          <div className={`flex items-center gap-2.5 px-2 py-1.5 ${collapsed ? 'md:justify-center md:px-0' : ''}`}>
            <div className="w-8 h-8 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center text-[11px] font-bold text-indigo-700 shrink-0">
              {initials}
            </div>
            <div className={`min-w-0 flex-1 ${collapsed ? 'md:hidden' : ''}`}>
              <p className="text-[13px] font-bold text-slate-900 truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-[10px] text-slate-400 truncate">{user?.role?.replace(/_/g, ' ')}</p>
            </div>
            <button
              onClick={() => logout()}
              title="Logout"
              className={`text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1.5 rounded-lg ${collapsed ? 'md:mx-auto' : ''}`}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col w-full">
        <header className="bg-white/90 backdrop-blur border-b border-slate-200 sticky top-0 z-20">
          <div className="px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setMobileNavOpen(true)}
                className="md:hidden p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 shrink-0"
                aria-label="Open navigation menu"
              >
                <Menu size={18} />
              </button>
              <button
                onClick={toggleCollapsed}
                className="hidden md:flex p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 shrink-0"
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
              </button>
              <h1 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight truncate">
                {TITLES[location.pathname] || 'Lead CRM'}
              </h1>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <CompanyScopeSelect />
              {/* Branch Switcher Dropdown */}
              {branches.length > 0 && (
                <div className="flex items-center gap-1.5 min-w-[180px] max-w-[260px]">
                  <GitBranch size={13} className="text-indigo-600 shrink-0 hidden sm:inline" />
                  <div className="flex-1 min-w-0 [&>div]:mb-0">
                    <CustomSelect
                      value={activeBranchId || ''}
                      onChange={(val) => handleBranchChange(val)}
                      options={[
                        ...(canViewAll ? [{ value: '', label: 'All Branches (Company View)' }] : []),
                        ...branches.map((b) => ({
                          value: b._id,
                          label: b.name,
                          subLabel: b.branchCode,
                        })),
                      ]}
                      placeholder="Branch…"
                      compact
                    />
                  </div>
                </div>
              )}

              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 hidden sm:inline">
                {user?.role?.replace(/_/g, ' ')}
              </span>
            </div>
          </div>
        </header>
        <AccessExpiryBanner />
        <main className="px-4 sm:px-6 lg:px-8 py-5 w-full max-w-7xl 2xl:max-w-[1700px] mx-auto flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;

import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import LeadsPage from './pages/LeadsPage';
import CompaniesPage from './pages/CompaniesPage';
import BranchesPage from './pages/BranchesPage';
import UsersPage from './pages/UsersPage';
import IntegrationsPage from './pages/IntegrationsPage';
import IntegrationsConnectedPage from './pages/IntegrationsConnectedPage';
import WebhooksPage from './pages/WebhooksPage';
import AuditLogsPage from './pages/AuditLogsPage';
import MetaSetupPage from './pages/MetaSetupPage';
import SettingsPage from './pages/SettingsPage';
import Layout from './components/layout/Layout';
import RequireRole from './components/common/RequireRole';
const MANAGERS = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER', 'BRANCH_MANAGER'];
const INTEGRATION_ROLES = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER'];
const App = () => {
    const { isAuthenticated } = useAuth();
    return (_jsxs(Routes, { children: [_jsx(Route, { path: "/login", element: !isAuthenticated ? _jsx(LoginPage, {}) : _jsx(Navigate, { to: "/dashboard" }) }), _jsxs(Route, { path: "/*", element: isAuthenticated ? _jsx(Layout, {}) : _jsx(Navigate, { to: "/login" }), children: [_jsx(Route, { index: true, element: _jsx(Navigate, { to: "dashboard", replace: true }) }), _jsx(Route, { path: "dashboard", element: _jsx(DashboardPage, {}) }), _jsx(Route, { path: "leads", element: _jsx(LeadsPage, {}) }), _jsx(Route, { path: "branches", element: _jsx(RequireRole, { roles: MANAGERS, children: _jsx(BranchesPage, {}) }) }), _jsx(Route, { path: "users", element: _jsx(RequireRole, { roles: MANAGERS, children: _jsx(UsersPage, {}) }) }), _jsx(Route, { path: "integrations", element: _jsx(RequireRole, { roles: INTEGRATION_ROLES, children: _jsx(IntegrationsPage, {}) }) }), _jsx(Route, { path: "integrations/connected", element: _jsx(RequireRole, { roles: INTEGRATION_ROLES, children: _jsx(IntegrationsConnectedPage, {}) }) }), _jsx(Route, { path: "webhooks", element: _jsx(RequireRole, { roles: MANAGERS, children: _jsx(WebhooksPage, {}) }) }), _jsx(Route, { path: "audit-logs", element: _jsx(RequireRole, { roles: ['SUPER_ADMIN'], children: _jsx(AuditLogsPage, {}) }) }), _jsx(Route, { path: "meta-setup", element: _jsx(RequireRole, { roles: ['SUPER_ADMIN'], children: _jsx(MetaSetupPage, {}) }) }), _jsx(Route, { path: "companies", element: _jsx(RequireRole, { roles: ['SUPER_ADMIN'], children: _jsx(CompaniesPage, {}) }) }), _jsx(Route, { path: "settings", element: _jsx(SettingsPage, {}) })] })] }));
};
export default App;
//# sourceMappingURL=App.js.map
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import LeadsPage from './pages/LeadsPage';
import LeadDetailPage from './pages/LeadDetailPage';
import CompaniesPage from './pages/CompaniesPage';
import BranchesPage from './pages/BranchesPage';
import UsersPage from './pages/UsersPage';
import IntegrationsPage from './pages/IntegrationsPage';
import AdAccountsPage from './pages/AdAccountsPage';
import IntegrationsConnectedPage from './pages/IntegrationsConnectedPage';
import WebhooksPage from './pages/WebhooksPage';
import AuditLogsPage from './pages/AuditLogsPage';
import MetaSetupPage from './pages/MetaSetupPage';
import SettingsPage from './pages/SettingsPage';
import Layout from './components/layout/Layout';
import RequireRole from './components/common/RequireRole';

const MANAGERS = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER', 'BRANCH_MANAGER'];
const INTEGRATION_ROLES = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER'];

const App: React.FC = () => {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={!isAuthenticated ? <LoginPage /> : <Navigate to="/dashboard" />} />
      <Route path="/*" element={isAuthenticated ? <Layout /> : <Navigate to="/login" />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="leads" element={<LeadsPage />} />
        <Route path="leads/:id" element={<LeadDetailPage />} />
        <Route path="branches" element={<RequireRole roles={MANAGERS}><BranchesPage /></RequireRole>} />
        <Route path="users" element={<RequireRole roles={MANAGERS}><UsersPage /></RequireRole>} />
        <Route path="integrations" element={<RequireRole roles={INTEGRATION_ROLES}><IntegrationsPage /></RequireRole>} />
        <Route path="ad-accounts" element={<RequireRole roles={INTEGRATION_ROLES}><AdAccountsPage /></RequireRole>} />
        <Route path="integrations/connected" element={<RequireRole roles={INTEGRATION_ROLES}><IntegrationsConnectedPage /></RequireRole>} />
        <Route path="webhooks" element={<RequireRole roles={MANAGERS}><WebhooksPage /></RequireRole>} />
        <Route path="audit-logs" element={<RequireRole roles={['SUPER_ADMIN']}><AuditLogsPage /></RequireRole>} />
        <Route path="meta-setup" element={<RequireRole roles={['SUPER_ADMIN']}><MetaSetupPage /></RequireRole>} />
        <Route path="companies" element={<RequireRole roles={['SUPER_ADMIN']}><CompaniesPage /></RequireRole>} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
};

export default App;

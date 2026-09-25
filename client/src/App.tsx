import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import SessionsPage from './pages/SessionsPage';
import LoginRequestsPage from './pages/LoginRequestsPage';
import DashboardPage from './pages/DashboardPage';
import LeadsPage from './pages/LeadsPage';
import LeadPipelinePage from './pages/LeadPipelinePage';
import LeadAssignmentPage from './pages/LeadAssignmentPage';
import LeadDetailPage from './pages/LeadDetailPage';
import CompaniesPage from './pages/CompaniesPage';
import BranchesPage from './pages/BranchesPage';
import UsersPage from './pages/UsersPage';
import UserDetailPage from './pages/UserDetailPage';
import IntegrationsPage from './pages/IntegrationsPage';
import AdAccountsPage from './pages/AdAccountsPage';
import AdAccountDetailPage from './pages/AdAccountDetailPage';
import IntegrationsConnectedPage from './pages/IntegrationsConnectedPage';
import WebhooksPage from './pages/WebhooksPage';
import AuditLogsPage from './pages/AuditLogsPage';
import MetaSetupPage from './pages/MetaSetupPage';
import MyCampaignsPage from './pages/MyCampaignsPage';
import SettingsPage from './pages/SettingsPage';
import RolesPage from './pages/RolesPage';
import PublicFormPage from './pages/PublicFormPage';
import Layout from './components/layout/Layout';
import RequireRole from './components/common/RequireRole';
import SessionModal from './components/common/SessionModal';
import DeviceApprovalModal from './components/common/DeviceApprovalModal';
import { ToastProvider } from './components/common/Toast';

const MANAGERS = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER', 'BRANCH_MANAGER'];
const INTEGRATION_ROLES = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER'];
const SETTINGS_PERMISSIONS = ['settings:read', 'settings:manage'];
const INTEGRATION_PERMISSIONS = ['integrations:read', 'integrations:manage', 'meta:manage', 'campaigns:read'];

const App: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-semibold text-slate-500">Loading your workspace…</p>
        </div>
      </div>
    );
  }

  return (
    <ToastProvider>
      <SessionModal />
      <DeviceApprovalModal />
      <Routes>
        <Route path="/login" element={!isAuthenticated ? <LoginPage /> : <Navigate to="/dashboard" />} />
        <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
        <Route path="/forms/view/:id" element={<PublicFormPage />} />
        <Route path="/*" element={isAuthenticated ? <Layout /> : <Navigate to="/login" />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="sessions" element={<SessionsPage />} />
          <Route path="login-requests" element={<RequireRole roles={['SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER']} anyPermissions={['logins:approve']}><LoginRequestsPage /></RequireRole>} />
          <Route path="my-campaigns" element={<RequireRole roles={MANAGERS} anyPermissions={['campaigns:read']}><MyCampaignsPage /></RequireRole>} />
          <Route path="leads" element={<LeadsPage />} />
          <Route path="leads/pipeline" element={<LeadPipelinePage />} />
          <Route path="leads/assignment" element={<RequireRole roles={MANAGERS}><LeadAssignmentPage /></RequireRole>} />
          <Route path="leads/:id" element={<LeadDetailPage />} />
          <Route path="branches" element={<RequireRole roles={MANAGERS}><BranchesPage /></RequireRole>} />
          <Route path="users" element={<RequireRole roles={MANAGERS}><UsersPage /></RequireRole>} />
          <Route path="users/:id" element={<RequireRole roles={MANAGERS}><UserDetailPage /></RequireRole>} />
          <Route path="roles" element={<RequireRole roles={['SUPER_ADMIN', 'COMPANY_ADMIN']}><RolesPage /></RequireRole>} />
          <Route path="integrations" element={<RequireRole roles={INTEGRATION_ROLES} anyPermissions={INTEGRATION_PERMISSIONS}><IntegrationsPage /></RequireRole>} />
          <Route path="ad-accounts" element={<RequireRole roles={MANAGERS}><AdAccountsPage /></RequireRole>} />
          <Route path="ad-accounts/:id" element={<RequireRole roles={MANAGERS}><AdAccountDetailPage /></RequireRole>} />
          <Route path="integrations/connected" element={<RequireRole roles={INTEGRATION_ROLES} anyPermissions={INTEGRATION_PERMISSIONS}><IntegrationsConnectedPage /></RequireRole>} />
          <Route path="webhooks" element={<RequireRole roles={MANAGERS}><WebhooksPage /></RequireRole>} />
          <Route path="audit-logs" element={<RequireRole roles={['SUPER_ADMIN']}><AuditLogsPage /></RequireRole>} />
          <Route path="meta-setup" element={<RequireRole roles={['SUPER_ADMIN']}><MetaSetupPage /></RequireRole>} />
          <Route path="companies" element={<RequireRole roles={['SUPER_ADMIN']}><CompaniesPage /></RequireRole>} />
          <Route path="settings" element={<RequireRole roles={MANAGERS} anyPermissions={SETTINGS_PERMISSIONS}><SettingsPage /></RequireRole>} />
        </Route>
      </Routes>
    </ToastProvider>
  );
};

export default App;

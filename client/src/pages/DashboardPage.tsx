import React from 'react';
import Card from '../components/common/Card';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const MANAGERS = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER', 'BRANCH_MANAGER'];

const DashboardPage: React.FC = () => {
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

  const leads = (leadsData as any)?.data || [];
  const companies = (companiesData as any)?.data || [];
  const users = (usersData as any)?.data || [];
  const failedTotal = (failedData as any)?.pagination?.total ?? 0;

  const { data: accountsData } = useQuery({
    queryKey: ['adaccounts-alert'], queryFn: () => api.get('/meta/adaccounts').then((r) => r.data),
    enabled: isManager, retry: false,
  });
  const blockedAccounts = ((accountsData as any)?.data || []).filter((a: any) => [2, 3].includes(a.accountStatus));

  return (
    <div>
      <p className="text-gray-500 mb-4">Welcome{user ? `, ${user.firstName}` : ''}</p>
      {blockedAccounts.length > 0 && (
        <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-300 text-amber-800 rounded-xl text-sm font-semibold">
          ⚠ {blockedAccounts.length} ad account(s) blocked ({blockedAccounts.map((a: any) => a.name || a.metaAdAccountId).join(', ')}) — leads have stopped flowing. Check Ad Accounts.
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card title="Total Leads">
          <p className="text-3xl font-extrabold text-blue-600">{leads.length}</p>
        </Card>
        {isSuper && (
          <Card title="Companies">
            <p className="text-3xl font-extrabold text-green-600">{companies.length}</p>
          </Card>
        )}
        {isManager && (
          <Card title="Users">
            <p className="text-3xl font-extrabold text-violet-600">{users.length}</p>
          </Card>
        )}
        {isManager && (
          <Card title="Failed Webhooks">
            <p className="text-3xl font-extrabold text-red-600">{failedTotal}</p>
          </Card>
        )}
      </div>
    </div>
  );
};

export default DashboardPage;

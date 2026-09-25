import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';
import CustomSelect from '../common/CustomSelect';
import { useCompanyScope } from '../../context/CompanyScopeContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

/**
 * Super-admin company context: scopes audit logs, webhooks, branches and
 * users to one company. Null = platform-wide (current behavior).
 */
const CompanyScopeSelect: React.FC = () => {
  const { user } = useAuth();
  const { scopedCompanyId, setScopedCompanyId } = useCompanyScope();
  const isSuper = String(user?.role || '').toUpperCase() === 'SUPER_ADMIN';

  const { data } = useQuery({
    queryKey: ['companies-scope-list'],
    queryFn: () => api.get('/companies').then((r) => r.data),
    enabled: isSuper,
    retry: false,
  });
  const companies: any[] = (data as any)?.data || [];

  if (!isSuper) return null;

  return (
    <div className="flex items-center gap-1.5 min-w-[170px] max-w-[240px]" title="Super-admin company context">
      <Building2 size={13} className="text-violet-600 shrink-0 hidden sm:inline" />
      <div className="flex-1 min-w-0 [&>div]:mb-0">
        <CustomSelect
          value={scopedCompanyId || ''}
          onChange={(val) => setScopedCompanyId(val || null)}
          options={[
            { value: '', label: 'All companies' },
            ...companies.map((c: any) => ({ value: c._id, label: c.name })),
          ]}
          placeholder="Company…"
          compact
          searchable
        />
      </div>
    </div>
  );
};

export default CompanyScopeSelect;

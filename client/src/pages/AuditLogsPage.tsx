import React from 'react';
import Card from '../components/common/Card';
import { useGet } from '../hooks/useApi';
import { useCompanyScope } from '../context/CompanyScopeContext';

const AuditLogsPage: React.FC = () => {
  const { scopedCompanyId } = useCompanyScope();
  const url = scopedCompanyId ? `/admin/audit-logs?companyId=${scopedCompanyId}` : '/admin/audit-logs';
  const { data, isLoading } = useGet(url);
  const logs = (data as any)?.data || [];

  return (
    <div>
      <Card>
        {isLoading ? (
          <p>Loading...</p>
        ) : logs.length === 0 ? (
          <p>No audit entries</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Action</th>
                <th className="text-left py-2">Actor</th>
                <th className="text-left py-2">Company</th>
                <th className="text-left py-2">Details</th>
                <th className="text-left py-2">Time</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l: any) => (
                <tr key={l._id} className="border-b">
                  <td className="py-2">{l.action}</td>
                  <td className="py-2 font-mono text-xs">{l.actorId || 'system'}</td>
                  <td className="py-2 font-mono text-xs">{l.companyId || '—'}</td>
                  <td className="py-2 text-xs">{JSON.stringify(l.metadata || {})}</td>
                  <td className="py-2">{new Date(l.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
};

export default AuditLogsPage;

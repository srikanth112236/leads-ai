import React from 'react';
import Card from '../components/common/Card';
import { useGet } from '../hooks/useApi';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

function nameMap(rows: any[], label: (r: any) => string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const r of rows) map[r._id] = label(r);
  return map;
}

const LeadsPage: React.FC = () => {
  const { data, isLoading } = useGet('/leads');
  const leads = (data as any)?.data || [];
  const { data: usersData } = useQuery({
    queryKey: ['users-map'],
    queryFn: () => api.get('/users').then((r) => r.data),
    retry: false,
  });
  const { data: branchesData } = useQuery({
    queryKey: ['branches-map'],
    queryFn: () => api.get('/branches').then((r) => r.data),
    retry: false,
  });
  const usersById = nameMap((usersData as any)?.data || [], (u) => `${u.firstName} ${u.lastName}`);
  const branchesById = nameMap((branchesData as any)?.data || [], (b) => b.name);

  return (
    <div>
      <Card>
        {isLoading ? (
          <p>Loading...</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Name</th>
                <th className="text-left py-2">Source</th>
                <th className="text-left py-2">Status</th>
                <th className="text-left py-2">Branch</th>
                <th className="text-left py-2">Assigned</th>
                <th className="text-left py-2">Score</th>
                <th className="text-left py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead: any) => (
                <tr key={lead._id} className="border-b">
                  <td className="py-2">{lead.name}</td>
                  <td className="py-2">{lead.source}</td>
                  <td className="py-2">{lead.status}</td>
                  <td className="py-2">{lead.branchId ? branchesById[lead.branchId] || lead.branchId : '—'}</td>
                  <td className="py-2">{lead.assignedTo ? usersById[lead.assignedTo] || lead.assignedTo : '—'}</td>
                  <td className="py-2">{lead.score ?? 0}</td>
                  <td className="py-2">{new Date(lead.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
};

export default LeadsPage;

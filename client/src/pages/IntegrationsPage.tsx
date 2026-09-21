import React, { useState } from 'react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import { useGet, usePost, usePut } from '../hooks/useApi';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const IntegrationsPage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isSuper = user?.role === 'SUPER_ADMIN';
  const url = isSuper ? '/admin/integrations' : `/companies/${user?.companyId}/integrations`;
  const { data, isLoading } = useGet(url);
  const payload = (data as any)?.data || {};
  const { data: branchesData } = useQuery({
    queryKey: ['branches-list'],
    queryFn: () => api.get('/branches').then((r) => r.data),
    retry: false,
  });
  const branches = (branchesData as any)?.data || [];
  const [error, setError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<Record<string, string>>({});

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: [url] });
    queryClient.invalidateQueries({ queryKey: ['branches-list'] });
  };

  const connect = usePost('/meta/oauth/start');
  const disconnect = usePost('/meta/disconnect');

  const startConnect = () => {
    setError(null);
    connect.mutate(undefined, {
      onSuccess: (res: any) => {
        const dialogUrl = res?.data?.data?.dialogUrl;
        if (dialogUrl) window.location.href = dialogUrl;
        else setError('No dialog URL returned');
      },
      onError: (err: any) => setError(err?.response?.data?.error || 'Connect failed'),
    });
  };

  const doDisconnect = () => {
    if (!window.confirm('Disconnect Meta? Lead flow will stop.')) return;
    disconnect.mutate(undefined, {
      onSuccess: refresh,
      onError: (err: any) => setError(err?.response?.data?.error || 'Disconnect failed'),
    });
  };

  const meta = payload.meta || [];
  const metaPages = payload.metaPages || [];
  const connected = meta.some((m: any) => m.status === 'active');
  const unassigned = metaPages.filter((p: any) => !p.branchId);

  const sections: Array<{ title: string; rows: any[] }> = [
    { title: 'WhatsApp', rows: payload.whatsapp || [] },
    { title: 'Website Forms', rows: payload.websiteForms || [] },
  ];

  return (
    <div>
      {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
      {!isSuper && (
        <Card title="Meta Lead Ads" className="mb-4">
          {!connected ? (
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">Connect your company's Facebook Pages to receive Lead Ads.</p>
              <Button onClick={startConnect} loading={connect.isPending}>Connect Meta</Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-green-700 font-semibold">Connected{metaPages.length > 0 ? ` — ${metaPages.length} page(s)` : ''}</p>
              <Button variant="danger" onClick={doDisconnect} loading={disconnect.isPending}>Disconnect</Button>
            </div>
          )}
        </Card>
      )}
      {!isSuper && unassigned.length > 0 && (
        <Card title="Pages waiting for branch assignment" className="mb-4">
          {unassigned.map((p: any) => (
            <PageAssignRow
              key={p._id}
              page={p}
              branches={branches}
              branchId={assigning[p._id] || ''}
              onSelect={(v: string) => setAssigning({ ...assigning, [p._id]: v })}
              onDone={refresh}
              onError={setError}
            />
          ))}
        </Card>
      )}
      {isLoading ? (
        <p>Loading...</p>
      ) : (
        sections.map((section) => (
          <Card key={section.title} title={section.title} className="mb-4">
            {section.rows.length === 0 ? (
              <p className="text-gray-500">None configured</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">ID</th>
                    <th className="text-left py-2">Status</th>
                    <th className="text-left py-2">Company</th>
                    <th className="text-left py-2">Branch</th>
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((row: any) => (
                    <tr key={row._id} className="border-b">
                      <td className="py-2 font-mono text-xs">{row._id}</td>
                      <td className="py-2">{row.status}</td>
                      <td className="py-2 font-mono text-xs">{row.companyId}</td>
                      <td className="py-2 font-mono text-xs">{row.branchId || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        ))
      )}
    </div>
  );
};

const PageAssignRow: React.FC<{
  page: any; branches: any[]; branchId: string;
  onSelect: (v: string) => void; onDone: () => void; onError: (m: string) => void;
}> = ({ page, branches, branchId, onSelect, onDone, onError }) => {
  const assign = usePut(`/meta/pages/${page._id}/assign`);
  return (
    <div className="flex items-center gap-3 py-2 border-b last:border-0">
      <span className="text-sm font-semibold flex-1">{page.name || page.metaPageId}</span>
      <select value={branchId} onChange={(e) => onSelect(e.target.value)} className="px-2 py-1.5 border rounded-lg text-sm">
        <option value="">Select branch…</option>
        {branches.map((b: any) => <option key={b._id} value={b._id}>{b.name}</option>)}
      </select>
      <Button
        variant="secondary"
        loading={assign.isPending}
        onClick={() => {
          if (!branchId) return;
          assign.mutate({ branchId }, { onSuccess: onDone, onError: (err: any) => onError(err?.response?.data?.error || 'Assign failed') });
        }}
      >
        Assign
      </Button>
    </div>
  );
};

export default IntegrationsPage;

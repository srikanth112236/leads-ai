import React, { useState } from 'react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import { useGet, usePost } from '../hooks/useApi';
import { useQueryClient } from '@tanstack/react-query';

const STATUS_LABELS: Record<number, string> = {
  1: 'Active',
  2: 'Disabled',
  3: 'Unsettled — payment failed',
  7: 'Pending risk review',
  8: 'Pending settlement',
  9: 'In grace period',
  100: 'Pending closure',
  101: 'Closed',
};

function statusLabel(code?: number): string {
  if (code === undefined || code === null) return '—';
  return STATUS_LABELS[code] || `Code ${code}`;
}

const AdAccountsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useGet('/meta/adaccounts');
  const accounts = (data as any)?.data || [];
  const [error, setError] = useState<string | null>(null);
  const sync = usePost('/meta/adaccounts/sync');

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['/meta/adaccounts'] });

  const runSync = () => {
    setError(null);
    sync.mutate(undefined, {
      onSuccess: refresh,
      onError: (err: any) => setError(err?.response?.data?.error || 'Sync failed'),
    });
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div />
        <Button onClick={runSync} loading={sync.isPending}>Sync from Meta</Button>
      </div>
      {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
      <Card>
        {isLoading ? (
          <p>Loading...</p>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-slate-500">No ad accounts yet. Connect Meta on the Integrations page, then Sync.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Account</th>
                <th className="text-left py-2">Status</th>
                <th className="text-left py-2">Spent</th>
                <th className="text-left py-2">Currency</th>
                <th className="text-left py-2">Timezone</th>
                <th className="text-left py-2">Business</th>
                <th className="text-left py-2">Synced</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a: any) => (
                <tr key={a._id} className="border-b">
                  <td className="py-2 font-semibold">{a.name || a.metaAdAccountId}<br /><span className="text-xs text-slate-500 font-mono font-normal">{a.metaAdAccountId}</span></td>
                  <td className="py-2">{statusLabel(a.accountStatus)}</td>
                  <td className="py-2">{a.amountSpent ?? '—'}</td>
                  <td className="py-2">{a.currency || '—'}</td>
                  <td className="py-2 text-xs">{a.timezone || '—'}</td>
                  <td className="py-2 text-xs">{a.businessName || a.ownerBusinessId || '—'}</td>
                  <td className="py-2 text-xs">{a.lastSyncedAt ? new Date(a.lastSyncedAt).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
};

export default AdAccountsPage;

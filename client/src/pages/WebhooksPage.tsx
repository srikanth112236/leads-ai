import React, { useState } from 'react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import CustomSelect from '../components/common/CustomSelect';
import { useGet } from '../hooks/useApi';
import { useQuery } from '@tanstack/react-query';
import { useCompanyScope } from '../context/CompanyScopeContext';
import api from '../services/api';

const WebhooksPage: React.FC = () => {
  const [provider, setProvider] = useState('');
  const [status, setStatus] = useState('');
  const [traceKey, setTraceKey] = useState<{ provider: string; externalEventId: string } | null>(null);
  const { scopedCompanyId } = useCompanyScope();

  const query = `/webhooks?${new URLSearchParams({
    ...(provider ? { provider } : {}),
    ...(status ? { status } : {}),
    ...(scopedCompanyId ? { companyId: scopedCompanyId } : {}),
  })}`;
  const { data, isLoading, refetch } = useGet(query);
  const events = (data as any)?.data || [];

  const { data: traceData, isFetching: traceLoading } = useQuery({
    queryKey: ['trace', traceKey?.provider, traceKey?.externalEventId],
    queryFn: () =>
      api
        .get(`/webhooks/trace?provider=${traceKey!.provider}&externalEventId=${traceKey!.externalEventId}`)
        .then((r) => r.data),
    enabled: !!traceKey,
    retry: false,
  });
  const trace = (traceData as any)?.data;

  return (
    <div>
      <Card className="mb-4">
        <div className="flex gap-3 items-end flex-wrap">
          <div className="w-44 [&>div]:mb-0">
            <CustomSelect
              label="Provider"
              value={provider}
              onChange={setProvider}
              options={[
                { value: '', label: 'All' },
                { value: 'meta', label: 'Meta' },
                { value: 'whatsapp', label: 'WhatsApp' },
                { value: 'website', label: 'Website' },
              ]}
              compact
            />
          </div>
          <div className="w-44 [&>div]:mb-0">
            <CustomSelect
              label="Status"
              value={status}
              onChange={setStatus}
              options={[
                { value: '', label: 'All' },
                { value: 'pending', label: 'Pending' },
                { value: 'processing', label: 'Processing' },
                { value: 'processed', label: 'Processed' },
                { value: 'failed', label: 'Failed' },
              ]}
              compact
            />
          </div>
          <div className="pb-0.5">
            <Button variant="secondary" size="sm" onClick={() => refetch()}>Refresh</Button>
          </div>
        </div>
      </Card>
      <Card>
        {isLoading ? (
          <p>Loading...</p>
        ) : events.length === 0 ? (
          <p>No webhook events</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Provider</th>
                <th className="text-left py-2">Event</th>
                <th className="text-left py-2">Status</th>
                <th className="text-left py-2">Attempts</th>
                <th className="text-left py-2">Error</th>
                <th className="text-left py-2">Received</th>
                <th className="text-left py-2">Trace</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e: any) => (
                <tr key={e._id} className="border-b">
                  <td className="py-2">{e.provider}</td>
                  <td className="py-2 font-mono text-xs">{e.externalEventId}</td>
                  <td className="py-2">{e.status}</td>
                  <td className="py-2">{e.attempts}/{e.maxAttempts}</td>
                  <td className="py-2 text-red-600 text-xs">{e.error || '—'}</td>
                  <td className="py-2">{new Date(e.receivedAt).toLocaleString()}</td>
                  <td className="py-2">
                    <Button variant="secondary" onClick={() => setTraceKey({ provider: e.provider, externalEventId: e.externalEventId })}>
                      Trace
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {traceKey && (
        <Card title="Event Trace" className="mt-4">
          {traceLoading ? (
            <p>Loading trace...</p>
          ) : trace ? (
            <div className="space-y-2 text-sm">
              <p><strong>Status:</strong> {trace.event.status} (attempts {trace.event.attempts})</p>
              <p><strong>Lead:</strong> {trace.lead ? `${trace.lead.name} (${trace.lead._id})` : '—'}</p>
              <p><strong>Sources:</strong> {trace.sources?.map((s: any) => s.sourceType).join(', ') || '—'}</p>
              <p><strong>Tracker:</strong> {trace.trackerEvents?.map((t: any) => t.eventType).join(', ') || '—'}</p>
              <p><strong>Duplicate:</strong> {trace.duplicate ? 'Yes' : 'No'}</p>
            </div>
          ) : (
            <p>Trace not available</p>
          )}
        </Card>
      )}
    </div>
  );
};

export default WebhooksPage;

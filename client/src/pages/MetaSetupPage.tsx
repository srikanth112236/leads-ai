import React, { useState } from 'react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import { useGet, usePost } from '../hooks/useApi';

const MetaSetupPage: React.FC = () => {
  const { data } = useGet('/admin/meta/status');
  const status = (data as any)?.data || {};
  const [shortToken, setShortToken] = useState('');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const exchange = usePost('/admin/meta/exchange');

  const checks: Array<[string, boolean]> = [
    ['META_APP_ID set', !!status.appIdSet],
    ['META_APP_SECRET set', !!status.appSecretSet],
    ['META_WEBHOOK_VERIFY_TOKEN set', !!status.verifyTokenSet],
    ['META_TOKEN_KEY set', !!status.tokenKeySet],
  ];

  const runExchange = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setCopied(false);
    exchange.mutate(
      { shortToken },
      {
        onSuccess: (res: any) => setResult(res?.data?.data),
        onError: (err: any) => setError(err?.response?.data?.error || 'Exchange failed'),
      },
    );
  };

  return (
    <div>
      <Card title="Platform Meta configuration" className="mb-4">
        <p className="text-xs text-slate-500 mb-3">Presence only — values are never returned by the API. Set them in Render → Environment.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          {checks.map(([label, ok]) => (
            <p key={label}>{ok ? '✅' : '❌'} {label} <span className="text-slate-400">(graph {status.graphVersion || '…'})</span></p>
          ))}
        </div>
      </Card>
      <Card title="Short token → long-lived token exchange" className="mb-4">
        <p className="text-xs text-slate-500 mb-3">
          1. Open Graph API Explorer, select your app, tick the scopes, Generate token, copy it.
          2. Paste below → Exchange. 3. Copy the long-lived token into Render as needed.
          The result is shown once and never stored or logged.
        </p>
        {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
        <form onSubmit={runExchange} className="flex gap-2 items-end">
          <div className="flex-1">
            <Input label="Short-lived token" value={shortToken} onChange={(e) => setShortToken(e.target.value)} required />
          </div>
          <div className="mb-3">
            <Button type="submit" loading={exchange.isPending}>Exchange</Button>
          </div>
        </form>
        {result && (
          <div className="mt-3 text-sm bg-slate-50 border border-slate-200 rounded-lg p-4 font-mono break-all">
            <p><span className="text-slate-500">access_token:</span> <strong>{result.access_token}</strong></p>
            <p><span className="text-slate-500">expires_in:</span> <strong>{result.expires_in} sec (~{Math.round(result.expires_in / 86400)} days)</strong></p>
            <Button
              variant="secondary"
              className="mt-2"
              onClick={async () => { await navigator.clipboard.writeText(String(result.access_token)); setCopied(true); }}
            >
              {copied ? 'Copied!' : 'Copy token'}
            </Button>
          </div>
        )}
      </Card>
      <Card title="Still manual (needs your Facebook login)">
        <ul className="text-sm space-y-1 list-disc pl-5">
          <li>Graph API Explorer short-token generation</li>
          <li>Business Settings → System Users → permanent WhatsApp token</li>
          <li>App Review + Business Verification + Live mode switch</li>
          <li>Generate <code>META_TOKEN_KEY</code>: <code>node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"</code></li>
        </ul>
      </Card>
    </div>
  );
};

export default MetaSetupPage;

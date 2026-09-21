import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import { useGet, usePost } from '../hooks/useApi';
const MetaSetupPage = () => {
    const { data } = useGet('/admin/meta/status');
    const status = data?.data || {};
    const [shortToken, setShortToken] = useState('');
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [copied, setCopied] = useState(false);
    const exchange = usePost('/admin/meta/exchange');
    const checks = [
        ['META_APP_ID set', !!status.appIdSet],
        ['META_APP_SECRET set', !!status.appSecretSet],
        ['META_WEBHOOK_VERIFY_TOKEN set', !!status.verifyTokenSet],
        ['META_TOKEN_KEY set', !!status.tokenKeySet],
    ];
    const runExchange = (e) => {
        e.preventDefault();
        setError(null);
        setResult(null);
        setCopied(false);
        exchange.mutate({ shortToken }, {
            onSuccess: (res) => setResult(res?.data?.data),
            onError: (err) => setError(err?.response?.data?.error || 'Exchange failed'),
        });
    };
    return (_jsxs("div", { children: [_jsxs(Card, { title: "Platform Meta configuration", className: "mb-4", children: [_jsx("p", { className: "text-xs text-slate-500 mb-3", children: "Presence only \u2014 values are never returned by the API. Set them in Render \u2192 Environment." }), _jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-2 text-sm", children: checks.map(([label, ok]) => (_jsxs("p", { children: [ok ? '✅' : '❌', " ", label, " ", _jsxs("span", { className: "text-slate-400", children: ["(graph ", status.graphVersion || '…', ")"] })] }, label))) })] }), _jsxs(Card, { title: "Short token \u2192 long-lived token exchange", className: "mb-4", children: [_jsx("p", { className: "text-xs text-slate-500 mb-3", children: "1. Open Graph API Explorer, select your app, tick the scopes, Generate token, copy it. 2. Paste below \u2192 Exchange. 3. Copy the long-lived token into Render as needed. The result is shown once and never stored or logged." }), error && _jsx("p", { className: "text-red-500 text-sm mb-2", children: error }), _jsxs("form", { onSubmit: runExchange, className: "flex gap-2 items-end", children: [_jsx("div", { className: "flex-1", children: _jsx(Input, { label: "Short-lived token", value: shortToken, onChange: (e) => setShortToken(e.target.value), required: true }) }), _jsx("div", { className: "mb-3", children: _jsx(Button, { type: "submit", loading: exchange.isPending, children: "Exchange" }) })] }), result && (_jsxs("div", { className: "mt-3 text-sm bg-slate-50 border border-slate-200 rounded-lg p-4 font-mono break-all", children: [_jsxs("p", { children: [_jsx("span", { className: "text-slate-500", children: "access_token:" }), " ", _jsx("strong", { children: result.access_token })] }), _jsxs("p", { children: [_jsx("span", { className: "text-slate-500", children: "expires_in:" }), " ", _jsxs("strong", { children: [result.expires_in, " sec (~", Math.round(result.expires_in / 86400), " days)"] })] }), _jsx(Button, { variant: "secondary", className: "mt-2", onClick: async () => { await navigator.clipboard.writeText(String(result.access_token)); setCopied(true); }, children: copied ? 'Copied!' : 'Copy token' })] }))] }), _jsx(Card, { title: "Still manual (needs your Facebook login)", children: _jsxs("ul", { className: "text-sm space-y-1 list-disc pl-5", children: [_jsx("li", { children: "Graph API Explorer short-token generation" }), _jsx("li", { children: "Business Settings \u2192 System Users \u2192 permanent WhatsApp token" }), _jsx("li", { children: "App Review + Business Verification + Live mode switch" }), _jsxs("li", { children: ["Generate ", _jsx("code", { children: "META_TOKEN_KEY" }), ": ", _jsx("code", { children: "node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"" })] })] }) })] }));
};
export default MetaSetupPage;
//# sourceMappingURL=MetaSetupPage.js.map
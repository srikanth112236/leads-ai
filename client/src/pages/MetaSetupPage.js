import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import { useGet, usePost } from '../hooks/useApi';
const MetaSetupPage = () => {
    const { data } = useGet('/admin/meta/status');
    const status = data?.data || {};
    const { data: healthData, refetch: refetchHealth } = useGet('/admin/meta/health');
    const health = healthData?.data;
    const { data: companiesData } = useGet('/admin/meta/companies');
    const metaCompanies = companiesData?.data || [];
    const [testResult, setTestResult] = useState(null);
    const testPlatform = usePost('/admin/meta/test');
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
    return (_jsxs("div", { children: [_jsxs(Card, { title: "Platform Meta configuration", className: "mb-4", children: [_jsx("p", { className: "text-xs text-slate-500 mb-3", children: "Presence only \u2014 values are never returned by the API. Set them in Render \u2192 Environment." }), _jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-2 text-sm", children: checks.map(([label, ok]) => (_jsxs("p", { children: [ok ? '✅' : '❌', " ", label] }, label))) }), _jsxs("p", { className: "text-xs text-slate-400 mt-2", children: ["Graph API ", status.graphVersion || '…'] })] }), _jsx(Card, { title: "Platform health", className: "mb-4", children: !health ? (_jsx("p", { className: "text-sm text-slate-500", children: "Loading\u2026" })) : (_jsxs("div", { className: "space-y-3 text-sm", children: [_jsxs("p", { children: ["App: ", _jsx("strong", { children: health.platform.appConfigured ? 'Configured' : 'Missing credentials' }), " ", _jsxs("span", { className: "text-slate-400", children: ["(graph ", health.platform.graphVersion, ")"] })] }), _jsxs("p", { className: "font-mono text-xs break-all", children: ["Callback: ", health.platform.oauthCallbackUrl] }), _jsxs("p", { className: "font-mono text-xs break-all", children: ["Webhook: ", health.platform.webhookUrl] }), _jsxs("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-3", children: [_jsxs("div", { children: [_jsx("p", { className: "text-slate-500 text-xs", children: "Connected companies" }), _jsx("p", { className: "text-2xl font-extrabold", children: health.customers.connectedCompanies })] }), _jsxs("div", { children: [_jsx("p", { className: "text-slate-500 text-xs", children: "Active" }), _jsx("p", { className: "text-2xl font-extrabold text-green-600", children: health.customers.active })] }), _jsxs("div", { children: [_jsx("p", { className: "text-slate-500 text-xs", children: "Failed/expired" }), _jsx("p", { className: "text-2xl font-extrabold text-red-600", children: health.customers.failed })] }), _jsxs("div", { children: [_jsx("p", { className: "text-slate-500 text-xs", children: "Webhooks 24h (ok/fail)" }), _jsxs("p", { className: "text-2xl font-extrabold", children: [health.webhooks24h.processed, "/", health.webhooks24h.failed] })] })] }), _jsxs("div", { className: "flex gap-2 items-center", children: [_jsx(Button, { variant: "secondary", loading: testPlatform.isPending, onClick: () => testPlatform.mutate(undefined, {
                                        onSuccess: (r) => { setTestResult(r?.data?.data); refetchHealth(); },
                                        onError: (e) => setError(e?.response?.data?.error || 'Test failed'),
                                    }), children: "Test Configuration" }), testResult && (_jsxs("span", { className: "text-xs", children: ["Endpoint reachable: ", _jsx("strong", { children: testResult.endpointReachable ? 'Yes' : 'No' })] })), _jsx("a", { href: "https://developers.facebook.com/apps", target: "_blank", rel: "noreferrer", className: "text-sm text-blue-600 hover:underline ml-2", children: "Open Meta Developer \u2197" })] })] })) }), _jsx(Card, { title: "Companies", className: "mb-4", children: metaCompanies.length === 0 ? (_jsx("p", { className: "text-sm text-slate-500", children: "No companies yet" })) : (_jsxs("table", { className: "w-full", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b", children: [_jsx("th", { className: "text-left py-2", children: "Company" }), _jsx("th", { className: "text-left py-2", children: "Meta status" }), _jsx("th", { className: "text-left py-2", children: "Pages" }), _jsx("th", { className: "text-left py-2", children: "Forms" }), _jsx("th", { className: "text-left py-2", children: "Last error" }), _jsx("th", { className: "text-left py-2", children: "Last lead" })] }) }), _jsx("tbody", { children: metaCompanies.map((c) => (_jsxs("tr", { className: "border-b", children: [_jsx("td", { className: "py-2 font-semibold", children: c.name }), _jsx("td", { className: "py-2", children: c.status }), _jsx("td", { className: "py-2", children: c.pages }), _jsx("td", { className: "py-2", children: c.forms }), _jsx("td", { className: "py-2 text-xs text-red-600", children: c.lastError ? `${c.lastError.message || 'failed'} (${new Date(c.lastError.at).toLocaleString()})` : '—' }), _jsx("td", { className: "py-2 text-xs", children: c.lastLeadAt ? new Date(c.lastLeadAt).toLocaleString() : '—' })] }, c.companyId))) })] })) }), _jsxs(Card, { title: "Short token \u2192 long-lived token exchange", className: "mb-4", children: [_jsx("p", { className: "text-xs text-slate-500 mb-3", children: "1. Open Graph API Explorer, select your app, tick the scopes, Generate token, copy it. 2. Paste below \u2192 Exchange. 3. Copy the long-lived token into Render as needed. The result is shown once and never stored or logged." }), error && _jsx("p", { className: "text-red-500 text-sm mb-2", children: error }), _jsxs("form", { onSubmit: runExchange, className: "flex gap-2 items-end", children: [_jsx("div", { className: "flex-1", children: _jsx(Input, { label: "Short-lived token", value: shortToken, onChange: (e) => setShortToken(e.target.value), required: true }) }), _jsx("div", { className: "mb-3", children: _jsx(Button, { type: "submit", loading: exchange.isPending, children: "Exchange" }) })] }), result && (_jsxs("div", { className: "mt-3 text-sm bg-slate-50 border border-slate-200 rounded-lg p-4 font-mono break-all", children: [_jsxs("p", { children: [_jsx("span", { className: "text-slate-500", children: "access_token:" }), " ", _jsx("strong", { children: result.access_token })] }), _jsxs("p", { children: [_jsx("span", { className: "text-slate-500", children: "expires_in:" }), " ", _jsxs("strong", { children: [result.expires_in, " sec (~", Math.round(result.expires_in / 86400), " days)"] })] }), _jsx(Button, { variant: "secondary", className: "mt-2", onClick: async () => { await navigator.clipboard.writeText(String(result.access_token)); setCopied(true); }, children: copied ? 'Copied!' : 'Copy token' })] }))] }), _jsx(Card, { title: "Still manual (needs your Facebook login)", children: _jsxs("ul", { className: "text-sm space-y-1 list-disc pl-5", children: [_jsx("li", { children: "Graph API Explorer short-token generation" }), _jsx("li", { children: "Business Settings \u2192 System Users \u2192 permanent WhatsApp token" }), _jsx("li", { children: "App Review + Business Verification + Live mode switch" }), _jsxs("li", { children: ["Generate ", _jsx("code", { children: "META_TOKEN_KEY" }), ": ", _jsx("code", { children: "node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"" })] })] }) })] }));
};
export default MetaSetupPage;
//# sourceMappingURL=MetaSetupPage.js.map
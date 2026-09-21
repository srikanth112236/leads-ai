import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { Link, useSearchParams } from 'react-router-dom';
import Card from '../components/common/Card';
const IntegrationsConnectedPage = () => {
    const [params] = useSearchParams();
    const ok = params.get('ok') === '1';
    const error = params.get('error');
    return (_jsx("div", { className: "max-w-lg mx-auto", children: _jsx(Card, { title: ok ? 'Meta connected' : 'Connection failed', children: ok ? (_jsxs("div", { className: "space-y-3 text-sm", children: [_jsxs("p", { children: ["Your Facebook Pages were imported (", params.get('pages') || 0, " found)."] }), _jsx("p", { className: "text-slate-500", children: "Assign each Page to a branch on the Integrations page to start receiving leads." }), _jsx(Link, { to: "/integrations", className: "inline-block px-4 py-2 rounded-lg bg-blue-600 text-white font-medium", children: "Go to Integrations" })] })) : (_jsxs("div", { className: "space-y-3 text-sm", children: [_jsxs("p", { className: "text-red-600", children: ["Could not complete the connection (", error || 'unknown error', "). Please try again."] }), _jsx(Link, { to: "/integrations", className: "inline-block px-4 py-2 rounded-lg bg-blue-600 text-white font-medium", children: "Back to Integrations" })] })) }) }));
};
export default IntegrationsConnectedPage;
//# sourceMappingURL=IntegrationsConnectedPage.js.map
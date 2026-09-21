import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import Card from '../components/common/Card';
import { useAuth } from '../context/AuthContext';
const SettingsPage = () => {
    const { user } = useAuth();
    return (_jsx("div", { children: _jsx(Card, { title: "Profile", children: _jsxs("div", { className: "space-y-3", children: [_jsxs("p", { children: [_jsx("strong", { children: "Email:" }), " ", user?.email] }), _jsxs("p", { children: [_jsx("strong", { children: "Role:" }), " ", user?.role] }), _jsxs("p", { children: [_jsx("strong", { children: "Company:" }), " ", user?.companyId || 'N/A'] })] }) }) }));
};
export default SettingsPage;
//# sourceMappingURL=SettingsPage.js.map
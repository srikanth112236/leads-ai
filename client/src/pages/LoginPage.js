import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import Input from '../components/common/Input';
import Button from '../components/common/Button';
function friendlyError(error) {
    const data = error?.response?.data;
    if (data?.error)
        return `${data.error}${data?.code ? ` (${data.code})` : ''}`;
    if (error?.code === 'ERR_NETWORK' || error?.message === 'Network Error') {
        return 'Cannot reach the server. Is the backend running on :3000?';
    }
    return error?.message || 'Login failed. Please try again.';
}
const LoginPage = () => {
    const { login } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            await login(email, password);
        }
        catch (err) {
            setError(friendlyError(err));
        }
        finally {
            setLoading(false);
        }
    };
    return (_jsx("div", { className: "min-h-screen flex items-center justify-center bg-gray-50", children: _jsx("div", { className: "w-full max-w-md", children: _jsxs("div", { className: "bg-white rounded-lg shadow p-8", children: [_jsx("h2", { className: "text-2xl font-bold mb-6 text-center", children: "Lead CRM" }), error && (_jsx("div", { className: "mb-4 px-3 py-2 bg-red-50 border border-red-300 text-red-700 rounded-lg text-sm", children: error })), _jsxs("form", { onSubmit: handleSubmit, children: [_jsx(Input, { label: "Email", type: "email", value: email, onChange: (e) => setEmail(e.target.value), required: true }), _jsx(Input, { label: "Password", type: "password", value: password, onChange: (e) => setPassword(e.target.value), required: true }), _jsx(Button, { type: "submit", loading: loading, className: "w-full", children: "Sign In" })] })] }) }) }));
};
export default LoginPage;
//# sourceMappingURL=LoginPage.js.map
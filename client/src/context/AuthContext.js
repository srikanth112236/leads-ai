import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
const AuthContext = createContext({
    user: null,
    token: null,
    isAuthenticated: false,
    login: async () => { },
    register: async () => { },
    logout: () => { },
});
export const useAuth = () => useContext(AuthContext);
const API_BASE = import.meta.env?.VITE_API_URL || '/api';
export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('token'));
    const navigate = useNavigate();
    useEffect(() => {
        if (token) {
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            axios.get(`${API_BASE}/auth/me`).then((res) => setUser(res.data.data)).catch(() => logout());
        }
    }, [token]);
    const login = async (email, password) => {
        const res = await axios.post(`${API_BASE}/auth/login`, { email, password });
        // Accept both current ({data:{accessToken,user}}) and legacy ({data:{user},accessToken}) shapes.
        const payload = res.data?.data ?? {};
        const accessToken = payload.accessToken ?? res.data?.accessToken;
        const loggedInUser = payload.user;
        if (!accessToken || !loggedInUser) {
            throw new Error(res.data?.error || 'Unexpected login response from server');
        }
        setToken(accessToken);
        localStorage.setItem('token', accessToken);
        setUser(loggedInUser);
        navigate('/dashboard');
    };
    const register = async (data) => {
        const res = await axios.post(`${API_BASE}/auth/register`, data);
        const payload = res.data?.data ?? {};
        const accessToken = payload.accessToken ?? res.data?.accessToken;
        const newUser = payload.user;
        if (!accessToken || !newUser) {
            throw new Error(res.data?.error || 'Unexpected register response from server');
        }
        setToken(accessToken);
        localStorage.setItem('token', accessToken);
        setUser(newUser);
        navigate('/dashboard');
    };
    const logout = () => {
        setToken(null);
        setUser(null);
        localStorage.removeItem('token');
        delete axios.defaults.headers.common['Authorization'];
        navigate('/login');
    };
    return (_jsx(AuthContext.Provider, { value: { user, token, isAuthenticated: !!token, login, register, logout }, children: children }));
};
//# sourceMappingURL=AuthContext.js.map
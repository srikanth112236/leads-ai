import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  companyId?: string;
  branchId?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: any) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isAuthenticated: false,
  login: async () => {},
  register: async () => {},
  logout: () => {},
});

export const useAuth = () => useContext(AuthContext);

const API_BASE = (import.meta as any).env?.VITE_API_URL || '/api';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const navigate = useNavigate();

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      axios.get(`${API_BASE}/auth/me`).then((res) => setUser(res.data.data)).catch(() => logout());
    }
  }, [token]);

  const login = async (email: string, password: string) => {
    const res = await axios.post(`${API_BASE}/auth/login`, { email, password });
    const { accessToken, user: loggedInUser } = res.data.data;
    setToken(accessToken);
    localStorage.setItem('token', accessToken);
    setUser(loggedInUser);
    navigate('/dashboard');
  };

  const register = async (data: any) => {
    const res = await axios.post(`${API_BASE}/auth/register`, data);
    const { accessToken, user: newUser } = res.data.data;
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

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated: !!token, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

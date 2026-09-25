import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { onSessionEvent } from '../services/session';
import { getDeviceId, getDeviceName } from '../services/device';

export interface BranchOption {
  _id: string;
  name: string;
  branchCode?: string;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  roleId?: string;
  permissions?: string[];
  companyId?: string;
  branchId?: string;
  allowedBranchIds?: string[];
  branches?: BranchOption[];
  mustChangePassword?: boolean;
  accessExpiresAt?: string | null;
  accessDaysLeft?: number | null;
}

export interface PendingApproval {
  sessionId: string;
  expiresIn: number;
  maxDevices: number;
  devices: Array<{ deviceId: string; deviceName?: string; ip?: string; lastSeenAt?: string }>;
}

export interface LoginResult {
  mustChangePassword: boolean;
  passwordRules?: { minPasswordLength: number; requireSpecialChar: boolean; requireNumber: boolean };
  user: User;
  accessToken: string;
  approvalRequired?: boolean;
  approval?: PendingApproval;
}

export interface SessionNotice {
  kind: 'expired' | 'logged-out' | 'access-updated';
  reason?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  forcePasswordChange: boolean;
  sessionNotice: SessionNotice | null;
  dismissSessionNotice: () => void;
  activeBranchId: string | null;
  branches: BranchOption[];
  permissions: string[];
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  setActiveBranchId: (branchId: string | null) => void;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<LoginResult>;
  register: (data: any) => Promise<void>;
  logout: (reason?: string) => void;
  /** Adopt tokens issued out-of-band (device-approval poll completion). */
  adoptSession: (data: any, rememberMe?: boolean) => LoginResult;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  activeBranchId: null,
  branches: [],
  permissions: [],
  hasPermission: () => false,
  hasAnyPermission: () => false,
  forcePasswordChange: false,
  sessionNotice: null,
  dismissSessionNotice: () => {},
  setActiveBranchId: () => {},
  login: async () => ({ mustChangePassword: false, user: null as any, accessToken: '' }),
  register: async () => {},
  logout: () => {},
  adoptSession: () => ({ mustChangePassword: false, user: null as any, accessToken: '' }),
});

export const useAuth = () => useContext(AuthContext);

const API_BASE = (import.meta as any).env?.VITE_API_URL || '/api';

function getInitialUser(): User | null {
  try {
    const raw = localStorage.getItem('crm_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const initialCachedUser = getInitialUser();
  const [user, setUser] = useState<User | null>(initialCachedUser);
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(token && !initialCachedUser));
  const [activeBranchId, setActiveBranchIdState] = useState<string | null>(localStorage.getItem('activeBranchId'));
  const [forcePasswordChange, setForcePasswordChange] = useState(false);
  const [sessionNotice, setSessionNotice] = useState<SessionNotice | null>(null);
  const navigate = useNavigate();

  const clearCredentials = () => {
    setToken(null);
    setUser(null);
    setForcePasswordChange(false);
    setActiveBranchIdState(null);
    localStorage.removeItem('token');
    localStorage.removeItem('crm_user');
    localStorage.removeItem('activeBranchId');
    localStorage.removeItem('refresh_token');
    sessionStorage.removeItem('refresh_token');
    sessionStorage.removeItem('scopedCompanyId');
    delete axios.defaults.headers.common['Authorization'];
    delete axios.defaults.headers.common['x-branch-id'];
  };

  // Session-expiry events raised from API interceptors (outside React).
  useEffect(() => {
    return onSessionEvent((kind) => {
      if (kind === 'expired' || kind === 'access-updated') {
        clearCredentials();
        setSessionNotice({ kind });
      }
    });
  }, []);

  // Multi-tab sync: if another tab logs out (token removed) while this tab
  // still thinks it is logged in, show the same 5-second expired popup here.
  const tokenRef = React.useRef<string | null>(null);
  tokenRef.current = token;
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'token' && e.newValue === null && tokenRef.current) {
        clearCredentials();
        setSessionNotice({ kind: 'expired' });
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setActiveBranchId = (branchId: string | null) => {
    if (branchId && branchId !== 'all') {
      localStorage.setItem('activeBranchId', branchId);
      axios.defaults.headers.common['x-branch-id'] = branchId;
      setActiveBranchIdState(branchId);
    } else {
      localStorage.removeItem('activeBranchId');
      axios.defaults.headers.common['x-branch-id'] = 'all';
      setActiveBranchIdState(null);
    }
  };

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      const savedBranch = localStorage.getItem('activeBranchId');
      axios.defaults.headers.common['x-branch-id'] = savedBranch || 'all';
      axios
        .get(`${API_BASE}/auth/me`)
        .then((res) => {
          const u = res.data.data;
          setUser(u);
          localStorage.setItem('crm_user', JSON.stringify(u));
          if (!savedBranch && u.branchId) {
            setActiveBranchId(u.branchId);
          }
        })
        .catch(() => {
          clearCredentials();
          setSessionNotice({ kind: 'expired' });
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setIsLoading(false);
    }
  }, [token]);

  const login = async (email: string, password: string, rememberMe = true): Promise<LoginResult> => {
    let res;
    try {
      res = await axios.post(`${API_BASE}/auth/login`, {
        email,
        password,
        deviceId: getDeviceId(),
        deviceName: getDeviceName(),
      });
    } catch (err: any) {
      const data = err?.response?.data;
      if (err?.response?.status === 403 && data?.code === 'DEVICE_APPROVAL_REQUIRED') {
        // Parked: an active device must allow this browser first.
        return {
          mustChangePassword: false,
          user: null as any,
          accessToken: '',
          approvalRequired: true,
          approval: data?.data,
        };
      }
      if (err?.response?.status === 403 && data?.code === 'DEVICE_CAP_REACHED') {
        // Over the device cap: show the message + admin contacts first.
        return {
          mustChangePassword: false,
          user: null as any,
          accessToken: '',
          capReached: true,
          capInfo: {
            message: data?.error || 'This account is already signed in on the maximum devices.',
            tier: data?.data?.tier,
            deviceKind: data?.data?.deviceKind,
            maxDevices: data?.data?.maxDevices,
            approvers: data?.data?.approvers || [],
            devices: data?.data?.devices || [],
          },
        } as any;
      }
      throw err;
    }
    const payload = res.data?.data ?? {};
    const accessToken = payload.accessToken ?? (res.data as any)?.accessToken;
    const refreshToken = payload.refreshToken;
    const loggedInUser = payload.user;
    if (!accessToken || !loggedInUser) {
      throw new Error(res.data?.error || 'Unexpected login response from server');
    }
    const mustChangePassword = payload.mustChangePassword === true;
    const storage = rememberMe ? localStorage : sessionStorage;
    // Refresh token lifetime follows "remember me"; access token stays short-lived.
    if (refreshToken) {
      localStorage.removeItem('refresh_token');
      sessionStorage.removeItem('refresh_token');
      storage.setItem('refresh_token', refreshToken);
    }
    if (mustChangePassword) {
      // Forced-change session: keep tokens in memory only, do not enter the app.
      setToken(accessToken);
      setUser({ ...loggedInUser, mustChangePassword: true });
      setForcePasswordChange(true);
      return { mustChangePassword: true, passwordRules: payload.passwordRules, user: loggedInUser, accessToken };
    }
    setForcePasswordChange(false);
    setToken(accessToken);
    localStorage.setItem('token', accessToken);
    setUser(loggedInUser);
    localStorage.setItem('crm_user', JSON.stringify(loggedInUser));
    if (loggedInUser.branchId) {
      setActiveBranchId(loggedInUser.branchId);
    }
    navigate('/dashboard');
    return { mustChangePassword: false, passwordRules: payload.passwordRules, user: loggedInUser, accessToken };
  };

  const adoptSession = (data: any, rememberMe = true): LoginResult => {
    const accessToken = data.accessToken;
    const refreshToken = data.refreshToken;
    const loggedInUser = data.user;
    if (!accessToken || !loggedInUser) throw new Error('Invalid session payload');
    const mustChangePassword = data.mustChangePassword === true;
    const storage = rememberMe ? localStorage : sessionStorage;
    if (refreshToken) {
      localStorage.removeItem('refresh_token');
      sessionStorage.removeItem('refresh_token');
      storage.setItem('refresh_token', refreshToken);
    }
    if (mustChangePassword) {
      setToken(accessToken);
      setUser({ ...loggedInUser, mustChangePassword: true });
      setForcePasswordChange(true);
      return { mustChangePassword: true, passwordRules: data.passwordRules, user: loggedInUser, accessToken };
    }
    setForcePasswordChange(false);
    setToken(accessToken);
    localStorage.setItem('token', accessToken);
    setUser(loggedInUser);
    localStorage.setItem('crm_user', JSON.stringify(loggedInUser));
    if (loggedInUser.branchId) setActiveBranchId(loggedInUser.branchId);
    navigate('/dashboard');
    return { mustChangePassword: false, passwordRules: data.passwordRules, user: loggedInUser, accessToken };
  };

  const register = async (data: any) => {
    const res = await axios.post(`${API_BASE}/auth/register`, {
      ...data,
      deviceId: getDeviceId(),
      deviceName: getDeviceName(),
    });
    const payload = res.data?.data ?? {};
    const accessToken = payload.accessToken ?? (res.data as any)?.accessToken;
    const newUser = payload.user;
    if (!accessToken || !newUser) {
      throw new Error(res.data?.error || 'Unexpected register response from server');
    }
    setToken(accessToken);
    localStorage.setItem('token', accessToken);
    setUser(newUser);
    localStorage.setItem('crm_user', JSON.stringify(newUser));
    navigate('/dashboard');
  };

  // Logout shows a 5-second notice modal first (SessionModal), which then
  // routes to /login. Credentials are cleared immediately for safety.
  const logout = (reason?: string) => {
    clearCredentials();
    setSessionNotice({ kind: 'logged-out', reason });
  };

  const dismissSessionNotice = () => {
    setSessionNotice(null);
    navigate('/login');
  };

  const branches = user?.branches || [];
  const permissions: string[] = user?.permissions || [];

  const hasPermission = (permission: string): boolean => {
    if (!user) return false;
    const roleUpper = String(user.role).toUpperCase();
    if (roleUpper === 'SUPER_ADMIN') return true;
    if (permissions.includes('*')) return true;
    if (permissions.includes(permission)) return true;
    const [mod] = permission.split(':');
    if (mod && permissions.includes(`${mod}:*`)) return true;
    return false;
  };

  const hasAnyPermission = (targetPermissions: string[]): boolean => {
    return targetPermissions.some((p) => hasPermission(p));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !forcePasswordChange,
        isLoading,
        forcePasswordChange,
        activeBranchId,
        branches,
        permissions,
        hasPermission,
        hasAnyPermission,
        setActiveBranchId,
        login,
        register,
        logout,
        adoptSession,
        sessionNotice,
        dismissSessionNotice,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

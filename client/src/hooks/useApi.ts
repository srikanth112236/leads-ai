import { useQuery, useMutation, UseQueryResult, UseMutationResult } from '@tanstack/react-query';
import axios from 'axios';
import { emitSessionEvent, isAuthPath, refreshAccessToken } from '../services/session';

const API_BASE = (import.meta as any).env?.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const activeBranchId = localStorage.getItem('activeBranchId');
  if (activeBranchId) {
    config.headers['x-branch-id'] = activeBranchId;
  } else {
    config.headers['x-branch-id'] = 'all';
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error?.config as any;
    const url: string | undefined = original?.url;
    if (error?.response?.status === 401 && !isAuthPath(url) && !original?._retried) {
      // Access was updated by an admin (extension): force a fresh login.
      if (error?.response?.data?.code === 'ACCESS_UPDATED') {
        emitSessionEvent('access-updated');
        return Promise.reject(error);
      }
      original._retried = true;
      try {
        const accessToken = await refreshAccessToken();
        if (accessToken) {
          original.headers = { ...(original.headers || {}), Authorization: `Bearer ${accessToken}` };
          return api(original);
        }
      } catch { /* fall through to expiry */ }
      // Refresh token missing/invalid too – the session is truly over.
      emitSessionEvent('expired');
    }
    return Promise.reject(error);
  }
);

export function useGet<T>(url: string): UseQueryResult<T> {
  const branchKey = localStorage.getItem('activeBranchId') || 'all';
  return useQuery<T>({
    queryKey: [url, branchKey],
    queryFn: () => api.get(url).then((r) => r.data),
  });
}

export function usePost<TData = unknown>(url: string): UseMutationResult<any, Error, any> {
  return useMutation({ mutationFn: (data: any) => api.post<TData>(url, data) }) as UseMutationResult<any, Error, any>;
}

export function usePut<TData = unknown>(url: string): UseMutationResult<any, Error, any> {
  return useMutation({ mutationFn: (data: any) => api.put<TData>(url, data) }) as UseMutationResult<any, Error, any>;
}

export function useDelete(url: string): UseMutationResult<any, Error, void> {
  return useMutation({ mutationFn: () => api.delete(url) }) as UseMutationResult<any, Error, void>;
}

export { api };

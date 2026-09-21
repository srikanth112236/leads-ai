import { useQuery, useMutation, UseQueryResult, UseMutationResult } from '@tanstack/react-query';
import axios from 'axios';

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
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export function useGet<T>(url: string): UseQueryResult<T> {
  return useQuery<T>({ queryKey: [url], queryFn: () => api.get(url).then((r) => r.data) });
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

import { useQuery, useMutation } from '@tanstack/react-query';
import axios from 'axios';
const API_BASE = import.meta.env?.VITE_API_URL || '/api';
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
api.interceptors.response.use((response) => response, (error) => {
    if (error.response?.status === 401) {
        localStorage.removeItem('token');
        window.location.href = '/login';
    }
    return Promise.reject(error);
});
export function useGet(url) {
    return useQuery({ queryKey: [url], queryFn: () => api.get(url).then((r) => r.data) });
}
export function usePost(url) {
    return useMutation({ mutationFn: (data) => api.post(url, data) });
}
export function usePut(url) {
    return useMutation({ mutationFn: (data) => api.put(url, data) });
}
export function useDelete(url) {
    return useMutation({ mutationFn: () => api.delete(url) });
}
export { api };
//# sourceMappingURL=useApi.js.map
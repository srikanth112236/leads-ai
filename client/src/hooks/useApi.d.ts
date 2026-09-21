import { UseQueryResult, UseMutationResult } from '@tanstack/react-query';
declare const api: import("axios").AxiosInstance;
export declare function useGet<T>(url: string): UseQueryResult<T>;
export declare function usePost<TData = unknown>(url: string): UseMutationResult<any, Error, any>;
export declare function usePut<TData = unknown>(url: string): UseMutationResult<any, Error, any>;
export declare function useDelete(url: string): UseMutationResult<any, Error, void>;
export { api };

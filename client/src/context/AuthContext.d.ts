import React from 'react';
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
}
interface AuthContextType {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    activeBranchId: string | null;
    branches: BranchOption[];
    permissions: string[];
    hasPermission: (permission: string) => boolean;
    hasAnyPermission: (permissions: string[]) => boolean;
    setActiveBranchId: (branchId: string | null) => void;
    login: (email: string, password: string) => Promise<void>;
    register: (data: any) => Promise<void>;
    logout: () => void;
}
export declare const useAuth: () => AuthContextType;
export declare const AuthProvider: React.FC<{
    children: React.ReactNode;
}>;
export {};

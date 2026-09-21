import React from 'react';
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
export declare const useAuth: () => AuthContextType;
export declare const AuthProvider: React.FC<{
    children: React.ReactNode;
}>;
export {};

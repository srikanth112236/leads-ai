import React from 'react';
export type ToastType = 'success' | 'error' | 'info' | 'warning';
export interface ToastMessage {
    id: string;
    type: ToastType;
    message: string;
    description?: string;
}
export declare const useToast: () => {
    success: (message: string, description?: string) => void;
    error: (message: string, description?: string) => void;
    info: (message: string, description?: string) => void;
    warning: (message: string, description?: string) => void;
};
export declare const ToastProvider: React.FC<{
    children: React.ReactNode;
}>;

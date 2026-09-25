import React from 'react';
interface CanProps {
    permission?: string;
    any?: string[];
    all?: string[];
    role?: string | string[];
    fallback?: React.ReactNode;
    children: React.ReactNode;
}
export declare const Can: React.FC<CanProps>;
export default Can;

import React from 'react';
export interface ScopeItem {
    key: string;
    label: string;
    description: string;
}
export interface ScopeGroup {
    group: string;
    description: string;
    scopes: ScopeItem[];
}
export declare const META_SCOPE_GROUPS: ScopeGroup[];
export declare const ALL_SCOPE_KEYS: string[];
interface MetaPermissionModalProps {
    isOpen: boolean;
    onClose: () => void;
    integration: any;
    onUpdated: () => void;
}
declare const MetaPermissionModal: React.FC<MetaPermissionModalProps>;
export default MetaPermissionModal;

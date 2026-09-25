import React from 'react';
export interface ActionMenuItem {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
    danger?: boolean;
    disabled?: boolean;
    tooltip?: string;
}
interface ActionMenuProps {
    items: ActionMenuItem[];
    align?: 'left' | 'right';
    placement?: 'auto' | 'top' | 'bottom';
}
declare const ActionMenu: React.FC<ActionMenuProps>;
export default ActionMenu;

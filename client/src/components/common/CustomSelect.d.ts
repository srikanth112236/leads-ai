import React from 'react';
export interface SelectOption {
    value: string;
    label: string;
    subLabel?: string;
    icon?: React.ReactNode;
    badge?: string;
    badgeColor?: string;
}
export interface CustomSelectProps {
    label?: string;
    options: SelectOption[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    error?: string;
    className?: string;
    searchable?: boolean;
    compact?: boolean;
    required?: boolean;
}
declare const CustomSelect: React.FC<CustomSelectProps>;
export default CustomSelect;

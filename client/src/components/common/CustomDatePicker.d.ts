import React from 'react';
export interface CustomDatePickerProps {
    label?: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    error?: string;
    className?: string;
    compact?: boolean;
    minYear?: number;
    maxYear?: number;
}
declare const CustomDatePicker: React.FC<CustomDatePickerProps>;
export default CustomDatePicker;

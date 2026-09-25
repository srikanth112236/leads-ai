import React from 'react';
export type FormFieldType = 'text' | 'email' | 'phone' | 'number' | 'date' | 'select' | 'radio' | 'checkbox' | 'textarea';
export interface FormFieldItem {
    id: string;
    label: string;
    type: FormFieldType;
    placeholder?: string;
    required: boolean;
    options?: string[];
    defaultValue?: string;
    order?: number;
}
interface WebFormBuilderModalProps {
    isOpen: boolean;
    onClose: () => void;
    formToEdit?: any | null;
    branches: any[];
    onSaved: () => void;
}
export declare const WebFormBuilderModal: React.FC<WebFormBuilderModalProps>;
export default WebFormBuilderModal;

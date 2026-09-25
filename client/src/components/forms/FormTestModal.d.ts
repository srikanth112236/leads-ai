import React from 'react';
interface FormTestModalProps {
    isOpen: boolean;
    onClose: () => void;
    form: any | null;
}
export declare const FormTestModal: React.FC<FormTestModalProps>;
export default FormTestModal;

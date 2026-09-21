import React from 'react';
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
}
declare const Input: React.FC<InputProps>;
export default Input;

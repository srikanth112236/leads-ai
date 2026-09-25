import React from 'react';
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger';
    loading?: boolean;
    size?: 'sm' | 'md';
}
declare const Button: React.FC<ButtonProps>;
export default Button;

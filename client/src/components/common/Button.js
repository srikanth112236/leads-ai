import { jsx as _jsx } from "react/jsx-runtime";
const Button = ({ children, variant = 'primary', loading, className = '', ...props }) => {
    const base = 'px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50';
    const variants = {
        primary: 'bg-blue-600 text-white hover:bg-blue-700',
        secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300',
        danger: 'bg-red-600 text-white hover:bg-red-700',
    };
    return (_jsx("button", { className: `${base} ${variants[variant]} ${className}`, disabled: loading, ...props, children: loading ? 'Loading...' : children }));
};
export default Button;
//# sourceMappingURL=Button.js.map
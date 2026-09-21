import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const Input = ({ label, error, className = '', ...props }) => {
    return (_jsxs("div", { className: "mb-3", children: [label && _jsx("label", { className: "block text-sm font-medium text-gray-700 mb-1", children: label }), _jsx("input", { className: `w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${error ? 'border-red-500' : 'border-gray-300'} ${className}`, ...props }), error && _jsx("p", { className: "text-red-500 text-sm mt-1", children: error })] }));
};
export default Input;
//# sourceMappingURL=Input.js.map
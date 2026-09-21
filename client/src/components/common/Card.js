import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const Card = ({ children, className = '', title }) => {
    return (_jsxs("div", { className: `bg-white rounded-xl border border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.05)] p-5 ${className}`, children: [title && _jsx("h3", { className: "text-sm font-extrabold text-slate-900 mb-3", children: title }), children] }));
};
export default Card;
//# sourceMappingURL=Card.js.map
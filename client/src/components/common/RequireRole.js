import { jsx as _jsx } from "react/jsx-runtime";
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
const RequireRole = ({ roles, children }) => {
    const { user } = useAuth();
    if (!user || !roles.includes(user.role)) {
        return _jsx(Navigate, { to: "/dashboard", replace: true });
    }
    return children;
};
export default RequireRole;
//# sourceMappingURL=RequireRole.js.map
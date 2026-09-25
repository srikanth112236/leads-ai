import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface RequireRoleProps {
  roles: string[];
  anyPermissions?: string[];
  children: React.ReactElement;
}

const RequireRole: React.FC<RequireRoleProps> = ({ roles, anyPermissions, children }) => {
  const { user, isLoading, hasAnyPermission } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/dashboard" replace />;
  }

  const normalizedUserRole = String(user.role || '').toUpperCase();
  if (normalizedUserRole === 'SUPER_ADMIN') {
    return children;
  }

  const allowedRoles = (roles || []).map((r) => String(r).toUpperCase());
  if (allowedRoles.includes(normalizedUserRole)) {
    return children;
  }

  // RBAC fallback: custom roles store a lowercase slug in `user.role`,
  // so grant access when the user holds any of the required permissions.
  if (anyPermissions && anyPermissions.length > 0 && hasAnyPermission(anyPermissions)) {
    return children;
  }

  return <Navigate to="/dashboard" replace />;
};

export default RequireRole;

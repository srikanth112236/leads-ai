import React from 'react';
import { useAuth } from '../../context/AuthContext';

interface CanProps {
  permission?: string;
  any?: string[];
  all?: string[];
  role?: string | string[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export const Can: React.FC<CanProps> = ({
  permission,
  any: anyPerms,
  all: allPerms,
  role,
  fallback = null,
  children,
}) => {
  const { user, hasPermission, hasAnyPermission } = useAuth();

  if (!user) return <>{fallback}</>;

  if (role) {
    const roles = Array.isArray(role) ? role : [role];
    const normalizedUserRole = user.role.toUpperCase();
    const hasRole = roles.map((r) => r.toUpperCase()).includes(normalizedUserRole);
    if (!hasRole && normalizedUserRole !== 'SUPER_ADMIN') {
      return <>{fallback}</>;
    }
  }

  if (permission && !hasPermission(permission)) {
    return <>{fallback}</>;
  }

  if (anyPerms && !hasAnyPermission(anyPerms)) {
    return <>{fallback}</>;
  }

  if (allPerms && !allPerms.every((p) => hasPermission(p))) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};

export default Can;

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface RequireRoleProps {
  roles: string[];
  children: React.ReactElement;
}

const RequireRole: React.FC<RequireRoleProps> = ({ roles, children }) => {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
};

export default RequireRole;

import React from 'react';
interface RequireRoleProps {
    roles: string[];
    anyPermissions?: string[];
    children: React.ReactElement;
}
declare const RequireRole: React.FC<RequireRoleProps>;
export default RequireRole;

import React from 'react';
import RoleDrawer, {
  RoleDrawerProps,
  PermissionItem,
  RoleItem,
} from './RoleDrawer';

export { RoleDrawer };
export type { RoleDrawerProps, PermissionItem, RoleItem };

export interface RoleDraft {
  name: string;
  description: string;
  permissions: string[];
}

export interface RoleEditorProps {
  initialRole: { name: string; description?: string; permissions: string[] } | null;
  allPermissions: PermissionItem[];
  modulesList: string[];
  moduleLabels: Record<string, { label: string; icon: string; description: string }>;
  saving: boolean;
  onSave: (draft: RoleDraft) => void;
  onCancel: () => void;
  onError: (title: string, message?: string) => void;
}

/**
 * Backward compatibility wrapper for RoleDrawer
 */
export const RoleEditor: React.FC<RoleEditorProps> = ({
  initialRole,
  allPermissions,
  modulesList,
  moduleLabels,
  saving,
  onSave,
  onCancel,
  onError,
}) => {
  const role: RoleItem | null = initialRole
    ? {
        _id: 'editor-temp-id',
        name: initialRole.name,
        slug: initialRole.name.toLowerCase().replace(/\s+/g, '_'),
        description: initialRole.description || '',
        permissions: initialRole.permissions || [],
        isSystem: false,
        rank: 50,
        isActive: true,
      }
    : null;

  return (
    <RoleDrawer
      isOpen={true}
      mode={initialRole ? 'edit' : 'create'}
      role={role}
      allPermissions={allPermissions}
      modulesList={modulesList}
      moduleLabels={moduleLabels}
      saving={saving}
      onSave={onSave}
      onClose={onCancel}
      onError={(msg, desc) => onError(msg, desc || '')}
    />
  );
};

export default RoleEditor;

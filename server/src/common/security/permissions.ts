export interface PermissionDefinition {
  key: string;
  name: string;
  module: string;
  description: string;
}

export const PERMISSION_MODULES = [
  'leads',
  'branches',
  'users',
  'campaigns',
  'integrations',
  'roles',
  'audit_settings',
] as const;

export type PermissionModule = typeof PERMISSION_MODULES[number];

export const SYSTEM_PERMISSIONS: PermissionDefinition[] = [
  // --- Leads Module ---
  {
    key: 'leads:read',
    name: 'View Leads',
    module: 'leads',
    description: 'View leads, search filters, and lead details within assigned branch scope',
  },
  {
    key: 'leads:create',
    name: 'Create Leads',
    module: 'leads',
    description: 'Create manual leads or submit lead forms',
  },
  {
    key: 'leads:update',
    name: 'Update Leads',
    module: 'leads',
    description: 'Edit lead contact information, status, priority, and follow-ups',
  },
  {
    key: 'leads:delete',
    name: 'Delete Leads',
    module: 'leads',
    description: 'Permanently remove leads from CRM',
  },
  {
    key: 'leads:assign',
    name: 'Assign Leads',
    module: 'leads',
    description: 'Reassign leads to sales agents, round-robin, or across branches',
  },
  {
    key: 'leads:export',
    name: 'Export Leads',
    module: 'leads',
    description: 'Download CSV or spreadsheet exports of lead records',
  },

  // --- Branches Module ---
  {
    key: 'branches:read',
    name: 'View Branches',
    module: 'branches',
    description: 'View branch details, performance summaries, and regional offices',
  },
  {
    key: 'branches:create',
    name: 'Create Branches',
    module: 'branches',
    description: 'Create new branch offices and regional hubs (Admin only)',
  },
  {
    key: 'branches:update',
    name: 'Update Branches',
    module: 'branches',
    description: 'Edit branch name, address, timezone, and operational parameters',
  },
  {
    key: 'branches:delete',
    name: 'Delete Branches',
    module: 'branches',
    description: 'Deactivate or remove branch offices from the company',
  },
  {
    key: 'branches:team_manage',
    name: 'Manage Branch Team',
    module: 'branches',
    description: 'Add or assign team members to branch locations',
  },

  // --- Users & Team Module ---
  {
    key: 'users:read',
    name: 'View Team Members',
    module: 'users',
    description: 'View user profiles, contact info, and assigned branch memberships',
  },
  {
    key: 'users:create',
    name: 'Create Users',
    module: 'users',
    description: 'Provision new employee user accounts and send invites',
  },
  {
    key: 'users:update',
    name: 'Update Users',
    module: 'users',
    description: 'Modify user profiles, names, phone numbers, and branch assignments',
  },
  {
    key: 'users:delete',
    name: 'Deactivate Users',
    module: 'users',
    description: 'Deactivate user accounts and revoke access tokens',
  },
  {
    key: 'logins:approve',
    name: 'Approve Device Logins',
    module: 'users',
    description: 'Review and approve or deny new device login requests, manage trusted devices, and extend account access',
  },
  {
    key: 'users:roles_assign',
    name: 'Assign Roles',
    module: 'users',
    description: 'Assign dynamic roles and permission templates to team members',
  },

  // --- Meta & Marketing Campaigns Module ---
  {
    key: 'campaigns:read',
    name: 'View Ad Campaigns',
    module: 'campaigns',
    description: 'View Meta ad accounts, campaigns, ad sets, and creative previews',
  },
  {
    key: 'campaigns:assign',
    name: 'Assign Campaigns',
    module: 'campaigns',
    description: 'Route Meta ad campaigns to specific branches for lead capture',
  },
  {
    key: 'campaigns:spend_read',
    name: 'View Branch Spend',
    module: 'campaigns',
    description: 'View branch-aggregated ad spend analytics and performance',
  },
  {
    key: 'meta:manage',
    name: 'Manage Meta Portfolios',
    module: 'campaigns',
    description: 'Connect Meta OAuth, sync ad accounts, and manage integration tokens',
  },

  // --- Integrations & Webhooks Module ---
  {
    key: 'integrations:read',
    name: 'View Integrations',
    module: 'integrations',
    description: 'View connected external platforms, website forms, and channels',
  },
  {
    key: 'integrations:manage',
    name: 'Manage Integrations',
    module: 'integrations',
    description: 'Create and configure website lead forms, WhatsApp, and API credentials',
  },
  {
    key: 'webhooks:manage',
    name: 'Manage Webhooks',
    module: 'integrations',
    description: 'Inspect webhook delivery logs, retry failed events, and manage webhooks',
  },

  // --- Roles & RBAC Module (Admin Only) ---
  {
    key: 'roles:read',
    name: 'View Roles & Permissions',
    module: 'roles',
    description: 'View system roles, custom role definitions, and permission matrices',
  },
  {
    key: 'roles:create',
    name: 'Create Custom Roles',
    module: 'roles',
    description: 'Create new company-specific roles and configure allowed permissions',
  },
  {
    key: 'roles:update',
    name: 'Update Roles',
    module: 'roles',
    description: 'Modify role names, descriptions, and granted permissions',
  },
  {
    key: 'roles:delete',
    name: 'Delete Roles',
    module: 'roles',
    description: 'Delete custom company roles that are not in use',
  },

  // --- Audit & Settings Module ---
  {
    key: 'audit:read',
    name: 'View Audit Logs',
    module: 'audit_settings',
    description: 'Inspect system-wide security, tenant activity, and action logs',
  },
  {
    key: 'settings:read',
    name: 'View Company Settings',
    module: 'audit_settings',
    description: 'View organization details, defaults, and branding configurations',
  },
  {
    key: 'settings:manage',
    name: 'Manage Company Settings',
    module: 'audit_settings',
    description: 'Edit company settings, timezones, default branches, and security parameters',
  },
];

export const ALL_PERMISSION_KEYS = SYSTEM_PERMISSIONS.map((p) => p.key);

// Default Permission Sets for Standard System Roles
export const SYSTEM_ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: ['*'], // Wildcard access to everything

  COMPANY_ADMIN: [
    'leads:read', 'leads:create', 'leads:update', 'leads:delete', 'leads:assign', 'leads:export',
    'branches:read', 'branches:create', 'branches:update', 'branches:delete', 'branches:team_manage',
    'users:read', 'users:create', 'users:update', 'users:delete', 'users:roles_assign', 'logins:approve',
    'campaigns:read', 'campaigns:assign', 'campaigns:spend_read', 'meta:manage',
    'integrations:read', 'integrations:manage', 'webhooks:manage',
    'roles:read', 'roles:create', 'roles:update', 'roles:delete',
    'audit:read', 'settings:read', 'settings:manage',
  ],

  COMPANY_MANAGER: [
    'leads:read', 'leads:create', 'leads:update', 'leads:assign', 'leads:export',
    'branches:read', 'branches:team_manage',
    'users:read', 'users:create', 'users:update',
    'campaigns:read', 'campaigns:spend_read',
    'integrations:read', 'webhooks:manage',
    'roles:read',
    'settings:read',
  ],

  BRANCH_MANAGER: [
    'leads:read', 'leads:create', 'leads:update', 'leads:assign',
    'branches:read', 'branches:team_manage',
    'users:read', 'users:create', 'users:update',
    'campaigns:read', 'campaigns:assign', 'campaigns:spend_read',
    'integrations:read',
    'settings:read',
  ],

  SALES_AGENT: [
    'leads:read', 'leads:create', 'leads:update',
    'branches:read',
    'settings:read',
  ],
};

import { RoleModel, IRoleDoc } from '../models/RoleModel';
import { User } from '../models/User';
import { SYSTEM_ROLE_PERMISSIONS, ALL_PERMISSION_KEYS, SYSTEM_PERMISSIONS } from '../security/permissions';
import { Role } from '../types';

export interface RoleInput {
  name: string;
  slug?: string;
  description?: string;
  permissions: string[];
  rank?: number;
}

export class RbacService {
  /**
   * Seed standard system roles if they don't already exist.
   */
  public static async seedSystemRoles(): Promise<void> {
    const systemRoles = [
      {
        name: 'Super Admin',
        slug: 'super_admin',
        description: 'Full root access to all system features across all companies and branches',
        permissions: ['*'],
        isSystem: true,
        rank: 1,
        companyId: null,
      },
      {
        name: 'Company Admin',
        slug: 'company_admin',
        description: 'Full administrative access over company branches, users, campaigns, and settings',
        permissions: SYSTEM_ROLE_PERMISSIONS.COMPANY_ADMIN,
        isSystem: true,
        rank: 10,
        companyId: null,
      },
      {
        name: 'Company Manager',
        slug: 'company_manager',
        description: 'Management access over leads, team performance, and reporting',
        permissions: SYSTEM_ROLE_PERMISSIONS.COMPANY_MANAGER,
        isSystem: true,
        rank: 20,
        companyId: null,
      },
      {
        name: 'Branch Manager',
        slug: 'branch_manager',
        description: 'Branch-level operational lead assignment, branch campaigns, and team oversight',
        permissions: SYSTEM_ROLE_PERMISSIONS.BRANCH_MANAGER,
        isSystem: true,
        rank: 30,
        companyId: null,
      },
      {
        name: 'Sales Agent',
        slug: 'sales_agent',
        description: 'Direct sales agent responsible for handling and updating assigned leads',
        permissions: SYSTEM_ROLE_PERMISSIONS.SALES_AGENT,
        isSystem: true,
        rank: 40,
        companyId: null,
      },
    ];

    for (const roleData of systemRoles) {
      const existing = await RoleModel.findOne({ slug: roleData.slug, companyId: null });
      if (!existing) {
        await RoleModel.create(roleData);
      }
    }
  }

  /**
   * Resolves the effective permissions for a user.
   */
  public static async getEffectivePermissions(user: any): Promise<string[]> {
    if (!user) return [];

    // Super admins always have full wildcard permission
    if (user.isSuperAdmin || user.role === Role.SUPER_ADMIN || user.role === 'SUPER_ADMIN' || user.role === 'super_admin') {
      return ['*'];
    }

    let rolePermissions: string[] = [];

    // 1. Try resolving via roleId if present
    if (user.roleId) {
      const roleDoc = await RoleModel.findById(user.roleId);
      if (roleDoc && roleDoc.isActive) {
        rolePermissions = roleDoc.permissions || [];
      }
    }

    // 2. If no roleDoc found via roleId, resolve via user.role
    if (rolePermissions.length === 0 && user.role) {
      const normalizedRole = String(user.role).toUpperCase();
      if (SYSTEM_ROLE_PERMISSIONS[normalizedRole]) {
        rolePermissions = SYSTEM_ROLE_PERMISSIONS[normalizedRole];
      } else {
        // Check RoleModel by slug
        const slug = String(user.role).toLowerCase();
        const roleDoc = await RoleModel.findOne({
          slug,
          $or: [{ companyId: user.companyId }, { companyId: null }],
        });
        if (roleDoc && roleDoc.isActive) {
          rolePermissions = roleDoc.permissions || [];
        }
      }
    }

    // 3. Merge customPermissions if any
    const custom = Array.isArray(user.customPermissions) ? user.customPermissions : [];
    const merged = Array.from(new Set([...rolePermissions, ...custom]));

    if (merged.includes('*')) {
      return ['*'];
    }

    return merged;
  }

  /**
   * Check if the effective permissions satisfy the required permission key.
   */
  public static hasPermission(effectivePermissions: string[], requiredPermission: string): boolean {
    if (!effectivePermissions || effectivePermissions.length === 0) return false;
    if (effectivePermissions.includes('*')) return true;
    if (effectivePermissions.includes(requiredPermission)) return true;

    // Check module wildcard (e.g. "leads:*" satisfies "leads:read")
    const [reqModule] = requiredPermission.split(':');
    if (reqModule && effectivePermissions.includes(`${reqModule}:*`)) {
      return true;
    }

    return false;
  }

  /**
   * Check if all required permissions are granted.
   */
  public static hasAllPermissions(effectivePermissions: string[], requiredPermissions: string[]): boolean {
    return requiredPermissions.every((perm) => this.hasPermission(effectivePermissions, perm));
  }

  /**
   * Check if any of the required permissions is granted.
   */
  public static hasAnyPermission(effectivePermissions: string[], requiredPermissions: string[]): boolean {
    return requiredPermissions.some((perm) => this.hasPermission(effectivePermissions, perm));
  }

  /**
   * Retrieve all roles available to a company (System roles + company custom roles).
   */
  public static async getRolesForCompany(companyId?: string | null): Promise<IRoleDoc[]> {
    const query: any = { isActive: true };
    if (companyId) {
      query.$or = [{ companyId: null }, { companyId }];
    } else {
      query.companyId = null;
    }
    return RoleModel.find(query).sort({ rank: 1, name: 1 });
  }

  /**
   * Create a custom role for a company.
   */
  public static async createCustomRole(
    companyId: string,
    data: RoleInput
  ): Promise<IRoleDoc> {
    const slug = (data.slug || data.name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    // Check duplicate slug within the company or system
    const existing = await RoleModel.findOne({
      slug,
      $or: [{ companyId }, { companyId: null }],
    });
    if (existing) {
      throw new Error(`A role with slug "${slug}" already exists`);
    }

    // Validate permissions: filter to allowed keys
    const validPermissions = (data.permissions || []).filter(
      (p) => p === '*' || ALL_PERMISSION_KEYS.includes(p)
    );

    const role = await RoleModel.create({
      name: data.name,
      slug,
      description: data.description || '',
      companyId,
      permissions: validPermissions,
      isSystem: false,
      rank: data.rank ?? 50,
      isActive: true,
    });

    return role;
  }

  /**
   * Update an existing role.
   */
  public static async updateRole(
    roleId: string,
    companyId: string | null,
    data: Partial<RoleInput> & { isActive?: boolean }
  ): Promise<IRoleDoc> {
    const role = await RoleModel.findById(roleId);
    if (!role) {
      throw new Error('Role not found');
    }

    // If companyId is supplied and not system admin, protect other companies' roles
    if (companyId && role.companyId && role.companyId.toString() !== companyId.toString()) {
      throw new Error('Unauthorized to update this role');
    }

    // Protect system roles from having slug or system flag altered
    if (role.isSystem && data.slug && data.slug !== role.slug) {
      throw new Error('Cannot change slug of a system role');
    }

    if (data.name) role.name = data.name;
    if (data.description !== undefined) role.description = data.description;
    if (data.permissions) {
      role.permissions = data.permissions.filter(
        (p) => p === '*' || ALL_PERMISSION_KEYS.includes(p)
      );
    }
    if (data.rank !== undefined && !role.isSystem) {
      role.rank = data.rank;
    }
    if (data.isActive !== undefined) {
      role.isActive = data.isActive;
    }

    await role.save();
    return role;
  }

  /**
   * Delete a custom role.
   */
  public static async deleteRole(roleId: string, companyId?: string | null): Promise<void> {
    const role = await RoleModel.findById(roleId);
    if (!role) {
      throw new Error('Role not found');
    }

    if (role.isSystem) {
      throw new Error('System roles cannot be deleted');
    }

    if (companyId && role.companyId && role.companyId.toString() !== companyId.toString()) {
      throw new Error('Unauthorized to delete this role');
    }

    // Check if any active users are assigned to this role
    const assignedUserCount = await User.countDocuments({
      $or: [{ roleId: role._id }, { role: role.slug }],
      isActive: true,
    });

    if (assignedUserCount > 0) {
      throw new Error(`Cannot delete role: ${assignedUserCount} active user(s) are assigned to it`);
    }

    await RoleModel.findByIdAndDelete(roleId);
  }
}

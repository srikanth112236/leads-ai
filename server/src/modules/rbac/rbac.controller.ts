import { Response } from 'express';
import { AuthRequest } from '../../common/middleware/auth';
import { RbacService } from '../../common/services/RbacService';
import { SYSTEM_PERMISSIONS, PERMISSION_MODULES } from '../../common/security/permissions';
import { RoleModel } from '../../common/models/RoleModel';
import { Role } from '../../common/types';

export class RbacController {
  /**
   * Get all permission definitions grouped by module.
   */
  static async getPermissions(_req: AuthRequest, res: Response): Promise<void> {
    try {
      res.json({
        success: true,
        data: {
          modules: PERMISSION_MODULES,
          permissions: SYSTEM_PERMISSIONS,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_PERMISSIONS_ERROR' });
    }
  }

  /**
   * List available roles for the current tenant.
   */
  static async getRoles(req: AuthRequest, res: Response): Promise<void> {
    try {
      const companyId = req.user?.isSuperAdmin && req.query.companyId
        ? (req.query.companyId as string)
        : req.user?.companyId;

      const roles = await RbacService.getRolesForCompany(companyId);

      // Attach user count for each role
      const { User } = await import('../../common/models/User');
      const rolesWithCounts = await Promise.all(
        roles.map(async (r) => {
          const count = await User.countDocuments({
            $or: [{ roleId: r._id }, { role: r.slug }],
            isActive: true,
          });
          return {
            ...r.toObject(),
            userCount: count,
          };
        })
      );

      res.json({
        success: true,
        data: rolesWithCounts,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ROLES_ERROR' });
    }
  }

  /**
   * Create a new custom role. Only Super Admin or Company Admin can create roles.
   */
  static async createRole(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { name, slug, description, permissions, rank } = req.body;
      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Role name is required', code: 'INVALID_NAME' });
        return;
      }

      const companyId = req.user?.isSuperAdmin && req.body.companyId
        ? req.body.companyId
        : req.user?.companyId;

      if (!companyId && !req.user?.isSuperAdmin) {
        res.status(400).json({ error: 'Company ID required', code: 'MISSING_COMPANY' });
        return;
      }

      const role = await RbacService.createCustomRole(companyId, {
        name: name.trim(),
        slug,
        description,
        permissions: Array.isArray(permissions) ? permissions : [],
        rank: typeof rank === 'number' ? rank : 50,
      });

      res.status(201).json({
        success: true,
        message: 'Role created successfully',
        data: role,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message, code: 'CREATE_ROLE_ERROR' });
    }
  }

  /**
   * Update a custom or system role.
   */
  static async updateRole(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { name, description, permissions, rank, isActive } = req.body;

      const companyId = req.user?.isSuperAdmin ? null : (req.user?.companyId || null);

      const updated = await RbacService.updateRole(id, companyId, {
        name,
        description,
        permissions,
        rank,
        isActive,
      });

      res.json({
        success: true,
        message: 'Role updated successfully',
        data: updated,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message, code: 'UPDATE_ROLE_ERROR' });
    }
  }

  /**
   * Delete a custom role.
   */
  static async deleteRole(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const companyId = req.user?.isSuperAdmin ? null : (req.user?.companyId || null);

      await RbacService.deleteRole(id, companyId);

      res.json({
        success: true,
        message: 'Role deleted successfully',
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message, code: 'DELETE_ROLE_ERROR' });
    }
  }
}

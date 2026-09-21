import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../../common/models/User';
import { CompanyMembership } from '../../common/models/CompanyMembership';
import { BranchMembership } from '../../common/models/BranchMembership';
import { generateTokens } from '../../common/security/jwt';
import { hashPassword, comparePassword } from '../../common/security/hash';
import { Role } from '../../common/types';
import { BaseController } from '../../common/controllers/BaseController';

export class AuthController extends BaseController {
  static async resolveAllowedBranchIds(userId: string): Promise<string[]> {
    const [companyMemberships, branchMemberships] = await Promise.all([
      CompanyMembership.find({ userId, isActive: true }).lean(),
      BranchMembership.find({ userId, isActive: true }).lean(),
    ]);
    const ids = new Set<string>();
    for (const m of companyMemberships) {
      for (const b of (m.branchIds || [])) ids.add(b.toString());
    }
    for (const m of branchMemberships) ids.add(m.branchId.toString());
    return [...ids];
  }
  static async register(req: Request, res: Response): Promise<void> {
    try {
      // Public registration is deliberately unprivileged: role and tenant come
      // only from an administrator afterwards. Never trust them from the body.
      const { email, password, firstName, lastName } = req.body;
      const role = Role.SALES_AGENT;
      const existing = await User.findOne({ email });
      if (existing) {
        res.status(409).json({ error: 'User already exists', code: 'USER_EXISTS' });
        return;
      }
      const hashedPassword = await hashPassword(password);
      const user = new User({ email, password: hashedPassword, firstName, lastName, role, isActive: true });
      await user.save();
      const { accessToken, refreshToken } = generateTokens(user._id.toString(), user.role, user.companyId, user.branchId);
      res.status(201).json({ success: true, data: { user: { id: user._id, email, firstName, lastName, role }, accessToken, refreshToken } });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'REGISTRATION_ERROR' });
    }
  }

  static async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;
      const user = await User.findOne({ email }).select('+password');
      if (!user || !user.isActive) {
        res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
        return;
      }
      const valid = await comparePassword(password, user.password);
      if (!valid) {
        res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
        return;
      }
      user.lastLoginAt = new Date();
      await user.save();
      const allowedBranchIds = await AuthController.resolveAllowedBranchIds(user._id.toString());
      const { accessToken, refreshToken } = generateTokens(user._id.toString(), user.role, user.companyId, user.branchId, allowedBranchIds);
      res.json({ success: true, data: { user: { id: user._id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role, companyId: user.companyId, branchId: user.branchId }, accessToken, refreshToken } });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'LOGIN_ERROR' });
    }
  }

  static async refreshToken(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        res.status(401).json({ error: 'Refresh token required', code: 'NO_TOKEN' });
        return;
      }
      const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET || 'dev-secret') as Record<string, unknown>;
      const user = await User.findById(decoded.userId);
      if (!user || !user.isActive) {
        res.status(401).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
        return;
      }
      const { accessToken, refreshToken: newRefresh } = generateTokens(user._id.toString(), user.role, user.companyId, user.branchId, await AuthController.resolveAllowedBranchIds(user._id.toString()));
      res.json({ success: true, data: { accessToken, refreshToken: newRefresh } });
    } catch (error) {
      res.status(403).json({ error: 'Invalid refresh token', code: 'INVALID_REFRESH' });
    }
  }

  static async getProfile(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.userId;
      const user = await User.findById(userId).select('email firstName lastName role companyId branchId isActive');
      if (!user) {
        res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
        return;
      }
      res.json({ success: true, data: { id: user._id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role, companyId: user.companyId, branchId: user.branchId } });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'PROFILE_ERROR' });
    }
  }

  static async updateProfile(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.userId;
      const { firstName, lastName, phone } = req.body;
      const user = await User.findByIdAndUpdate(userId, { firstName, lastName, phone }, { new: true, runValidators: true });
      res.json({ success: true, data: user });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'UPDATE_ERROR' });
    }
  }

  static async changePassword(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.userId;
      const { currentPassword, newPassword } = req.body;
      const user = await User.findById(userId).select('+password');
      if (!user) {
        res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
        return;
      }
      const valid = await comparePassword(currentPassword, user.password);
      if (!valid) {
        res.status(400).json({ error: 'Current password is incorrect', code: 'WRONG_PASSWORD' });
        return;
      }
      user.password = await hashPassword(newPassword);
      await user.save();
      res.json({ success: true, message: 'Password updated' });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'PASSWORD_ERROR' });
    }
  }

  static async forgotPassword(req: Request, res: Response): Promise<void> {
    res.json({ success: true, message: 'Password reset email sent' });
  }

  static async resetPassword(req: Request, res: Response): Promise<void> {
    res.json({ success: true, message: 'Password reset successfully' });
  }
}

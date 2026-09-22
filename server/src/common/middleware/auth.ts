import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '../types';
import { logger } from '../utils/logger';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    role: Role;
    companyId?: string;
    branchId?: string;
    allowedBranchIds: string[];
    isSuperAdmin: boolean;
  };
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    res.status(401).json({ error: 'Access token required', code: 'NO_TOKEN' });
    return;
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as Record<string, unknown>;
    req.user = {
      userId: decoded.userId as string,
      role: decoded.role as Role,
      companyId: decoded.companyId as string,
      branchId: decoded.branchId as string,
      allowedBranchIds: (decoded.allowedBranchIds as string[]) || [],
      isSuperAdmin: decoded.role === Role.SUPER_ADMIN,
    };
    next();
  } catch (error) {
    logger.warn('Invalid token attempt', { ip: req.ip, path: req.path });
    res.status(403).json({ error: 'Invalid or expired token', code: 'INVALID_TOKEN' });
  }
}

export function requireRole(...roles: Role[]): (req: AuthRequest, res: Response, next: NextFunction) => void {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required', code: 'NO_AUTH' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' });
      return;
    }
    next();
  };
}

export function requireTenantContext(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required', code: 'NO_AUTH' });
    return;
  }
  if (!req.user.companyId && !req.user.isSuperAdmin) {
    res.status(403).json({ error: 'Company context required', code: 'NO_COMPANY' });
    return;
  }
  next();
}

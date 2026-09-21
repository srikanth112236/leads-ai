import jwt, { Secret } from 'jsonwebtoken';
import { Role } from '../types';

const JWT_SECRET: Secret = process.env.JWT_SECRET || 'dev-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';

export function generateToken(payload: Record<string, unknown>): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as any });
}

export function generateTokens(userId: string, role: Role, companyId?: string, branchId?: string, allowedBranchIds: string[] = []): { accessToken: string; refreshToken: string } {
  const accessPayload: Record<string, unknown> = {
    userId,
    role,
    companyId,
    branchId,
    allowedBranchIds,
    isSuperAdmin: role === Role.SUPER_ADMIN,
  };
  const accessToken = jwt.sign(accessPayload, JWT_SECRET, { expiresIn: '15m' as any });
  const refreshToken = jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: '7d' as any });
  return { accessToken, refreshToken };
}

export function verifyToken(token: string): Record<string, unknown> | null {
  try {
    return jwt.verify(token, JWT_SECRET) as Record<string, unknown>;
  } catch {
    return null;
  }
}

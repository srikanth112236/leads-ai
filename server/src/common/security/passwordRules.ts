import { Company } from '../models/Company';

export interface PasswordRules {
  minPasswordLength: number;
  requireSpecialChar: boolean;
  requireNumber: boolean;
}

const DEFAULT_RULES: PasswordRules = {
  minPasswordLength: 8,
  requireSpecialChar: true,
  requireNumber: true,
};

/** Company password policy (Company.settings.security), with safe defaults. */
export async function getPasswordRules(companyId?: string): Promise<PasswordRules> {
  if (!companyId) return { ...DEFAULT_RULES };
  const company = await Company.findById(companyId).select('settings').lean();
  const security = ((company as any)?.settings?.security || {}) as Partial<PasswordRules>;
  return {
    minPasswordLength: Number(security.minPasswordLength) > 0 ? Number(security.minPasswordLength) : DEFAULT_RULES.minPasswordLength,
    requireSpecialChar: security.requireSpecialChar !== false,
    requireNumber: security.requireNumber !== false,
  };
}

/** Returns human-readable violations (empty = valid). */
export async function validatePassword(companyId: string | undefined, password: string): Promise<string[]> {
  const rules = await getPasswordRules(companyId);
  const errors: string[] = [];
  if (!password || password.length < rules.minPasswordLength) {
    errors.push(`Password must be at least ${rules.minPasswordLength} characters.`);
  }
  if (rules.requireSpecialChar && !/[!@#$%^&*(),.?":{}|<>_\-+=[\]/\\'~`]/.test(password || '')) {
    errors.push('Password must include at least one special symbol (!@#$%).');
  }
  if (rules.requireNumber && !/[0-9]/.test(password || '')) {
    errors.push('Password must include at least one number (0-9).');
  }
  return errors;
}

import { Schema, model, Document } from 'mongoose';
import { Role } from '../types';

export interface IUserDoc extends Document {
  email: string;
  password: string;
  /** True until the user replaces an admin-provisioned (temporary) password. */
  mustChangePassword: boolean;
  accessId?: string;
  onboardingStatus: 'active' | 'pending_onboarding';
  companyId?: string;
  branchId?: string;
  role: Role | string;
  roleId?: any;
  customPermissions?: string[];
  firstName: string;
  lastName: string;
  phone?: string;
  isActive: boolean;
  lastLoginAt?: Date;
  /** Account access validity (90-day rolling windows, extendable by admins). */
  accessExpiresAt?: Date;
  /** Grace deadline after an extension – stale sessions die past this point. */
  reauthDeadline?: Date;
  /** When access was last extended (stale-session cutoff reference). */
  accessExtendedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUserDoc>({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  password: { type: String, required: true, select: false },
  mustChangePassword: { type: Boolean, default: false, index: true },
  accessId: { type: String, trim: true, uppercase: true, unique: true, sparse: true },
  onboardingStatus: { type: String, enum: ['active', 'pending_onboarding'], default: 'active', index: true },
  companyId: { type: Schema.Types.ObjectId as any, ref: 'Company', index: true },
  branchId: { type: Schema.Types.ObjectId as any, ref: 'Branch', index: true },
  role: { type: String, required: true, index: true },
  roleId: { type: Schema.Types.ObjectId as any, ref: 'Role', index: true },
  customPermissions: [{ type: String, trim: true }],
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  phone: { type: String, trim: true },
  isActive: { type: Boolean, default: true, index: true },
  lastLoginAt: { type: Date },
  accessExpiresAt: { type: Date, index: true },
  reauthDeadline: { type: Date },
  accessExtendedAt: { type: Date },
}, {
  timestamps: true,
});

UserSchema.index({ companyId: 1, role: 1 });
UserSchema.index({ companyId: 1, branchId: 1 });
UserSchema.index({ role: 1, companyId: 1 });

export const User = model<IUserDoc>('User', UserSchema);

import { Schema, model, Document } from 'mongoose';
import { Role } from '../types';

export interface IUserDoc extends Document {
  email: string;
  password: string;
  companyId?: string;
  branchId?: string;
  role: Role;
  firstName: string;
  lastName: string;
  phone?: string;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUserDoc>({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  password: { type: String, required: true, select: false },
  companyId: { type: Schema.Types.ObjectId as any, ref: 'Company', index: true },
  branchId: { type: Schema.Types.ObjectId as any, ref: 'Branch', index: true },
  role: { type: String, enum: Object.values(Role), required: true, index: true },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  phone: { type: String, trim: true },
  isActive: { type: Boolean, default: true, index: true },
  lastLoginAt: { type: Date },
}, {
  timestamps: true,
});

UserSchema.index({ companyId: 1, role: 1 });
UserSchema.index({ companyId: 1, branchId: 1 });
UserSchema.index({ role: 1, companyId: 1 });

export const User = model<IUserDoc>('User', UserSchema);

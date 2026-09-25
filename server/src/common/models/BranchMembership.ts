import { Schema, model, Document } from 'mongoose';
import { Role } from '../types';

export type AccessLevel = 'full_manage' | 'view_only' | 'standard';

export interface IBranchMembershipDoc extends Document {
  userId: string;
  branchId: string;
  role: Role | string;
  accessLevel: AccessLevel;
  isActive: boolean;
  createdAt: Date;
}

const BranchMembershipSchema = new Schema<IBranchMembershipDoc>({
  userId: { type: Schema.Types.ObjectId as any, ref: 'User', required: true, index: true },
  branchId: { type: Schema.Types.ObjectId as any, ref: 'Branch', required: true, index: true },
  role: { type: String, required: true, index: true },
  accessLevel: { type: String, enum: ['full_manage', 'view_only', 'standard'], default: 'full_manage', index: true },
  isActive: { type: Boolean, default: true, index: true },
}, {
  timestamps: true,
});

BranchMembershipSchema.index({ userId: 1, branchId: 1 }, { unique: true });
BranchMembershipSchema.index({ branchId: 1, isActive: 1 });

export const BranchMembership = model<IBranchMembershipDoc>('BranchMembership', BranchMembershipSchema);

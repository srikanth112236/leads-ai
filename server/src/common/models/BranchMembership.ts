import { Schema, model, Document } from 'mongoose';
import { Role } from '../types';

export interface IBranchMembershipDoc extends Document {
  userId: string;
  branchId: string;
  role: Role;
  isActive: boolean;
  createdAt: Date;
}

const BranchMembershipSchema = new Schema<IBranchMembershipDoc>({
  userId: { type: Schema.Types.ObjectId as any, ref: 'User', required: true, index: true },
  branchId: { type: Schema.Types.ObjectId as any, ref: 'Branch', required: true, index: true },
  role: { type: String, enum: Object.values(Role), required: true, index: true },
  isActive: { type: Boolean, default: true, index: true },
}, {
  timestamps: true,
});

BranchMembershipSchema.index({ userId: 1, branchId: 1 }, { unique: true });
BranchMembershipSchema.index({ branchId: 1, isActive: 1 });

export const BranchMembership = model<IBranchMembershipDoc>('BranchMembership', BranchMembershipSchema);

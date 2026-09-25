import { Schema, model, Document } from 'mongoose';
import { Role } from '../types';

export interface ICompanyMembershipDoc extends Document {
  userId: string;
  companyId: string;
  role: Role | string;
  branchIds: string[];
  isActive: boolean;
  createdAt: Date;
}

const CompanyMembershipSchema = new Schema<ICompanyMembershipDoc>({
  userId: { type: Schema.Types.ObjectId as any, ref: 'User', required: true, index: true },
  companyId: { type: Schema.Types.ObjectId as any, ref: 'Company', required: true, index: true },
  role: { type: String, required: true, index: true },
  branchIds: [{ type: Schema.Types.ObjectId as any, ref: 'Branch' }],
  isActive: { type: Boolean, default: true, index: true },
}, {
  timestamps: true,
});

CompanyMembershipSchema.index({ userId: 1, companyId: 1 }, { unique: true });
CompanyMembershipSchema.index({ companyId: 1, role: 1 });

export const CompanyMembership = model<ICompanyMembershipDoc>('CompanyMembership', CompanyMembershipSchema);

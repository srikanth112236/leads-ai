import { Schema, model, Document } from 'mongoose';
import { nextBranchCode } from './BranchCounter';

export type BranchType = 'hq' | 'regional_hub' | 'sales_office' | 'franchise';

export interface IBranchDoc extends Document {
  companyId: string;
  branchCode: string;
  name: string;
  location?: string;
  parentBranchId?: string;
  branchType: BranchType;
  timezone: string;
  status: 'active' | 'inactive';
  /** First/main business branch of the company – owns default-admin duties. */
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BranchSchema = new Schema<IBranchDoc>({
  companyId: { type: Schema.Types.ObjectId as any, ref: 'Company', required: true, index: true },
  branchCode: { type: String, trim: true, uppercase: true },
  name: { type: String, required: true, trim: true },
  location: { type: String, trim: true },
  parentBranchId: { type: Schema.Types.ObjectId as any, ref: 'Branch' },
  branchType: { type: String, enum: ['hq', 'regional_hub', 'sales_office', 'franchise'], default: 'sales_office', index: true },
  timezone: { type: String, default: 'UTC' },
  status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
  isDefault: { type: Boolean, default: false, index: true },
}, {
  timestamps: true,
});

BranchSchema.index({ companyId: 1, status: 1 });
BranchSchema.index({ companyId: 1, isDefault: 1 });
BranchSchema.index({ companyId: 1, name: 1 }, { unique: true });
BranchSchema.index({ companyId: 1, branchCode: 1 }, { unique: true, sparse: true });
BranchSchema.index({ parentBranchId: 1 });

// Auto-assign a code so every writer (seed, tests, OAuth flows, API) gets one
// without duplicating generation logic. Explicit codes pass through untouched.
BranchSchema.pre('save', async function (next) {
  try {
    const doc = this as IBranchDoc;
    if (!doc.branchCode) {
      const { Company } = await import('./Company');
      const company = await Company.findById(doc.companyId).select('name').lean();
      doc.branchCode = await nextBranchCode(doc.companyId.toString(), (company as any)?.name || 'Branch');
    }
    next();
  } catch (error) {
    next(error as any);
  }
});

export const Branch = model<IBranchDoc>('Branch', BranchSchema);

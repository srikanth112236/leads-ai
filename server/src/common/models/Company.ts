import { Schema, model, Document } from 'mongoose';

export interface ICompanyDoc extends Document {
  name: string;
  domain?: string;
  status: 'active' | 'inactive' | 'suspended';
  contactEmail?: string;
  contactPhone?: string;
  defaultBranchId?: string;
  address?: string;
  city?: string;
  country?: string;
  website?: string;
  settings?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const CompanySchema = new Schema<ICompanyDoc>({
  name: { type: String, required: true, trim: true, index: true },
  domain: { type: String, trim: true, index: true },
  status: { type: String, enum: ['active', 'inactive', 'suspended'], default: 'active', index: true },
  contactEmail: { type: String, trim: true, lowercase: true },
  contactPhone: { type: String, trim: true },
  defaultBranchId: { type: Schema.Types.ObjectId as any, ref: 'Branch' },
  address: { type: String, trim: true },
  city: { type: String, trim: true },
  country: { type: String, trim: true },
  website: { type: String, trim: true },
  settings: { type: Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
});

CompanySchema.index({ name: 'text', domain: 'text' });
CompanySchema.index({ status: 1, createdAt: -1 });

export const Company = model<ICompanyDoc>('Company', CompanySchema);

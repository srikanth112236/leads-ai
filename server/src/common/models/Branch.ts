import { Schema, model, Document } from 'mongoose';

export interface IBranchDoc extends Document {
  companyId: string;
  name: string;
  location?: string;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

const BranchSchema = new Schema<IBranchDoc>({
  companyId: { type: Schema.Types.ObjectId as any, ref: 'Company', required: true, index: true },
  name: { type: String, required: true, trim: true },
  location: { type: String, trim: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
}, {
  timestamps: true,
});

BranchSchema.index({ companyId: 1, status: 1 });
BranchSchema.index({ companyId: 1, name: 1 }, { unique: true });

export const Branch = model<IBranchDoc>('Branch', BranchSchema);

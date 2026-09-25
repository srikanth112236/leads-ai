import { Schema, model, Document } from 'mongoose';

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'proposal' | 'converted' | 'lost' | 'dead';
export type LeadPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface ILeadDoc extends Document {
  companyId: string;
  branchId?: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  message?: string;
  status: LeadStatus;
  priority: LeadPriority;
  score?: number;
  source?: string;
  tags?: string[];
  assignedTo?: string;
  metadata?: Record<string, unknown>;
  normalizedPhone?: string;
  normalizedEmail?: string;
  externalIds?: Record<string, string>;
  isDuplicate?: boolean;
  mergedInto?: string;
  createdAt: Date;
  updatedAt: Date;
}

const LeadSchema = new Schema<ILeadDoc>({
  companyId: { type: Schema.Types.ObjectId as any, ref: 'Company', required: true, index: true },
  branchId: { type: Schema.Types.ObjectId as any, ref: 'Branch', index: true },
  name: { type: String, required: true, trim: true, index: true },
  email: { type: String, trim: true, index: true },
  phone: { type: String, trim: true, index: true },
  company: { type: String, trim: true },
  message: { type: String },
  status: { type: String, enum: ['new', 'contacted', 'qualified', 'proposal', 'converted', 'lost', 'dead'], default: 'new', index: true },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  score: { type: Number, default: 0 },
  source: { type: String, index: true },
  tags: [{ type: String, trim: true }],
  assignedTo: { type: Schema.Types.ObjectId as any, ref: 'User' },
  metadata: { type: Schema.Types.Mixed, default: {} },
  normalizedPhone: { type: String, index: true },
  normalizedEmail: { type: String, index: true },
  externalIds: { type: Schema.Types.Mixed, default: {} },
  isDuplicate: { type: Boolean, default: false },
  mergedInto: { type: Schema.Types.ObjectId as any, ref: 'Lead' },
}, {
  timestamps: true,
});

LeadSchema.index({ companyId: 1, normalizedPhone: 1 });
LeadSchema.index({ companyId: 1, normalizedEmail: 1 });
LeadSchema.index({ companyId: 1, status: 1, createdAt: -1 });
LeadSchema.index({ companyId: 1, branchId: 1, createdAt: -1 });
LeadSchema.index({ companyId: 1, source: 1 });
LeadSchema.index({ companyId: 1, tags: 1 });
LeadSchema.index({ externalIds: 1 });

export const Lead = model<ILeadDoc>('Lead', LeadSchema);

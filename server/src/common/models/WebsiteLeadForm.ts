import { Schema, model, Document } from 'mongoose';

export interface IWebsiteLeadFormDoc extends Document {
  companyId: string;
  branchId?: string;
  publicKey: string;
  allowedDomains: string[];
  status: 'active' | 'inactive';
  configuration: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const WebsiteLeadFormSchema = new Schema<IWebsiteLeadFormDoc>({
  companyId: { type: Schema.Types.ObjectId as any, ref: 'Company', required: true, index: true },
  branchId: { type: Schema.Types.ObjectId as any, ref: 'Branch', index: true },
  publicKey: { type: String, required: true, unique: true, index: true },
  allowedDomains: { type: [String], default: [] },
  status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
  configuration: { type: Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
});

WebsiteLeadFormSchema.index({ companyId: 1, status: 1 });

export const WebsiteLeadForm = model<IWebsiteLeadFormDoc>('WebsiteLeadForm', WebsiteLeadFormSchema);

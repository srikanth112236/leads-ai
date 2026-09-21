import { Schema, model, Document } from 'mongoose';

export interface IMetaLeadFormDoc extends Document {
  metaFormId: string;
  metaPageId: string;
  pageRef?: string;
  companyId: string;
  branchId?: string;
  name?: string;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

const MetaLeadFormSchema = new Schema<IMetaLeadFormDoc>({
  metaFormId: { type: String, required: true, unique: true },
  metaPageId: { type: String, required: true, index: true },
  pageRef: { type: Schema.Types.ObjectId as any, ref: 'MetaPage' },
  companyId: { type: Schema.Types.ObjectId as any, ref: 'Company', required: true, index: true },
  branchId: { type: Schema.Types.ObjectId as any, ref: 'Branch', index: true },
  name: { type: String, trim: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
}, {
  timestamps: true,
});

MetaLeadFormSchema.index({ companyId: 1, status: 1 });

export const MetaLeadForm = model<IMetaLeadFormDoc>('MetaLeadForm', MetaLeadFormSchema);

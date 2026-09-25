import { Schema, model, Document } from 'mongoose';

export interface IMetaPageDoc extends Document {
  metaPageId: string;
  companyId: string;
  branchId?: string;
  integrationId: string;
  name?: string;
  accessToken?: string;
  subscribed?: boolean;
  status: 'active' | 'inactive' | 'pending';
  createdAt: Date;
  updatedAt: Date;
}

const MetaPageSchema = new Schema<IMetaPageDoc>({
  metaPageId: { type: String, required: true, unique: true },
  companyId: { type: Schema.Types.ObjectId as any, ref: 'Company', required: true, index: true },
  branchId: { type: Schema.Types.ObjectId as any, ref: 'Branch', index: true },
  integrationId: { type: Schema.Types.ObjectId as any, ref: 'MetaIntegration', required: true, index: true },
  name: { type: String, trim: true },
  accessToken: { type: String, select: false },
  subscribed: { type: Boolean, default: false },
  status: { type: String, enum: ['active', 'inactive', 'pending'], default: 'pending', index: true },
}, {
  timestamps: true,
});

MetaPageSchema.index({ companyId: 1, status: 1 });

export const MetaPage = model<IMetaPageDoc>('MetaPage', MetaPageSchema);

import { Schema, model, Document } from 'mongoose';

export interface IMetaAdAccountDoc extends Document {
  metaAdAccountId: string;
  companyId: string;
  integrationId: string;
  name?: string;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

const MetaAdAccountSchema = new Schema<IMetaAdAccountDoc>({
  metaAdAccountId: { type: String, required: true, unique: true },
  companyId: { type: Schema.Types.ObjectId as any, ref: 'Company', required: true, index: true },
  integrationId: { type: Schema.Types.ObjectId as any, ref: 'MetaIntegration', required: true, index: true },
  name: { type: String, trim: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
}, {
  timestamps: true,
});

MetaAdAccountSchema.index({ companyId: 1, status: 1 });

export const MetaAdAccount = model<IMetaAdAccountDoc>('MetaAdAccount', MetaAdAccountSchema);

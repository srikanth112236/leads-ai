import { Schema, model, Document } from 'mongoose';

export interface IMetaAdAccountDoc extends Document {
  metaAdAccountId: string;
  companyId: string;
  branchId?: string;
  integrationId: string;
  name?: string;
  accountStatus?: number;
  amountSpent?: string;
  currency?: string;
  timezone?: string;
  businessName?: string;
  ownerBusinessId?: string;
  lastSyncedAt?: Date;
  subscribed?: boolean;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

const MetaAdAccountSchema = new Schema<IMetaAdAccountDoc>({
  metaAdAccountId: { type: String, required: true, unique: true },
  companyId: { type: Schema.Types.ObjectId as any, ref: 'Company', required: true, index: true },
  branchId: { type: Schema.Types.ObjectId as any, ref: 'Branch', index: true },
  integrationId: { type: Schema.Types.ObjectId as any, ref: 'MetaIntegration', required: true, index: true },
  name: { type: String, trim: true },
  accountStatus: { type: Number },
  amountSpent: { type: String },
  currency: { type: String },
  timezone: { type: String },
  businessName: { type: String, trim: true },
  ownerBusinessId: { type: String, index: true },
  lastSyncedAt: { type: Date },
  subscribed: { type: Boolean, default: false },
  status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
}, {
  timestamps: true,
});

MetaAdAccountSchema.index({ companyId: 1, status: 1 });
MetaAdAccountSchema.index({ companyId: 1, branchId: 1 });

export const MetaAdAccount = model<IMetaAdAccountDoc>('MetaAdAccount', MetaAdAccountSchema);

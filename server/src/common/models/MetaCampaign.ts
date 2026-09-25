import { Schema, model, Document } from 'mongoose';

export interface IMetaCampaignDoc extends Document {
  campaignId: string;
  companyId: string;
  branchId?: string;
  metaAdAccountId?: string;
  adAccountId?: string;
  name?: string;
  status?: string;
  effectiveStatus?: string;
  objective?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MetaCampaignSchema = new Schema<IMetaCampaignDoc>(
  {
    campaignId: { type: String, required: true, index: true },
    companyId: { type: Schema.Types.ObjectId as any, ref: 'Company', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId as any, ref: 'Branch', index: true },
    metaAdAccountId: { type: String, index: true },
    adAccountId: { type: Schema.Types.ObjectId as any, ref: 'MetaAdAccount', index: true },
    name: { type: String, trim: true },
    status: { type: String, trim: true },
    effectiveStatus: { type: String, trim: true },
    objective: { type: String, trim: true },
  },
  { timestamps: true }
);

MetaCampaignSchema.index({ companyId: 1, campaignId: 1 }, { unique: true });
MetaCampaignSchema.index({ companyId: 1, branchId: 1 });

export const MetaCampaign = model<IMetaCampaignDoc>('MetaCampaign', MetaCampaignSchema);

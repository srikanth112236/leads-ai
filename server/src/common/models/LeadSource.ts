import { Schema, model, Document } from 'mongoose';

export interface ILeadSourceDoc extends Document {
  leadId: string;
  sourceType: string;
  externalId?: string;
  sourceUrl?: string;
  rawData: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const LeadSourceSchema = new Schema<ILeadSourceDoc>({
  leadId: { type: Schema.Types.ObjectId as any, ref: 'Lead', required: true, index: true },
  sourceType: { type: String, required: true, index: true },
  externalId: { type: String, index: true },
  sourceUrl: { type: String, trim: true },
  rawData: { type: Schema.Types.Mixed, required: true },
  metadata: { type: Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
});

LeadSourceSchema.index({ leadId: 1, sourceType: 1 });
LeadSourceSchema.index({ externalId: 1, sourceType: 1 });
LeadSourceSchema.index({ sourceType: 1, createdAt: -1 });

export const LeadSource = model<ILeadSourceDoc>('LeadSource', LeadSourceSchema);

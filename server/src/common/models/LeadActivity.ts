import { Schema, model, Document } from 'mongoose';

export interface ILeadActivityDoc extends Document {
  leadId: string;
  companyId: string;
  branchId?: string;
  actorId?: string;
  action: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const LeadActivitySchema = new Schema<ILeadActivityDoc>({
  leadId: { type: Schema.Types.ObjectId as any, ref: 'Lead', required: true, index: true },
  companyId: { type: Schema.Types.ObjectId as any, ref: 'Company', required: true, index: true },
  branchId: { type: Schema.Types.ObjectId as any, ref: 'Branch', index: true },
  actorId: { type: Schema.Types.ObjectId as any, ref: 'User' },
  action: { type: String, required: true, index: true },
  metadata: { type: Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
});

LeadActivitySchema.index({ leadId: 1, createdAt: -1 });
LeadActivitySchema.index({ companyId: 1, action: 1 });

export const LeadActivity = model<ILeadActivityDoc>('LeadActivity', LeadActivitySchema);

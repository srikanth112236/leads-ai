import { Schema, model, Document } from 'mongoose';

export interface ITrackerEventDoc extends Document {
  source: string;
  leadId: string;
  companyId: string;
  branchId?: string;
  eventType: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const TrackerEventSchema = new Schema<ITrackerEventDoc>({
  source: { type: String, required: true, index: true },
  leadId: { type: Schema.Types.ObjectId as any, ref: 'Lead', required: true, index: true },
  companyId: { type: Schema.Types.ObjectId as any, ref: 'Company', required: true, index: true },
  branchId: { type: Schema.Types.ObjectId as any, ref: 'Branch', index: true },
  eventType: { type: String, required: true, index: true },
  metadata: { type: Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
});

TrackerEventSchema.index({ leadId: 1, createdAt: -1 });
TrackerEventSchema.index({ source: 1, createdAt: -1 });
TrackerEventSchema.index({ companyId: 1, eventType: 1 });

export const TrackerEvent = model<ITrackerEventDoc>('TrackerEvent', TrackerEventSchema);

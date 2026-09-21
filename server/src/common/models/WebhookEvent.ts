import { Schema, model, Document } from 'mongoose';

export interface IWebhookEventDoc extends Document {
  provider: string;
  eventType: string;
  externalEventId: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'processing' | 'processed' | 'failed';
  attempts: number;
  maxAttempts: number;
  receivedAt: Date;
  processedAt?: Date;
  error?: string;
  companyId?: string;
  branchId?: string;
  leadId?: string;
}

const WebhookEventSchema = new Schema<IWebhookEventDoc>({
  provider: { type: String, required: true, index: true },
  eventType: { type: String, required: true, index: true },
  externalEventId: { type: String, required: true, index: true },
  payload: { type: Schema.Types.Mixed, required: true },
  status: { type: String, enum: ['pending', 'processing', 'processed', 'failed'], default: 'pending', index: true },
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 3 },
  receivedAt: { type: Date, required: true, default: Date.now, index: true },
  processedAt: { type: Date },
  error: { type: String },
  companyId: { type: Schema.Types.ObjectId as any, ref: 'Company', index: true },
  branchId: { type: Schema.Types.ObjectId as any, ref: 'Branch', index: true },
  leadId: { type: Schema.Types.ObjectId as any, ref: 'Lead', index: true },
}, {
  timestamps: true,
});

WebhookEventSchema.index({ provider: 1, externalEventId: 1 }, { unique: true });
WebhookEventSchema.index({ status: 1, receivedAt: 1 });
WebhookEventSchema.index({ companyId: 1, provider: 1 });

export const WebhookEvent = model<IWebhookEventDoc>('WebhookEvent', WebhookEventSchema);

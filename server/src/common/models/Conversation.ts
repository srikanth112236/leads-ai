import { Schema, model, Document } from 'mongoose';

export interface IConversationDoc extends Document {
  leadId: string;
  companyId: string;
  branchId?: string;
  channel: string;
  status: 'active' | 'closed';
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSchema = new Schema<IConversationDoc>({
  leadId: { type: Schema.Types.ObjectId as any, ref: 'Lead', required: true, index: true },
  companyId: { type: Schema.Types.ObjectId as any, ref: 'Company', required: true, index: true },
  branchId: { type: Schema.Types.ObjectId as any, ref: 'Branch', index: true },
  channel: { type: String, required: true, index: true },
  status: { type: String, enum: ['active', 'closed'], default: 'active', index: true },
  metadata: { type: Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
});

ConversationSchema.index({ companyId: 1, channel: 1 });

export const Conversation = model<IConversationDoc>('Conversation', ConversationSchema);

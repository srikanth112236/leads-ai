import { Schema, model, Document } from 'mongoose';

export interface IMessageDoc extends Document {
  conversationId: string;
  leadId: string;
  companyId: string;
  branchId?: string;
  direction: 'inbound' | 'outbound';
  sender: 'customer' | 'agent' | 'system';
  content: string;
  channel: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const MessageSchema = new Schema<IMessageDoc>({
  conversationId: { type: Schema.Types.ObjectId as any, ref: 'Conversation', required: true, index: true },
  leadId: { type: Schema.Types.ObjectId as any, ref: 'Lead', required: true, index: true },
  companyId: { type: Schema.Types.ObjectId as any, ref: 'Company', required: true, index: true },
  branchId: { type: Schema.Types.ObjectId as any, ref: 'Branch', index: true },
  direction: { type: String, enum: ['inbound', 'outbound'], required: true, index: true },
  sender: { type: String, enum: ['customer', 'agent', 'system'], required: true },
  content: { type: String, required: true },
  channel: { type: String, required: true, index: true },
  metadata: { type: Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
});

MessageSchema.index({ conversationId: 1, createdAt: 1 });
MessageSchema.index({ leadId: 1, createdAt: -1 });
MessageSchema.index({ companyId: 1, createdAt: -1 });

export const Message = model<IMessageDoc>('Message', MessageSchema);

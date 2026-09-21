import { Schema, model, Document } from 'mongoose';

export interface IWhatsAppIntegrationDoc extends Document {
  companyId: string;
  phoneNumberId?: string;
  phoneNumber?: string;
  accessToken?: string;
  verifyToken?: string;
  status: 'active' | 'inactive' | 'pending';
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const WhatsAppIntegrationSchema = new Schema<IWhatsAppIntegrationDoc>({
  companyId: { type: Schema.Types.ObjectId as any, ref: 'Company', required: true, index: true },
  phoneNumberId: { type: String, index: true },
  phoneNumber: { type: String, trim: true, index: true },
  accessToken: { type: String, select: false },
  verifyToken: { type: String, select: false },
  status: { type: String, enum: ['active', 'inactive', 'pending'], default: 'pending', index: true },
  metadata: { type: Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
});

WhatsAppIntegrationSchema.index({ companyId: 1, status: 1 });

export const WhatsAppIntegration = model<IWhatsAppIntegrationDoc>('WhatsAppIntegration', WhatsAppIntegrationSchema);

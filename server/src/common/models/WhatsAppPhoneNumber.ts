import { Schema, model, Document } from 'mongoose';

export interface IWhatsAppPhoneNumberDoc extends Document {
  phoneNumberId: string;
  phoneNumber?: string;
  companyId: string;
  branchId?: string;
  integrationId: string;
  displayName?: string;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

const WhatsAppPhoneNumberSchema = new Schema<IWhatsAppPhoneNumberDoc>({
  phoneNumberId: { type: String, required: true, unique: true },
  phoneNumber: { type: String, trim: true, index: true },
  companyId: { type: Schema.Types.ObjectId as any, ref: 'Company', required: true, index: true },
  branchId: { type: Schema.Types.ObjectId as any, ref: 'Branch', index: true },
  integrationId: { type: Schema.Types.ObjectId as any, ref: 'WhatsAppIntegration', required: true, index: true },
  displayName: { type: String, trim: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
}, {
  timestamps: true,
});

WhatsAppPhoneNumberSchema.index({ companyId: 1, status: 1 });

export const WhatsAppPhoneNumber = model<IWhatsAppPhoneNumberDoc>('WhatsAppPhoneNumber', WhatsAppPhoneNumberSchema);

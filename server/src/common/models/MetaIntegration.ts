import { Schema, model, Document } from 'mongoose';
import { encryptToken, isEncrypted } from '../security/tokenCrypto';

export interface IMetaIntegrationDoc extends Document {
  companyId: string;
  appId?: string;
  appSecret?: string;
  accessToken?: string;
  tokenExpiresAt?: Date;
  scopes?: string[];
  verifyToken?: string;
  status: 'active' | 'inactive' | 'pending' | 'expired';
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const MetaIntegrationSchema = new Schema<IMetaIntegrationDoc>({
  companyId: { type: Schema.Types.ObjectId as any, ref: 'Company', required: true, index: true },
  appId: { type: String, index: true },
  appSecret: { type: String, select: false },
  accessToken: { type: String, select: false },
  tokenExpiresAt: { type: Date },
  scopes: { type: [String], default: [] },
  verifyToken: { type: String, select: false },
  status: { type: String, enum: ['active', 'inactive', 'pending', 'expired'], default: 'pending', index: true },
  metadata: { type: Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
});

MetaIntegrationSchema.index({ companyId: 1, status: 1 });

// Encrypt secrets at rest. The decryptToken() helper transparently reads back
// legacy plaintext (dev fixtures), so existing rows keep working.
MetaIntegrationSchema.pre('save', function (next) {
  const doc = this as IMetaIntegrationDoc;
  for (const field of ['accessToken', 'appSecret'] as const) {
    const value = doc[field];
    if (typeof value === 'string' && value && !isEncrypted(value) && this.isModified(field)) {
      doc[field] = encryptToken(value);
    }
  }
  next();
});

export const MetaIntegration = model<IMetaIntegrationDoc>('MetaIntegration', MetaIntegrationSchema);

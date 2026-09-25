import { Schema, model, Document } from 'mongoose';
import { encryptToken, isEncrypted } from '../security/tokenCrypto';

export interface IMetaIntegrationDoc extends Document {
  companyId: string;
  portfolioBusinessId?: string;
  label?: string;
  appId?: string;
  appSecret?: string;
  accessToken?: string;
  tokenExpiresAt?: Date;
  scopes?: string[];
  desiredScopes?: string[];
  verifyToken?: string;
  status: 'active' | 'inactive' | 'pending' | 'expired';
  metadata?: Record<string, unknown>;
  /** Conversions API dataset (pixel) id for downstream event feedback. */
  capiDatasetId?: string;
  /** When false, CAPI sends are refused even if a dataset is configured. */
  capiEnabled?: boolean;
  /** Optional Meta test event code (server-side Test Events view). */
  capiTestEventCode?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MetaIntegrationSchema = new Schema<IMetaIntegrationDoc>({
  companyId: { type: Schema.Types.ObjectId as any, ref: 'Company', required: true, index: true },
  portfolioBusinessId: { type: String, index: true },
  label: { type: String, trim: true },
  appId: { type: String, index: true },
  appSecret: { type: String, select: false },
  accessToken: { type: String, select: false },
  tokenExpiresAt: { type: Date },
  scopes: { type: [String], default: [] },
  desiredScopes: { type: [String], default: [] },
  verifyToken: { type: String, select: false },
  status: { type: String, enum: ['active', 'inactive', 'pending', 'expired'], default: 'pending', index: true },
  metadata: { type: Schema.Types.Mixed, default: {} },
  capiDatasetId: { type: String, trim: true, index: true },
  capiEnabled: { type: Boolean, default: true },
  capiTestEventCode: { type: String, trim: true },
}, {
  timestamps: true,
});

MetaIntegrationSchema.index({ companyId: 1, status: 1 });
// One row per (company, portfolio). Sparse so legacy single-integration rows
// (no portfolio id) keep working untouched.
MetaIntegrationSchema.index({ companyId: 1, portfolioBusinessId: 1 }, { unique: true, sparse: true });

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

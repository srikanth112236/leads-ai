import { Schema, model, Document, Types } from 'mongoose';

/**
 * Per-person campaign grant.
 *
 * Tiered access model:
 *   Tier 1 (branch scope)  – which branches the user belongs to (memberships).
 *   Tier 2 (RBAC)          – what actions the role allows (campaigns:read/assign …).
 *   Tier 3 (this model)    – WHICH campaigns inside those branches.
 *
 * Narrowing rule: a restricted user WITH active grant rows sees exactly the
 * granted campaigns. A restricted user with NO rows inherits the whole branch
 * scope (backward compatible). Privileged company roles bypass grants.
 */
export type CampaignAccessLevel = 'view' | 'manage';

export interface ICampaignAssignmentDoc extends Document {
  companyId: Types.ObjectId;
  branchId?: Types.ObjectId;
  /** Meta marketing campaign id (the `campaignId` string used across Meta docs). */
  campaignId: string;
  campaignName?: string;
  userId: Types.ObjectId;
  access: CampaignAccessLevel;
  grantedBy?: Types.ObjectId;
  /** Optional expiry – expired rows are treated as inactive on read. */
  expiresAt?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CampaignAssignmentSchema = new Schema<ICampaignAssignmentDoc>(
  {
    companyId: { type: Schema.Types.ObjectId as any, ref: 'Company', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId as any, ref: 'Branch', index: true },
    campaignId: { type: String, required: true, trim: true, index: true },
    campaignName: { type: String, trim: true },
    userId: { type: Schema.Types.ObjectId as any, ref: 'User', required: true, index: true },
    access: { type: String, enum: ['view', 'manage'], default: 'view', index: true },
    grantedBy: { type: Schema.Types.ObjectId as any, ref: 'User' },
    expiresAt: { type: Date, index: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

CampaignAssignmentSchema.index({ companyId: 1, userId: 1, isActive: 1 });
CampaignAssignmentSchema.index({ companyId: 1, campaignId: 1, userId: 1 }, { unique: true });
CampaignAssignmentSchema.index({ companyId: 1, branchId: 1 });

export const CampaignAssignment = model<ICampaignAssignmentDoc>(
  'CampaignAssignment',
  CampaignAssignmentSchema,
);

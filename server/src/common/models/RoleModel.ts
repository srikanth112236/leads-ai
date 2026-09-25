import { Schema, model, Document, Types } from 'mongoose';

export interface IRoleDoc extends Document {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  companyId?: Types.ObjectId;
  permissions: string[];
  isSystem: boolean;
  rank: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const RoleSchema = new Schema<IRoleDoc>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    description: { type: String, trim: true, default: '' },
    companyId: { type: Schema.Types.ObjectId as any, ref: 'Company', default: null, index: true },
    permissions: [{ type: String, trim: true }],
    isSystem: { type: Boolean, default: false, index: true },
    rank: { type: Number, default: 50, index: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  {
    timestamps: true,
  }
);

RoleSchema.index({ companyId: 1, slug: 1 }, { unique: true });
RoleSchema.index({ companyId: 1, isActive: 1 });

export const RoleModel = model<IRoleDoc>('Role', RoleSchema);

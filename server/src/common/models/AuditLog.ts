import { Schema, model, Document } from 'mongoose';

export interface IAuditLogDoc extends Document {
  actorId?: string;
  action: string;
  companyId?: string;
  branchId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLogDoc>({
  actorId: { type: Schema.Types.ObjectId as any, ref: 'User', index: true },
  action: { type: String, required: true, index: true },
  companyId: { type: Schema.Types.ObjectId as any, ref: 'Company', index: true },
  branchId: { type: Schema.Types.ObjectId as any, ref: 'Branch', index: true },
  metadata: { type: Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
});

AuditLogSchema.index({ companyId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });

export const AuditLog = model<IAuditLogDoc>('AuditLog', AuditLogSchema);

import { Schema, model, Document } from 'mongoose';

export interface INotificationDoc extends Document {
  userId?: string;
  companyId: string;
  branchId?: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  read: boolean;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotificationDoc>({
  userId: { type: Schema.Types.ObjectId as any, ref: 'User', index: true },
  companyId: { type: Schema.Types.ObjectId as any, ref: 'Company', required: true, index: true },
  branchId: { type: Schema.Types.ObjectId as any, ref: 'Branch', index: true },
  type: { type: String, required: true, index: true },
  title: { type: String, required: true },
  body: { type: String, required: true },
  data: { type: Schema.Types.Mixed, default: {} },
  read: { type: Boolean, default: false, index: true },
}, {
  timestamps: true,
});

NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
NotificationSchema.index({ companyId: 1, createdAt: -1 });

export const Notification = model<INotificationDoc>('Notification', NotificationSchema);

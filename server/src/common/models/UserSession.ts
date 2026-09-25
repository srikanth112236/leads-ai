import { Schema, model, Document } from 'mongoose';

/**
 * Concurrent-device control. One account may hold at most MAX_ACTIVE_SESSIONS
 * live sessions; a further login parks as `pending` until an active device
 * allows/denies it (or it expires after 60s).
 */
export type UserSessionStatus = 'active' | 'pending' | 'revoked' | 'denied' | 'expired';

export const MAX_ACTIVE_SESSIONS = 3;
export const PENDING_SESSION_TTL_SECONDS = 60;

export interface IUserSessionDoc extends Document {
  userId: string;
  deviceId: string;
  deviceName?: string;
  deviceKind: 'web' | 'mobile';
  ip?: string;
  userAgent?: string;
  status: UserSessionStatus;
  expiresAt: Date;
  lastSeenAt: Date;
  /** Who approved/denied/trusted this request (owner or logins:approve holder). */
  decidedBy?: string;
  decidedAt?: Date;
  /** Access-extension bookkeeping: sessions predating accessExtendedAt die past reauthDeadline. */
  accessExtendedAt?: Date;
  reauthDeadline?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSessionSchema = new Schema<IUserSessionDoc>(
  {
    userId: { type: Schema.Types.ObjectId as any, ref: 'User', required: true, index: true },
    deviceId: { type: String, required: true, trim: true, index: true },
    deviceName: { type: String, trim: true },
    deviceKind: { type: String, enum: ['web', 'mobile'], default: 'web', index: true },
    ip: { type: String, trim: true },
    userAgent: { type: String, trim: true },
    decidedBy: { type: Schema.Types.ObjectId as any, ref: 'User' },
    decidedAt: { type: Date },
    accessExtendedAt: { type: Date },
    reauthDeadline: { type: Date },
    status: {
      type: String,
      enum: ['active', 'pending', 'revoked', 'denied', 'expired'],
      default: 'pending',
      index: true,
    },
    expiresAt: { type: Date, required: true },
    lastSeenAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

UserSessionSchema.index({ userId: 1, status: 1 });
UserSessionSchema.index({ userId: 1, deviceId: 1, status: 1 });
UserSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const UserSession = model<IUserSessionDoc>('UserSession', UserSessionSchema);

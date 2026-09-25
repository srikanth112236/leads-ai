import { Schema, model, Document } from 'mongoose';

/**
 * Devices the user explicitly trusts. A trusted device skips the
 * approve-on-new-device popup. Trust lasts 90 days (expiresAt TTL purges it
 * automatically), after which the next login asks for approval again –
 * periodic re-verification against stolen devices.
 */
export const TRUSTED_DEVICE_TTL_DAYS = 90;

export interface ITrustedDeviceDoc extends Document {
  userId: string;
  deviceId: string;
  deviceName?: string;
  trustedAt: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TrustedDeviceSchema = new Schema<ITrustedDeviceDoc>(
  {
    userId: { type: Schema.Types.ObjectId as any, ref: 'User', required: true, index: true },
    deviceId: { type: String, required: true, trim: true, index: true },
    deviceName: { type: String, trim: true },
    trustedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

TrustedDeviceSchema.index({ userId: 1, deviceId: 1 }, { unique: true });
TrustedDeviceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const TrustedDevice = model<ITrustedDeviceDoc>('TrustedDevice', TrustedDeviceSchema);

export function trustedDeviceExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + TRUSTED_DEVICE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

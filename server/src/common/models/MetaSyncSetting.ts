import { Schema, model, Document } from 'mongoose';

export interface IMetaSyncSettingDoc extends Document {
  companyId: string;
  enabled: boolean;
  intervalMinutes: number;
  lastRunAt?: Date;
  lastResult?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MetaSyncSettingSchema = new Schema<IMetaSyncSettingDoc>({
  companyId: { type: Schema.Types.ObjectId as any, ref: 'Company', required: true, unique: true, index: true },
  enabled: { type: Boolean, default: true },
  intervalMinutes: { type: Number, default: 30, min: 5, max: 1440 },
  lastRunAt: { type: Date },
  lastResult: { type: String },
}, {
  timestamps: true,
});

export const MetaSyncSetting = model<IMetaSyncSettingDoc>('MetaSyncSetting', MetaSyncSettingSchema);

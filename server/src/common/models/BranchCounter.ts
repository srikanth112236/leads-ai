import { Schema, model, Document } from 'mongoose';

// Per-company branch code sequence. Atomic $inc guarantees unique codes
// even under concurrent branch creation.
export interface IBranchCounterDoc extends Document {
  companyId: string;
  seq: number;
}

const BranchCounterSchema = new Schema<IBranchCounterDoc>({
  companyId: { type: Schema.Types.ObjectId as any, ref: 'Company', required: true, unique: true },
  seq: { type: Number, default: 0 },
});

export const BranchCounter = model<IBranchCounterDoc>('BranchCounter', BranchCounterSchema);

export async function nextBranchCode(companyId: string, companyName: string): Promise<string> {
  const counter = await BranchCounter.findOneAndUpdate(
    { companyId },
    { $inc: { seq: 1 } },
    { upsert: true, new: true },
  );
  const prefix = (companyName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3) || 'BR').toUpperCase();
  return `BR-${prefix}-${String(counter.seq).padStart(3, '0')}`;
}

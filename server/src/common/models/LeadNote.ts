import { Schema, model, Document } from 'mongoose';

export interface ILeadNoteDoc extends Document {
  leadId: string;
  companyId: string;
  branchId?: string;
  authorId: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}

const LeadNoteSchema = new Schema<ILeadNoteDoc>({
  leadId: { type: Schema.Types.ObjectId as any, ref: 'Lead', required: true, index: true },
  companyId: { type: Schema.Types.ObjectId as any, ref: 'Company', required: true, index: true },
  branchId: { type: Schema.Types.ObjectId as any, ref: 'Branch', index: true },
  authorId: { type: Schema.Types.ObjectId as any, ref: 'User', required: true },
  body: { type: String, required: true, trim: true, maxlength: 5000 },
}, {
  timestamps: true,
});

LeadNoteSchema.index({ leadId: 1, createdAt: -1 });
LeadNoteSchema.index({ companyId: 1, createdAt: -1 });

export const LeadNote = model<ILeadNoteDoc>('LeadNote', LeadNoteSchema);

import { Schema, model, Document } from 'mongoose';

export type FormFieldType =
  | 'text'
  | 'email'
  | 'phone'
  | 'number'
  | 'date'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'textarea';

export interface IFormField {
  id: string;
  label: string;
  type: FormFieldType;
  placeholder?: string;
  required: boolean;
  options?: string[];
  defaultValue?: string;
  order?: number;
}

export interface IWebsiteLeadFormDoc extends Document {
  companyId: string;
  branchId?: string;
  name: string;
  description?: string;
  publicKey: string;
  fields: IFormField[];
  submitButtonText?: string;
  successMessage?: string;
  tags?: string[];
  allowedDomains: string[];
  status: 'active' | 'inactive';
  submissionsCount: number;
  lastSubmissionAt?: Date;
  configuration: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const FormFieldSchema = new Schema<IFormField>({
  id: { type: String, required: true },
  label: { type: String, required: true },
  type: {
    type: String,
    enum: ['text', 'email', 'phone', 'number', 'date', 'select', 'radio', 'checkbox', 'textarea'],
    default: 'text',
  },
  placeholder: { type: String, default: '' },
  required: { type: Boolean, default: false },
  options: { type: [String], default: [] },
  defaultValue: { type: String, default: '' },
  order: { type: Number, default: 0 },
}, { _id: false });

const WebsiteLeadFormSchema = new Schema<IWebsiteLeadFormDoc>({
  companyId: { type: Schema.Types.ObjectId as any, ref: 'Company', required: true, index: true },
  branchId: { type: Schema.Types.ObjectId as any, ref: 'Branch', index: true },
  name: { type: String, required: true, default: 'Website Inquiry Form' },
  description: { type: String, default: '' },
  publicKey: { type: String, required: true, unique: true, index: true },
  fields: { type: [FormFieldSchema], default: [] },
  submitButtonText: { type: String, default: 'Submit Inquiry' },
  successMessage: { type: String, default: 'Thank you! Your request has been received. Our team will contact you shortly.' },
  tags: { type: [String], default: ['Website Form'] },
  allowedDomains: { type: [String], default: [] },
  status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
  submissionsCount: { type: Number, default: 0 },
  lastSubmissionAt: { type: Date },
  configuration: { type: Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
});

WebsiteLeadFormSchema.index({ companyId: 1, status: 1 });
WebsiteLeadFormSchema.index({ companyId: 1, branchId: 1 });

export const WebsiteLeadForm = model<IWebsiteLeadFormDoc>('WebsiteLeadForm', WebsiteLeadFormSchema);

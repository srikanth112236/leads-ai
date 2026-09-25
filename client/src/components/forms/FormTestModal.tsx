import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../common/Modal';
import Button from '../common/Button';
import CustomSelect from '../common/CustomSelect';
import Toggle from '../common/Toggle';
import { useToast } from '../common/Toast';
import axios from 'axios';
import { Sparkles, CheckCircle2, ArrowRight, Building2, Tag } from 'lucide-react';

interface FormTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  form: any | null;
}

export const FormTestModal: React.FC<FormTestModalProps> = ({
  isOpen,
  onClose,
  form,
}) => {
  const toast = useToast();
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<any | null>(null);

  // Initialize form fields with sensible test presets
  useEffect(() => {
    if (form && isOpen) {
      setSubmissionResult(null);
      const initial: Record<string, any> = {};
      (form.fields || []).forEach((f: any) => {
        if (f.type === 'text') {
          initial[f.id] = f.id.includes('name') ? 'Sarah Connor' : (f.placeholder || '');
        } else if (f.type === 'phone') {
          initial[f.id] = '+1 555 987 6543';
        } else if (f.type === 'email') {
          initial[f.id] = 'sarah.connor@testlead.com';
        } else if (f.type === 'date') {
          initial[f.id] = new Date().toISOString().split('T')[0];
        } else if (f.type === 'select' || f.type === 'radio') {
          initial[f.id] = f.options && f.options.length > 0 ? f.options[0] : '';
        } else if (f.type === 'number') {
          initial[f.id] = 2;
        } else if (f.type === 'checkbox') {
          initial[f.id] = true;
        } else if (f.type === 'textarea') {
          initial[f.id] = 'Testing website lead ingestion directly from CRM.';
        }
      });
      setFormData(initial);
    }
  }, [form, isOpen]);

  if (!form) return null;

  const handleChange = (fieldId: string, value: any) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const apiBaseUrl =
        (window as any).__API_BASE_URL__ || `${window.location.protocol}//${window.location.hostname}:3000`;
      const submitUrl = `${apiBaseUrl}/api/public/forms/${form._id}/submit`;

      const res = await axios.post(submitUrl, formData);
      if (res.data?.success) {
        setSubmissionResult(res.data.data);
        toast.success('Test Lead Ingested', 'Lead successfully created in CRM and routed to branch.');
      } else {
        toast.error('Submission Failed', res.data?.error || 'Failed to submit form');
      }
    } catch (err: any) {
      toast.error('Error', err?.response?.data?.error || err.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Live Form Tester — ${form.name}`}
      size="lg"
    >
      <div className="space-y-4 text-xs">
        {/* Header info */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-semibold text-slate-700">Live Ingestion Preview</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              {form.branchId?.name || 'Company Default Branch'}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
              <Tag className="w-3 h-3" />
              {(form.tags || ['Website Form'])[0]}
            </span>
          </div>
        </div>

        {/* Success Result View */}
        {submissionResult ? (
          <div className="p-6 bg-emerald-50/70 border border-emerald-200 rounded-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900">Lead Created Successfully!</h3>
              <p className="text-xs text-slate-600 max-w-md mx-auto mt-1">
                {submissionResult.message || form.successMessage}
              </p>
              <p className="font-mono text-[11px] text-slate-400 mt-2">
                Lead ID: {submissionResult.leadId}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Link
                to={`/leads/${submissionResult.leadId}`}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 shadow-xs"
                onClick={onClose}
              >
                <span>View Inbound Lead in CRM</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSubmissionResult(null)}
                className="bg-white border-slate-200 text-slate-700"
              >
                Submit Another Test
              </Button>
            </div>
          </div>
        ) : (
          /* The Form View */
          <form onSubmit={handleSubmit} className="space-y-4">
            {form.description && (
              <p className="text-xs text-slate-500 italic">{form.description}</p>
            )}

            <div className="space-y-3 max-h-[440px] overflow-y-auto pr-1">
              {(form.fields || []).map((field: any) => {
                const value = formData[field.id] ?? '';

                return (
                  <div key={field.id} className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      {field.label} {field.required && <span className="text-red-500">*</span>}
                    </label>

                    {/* TEXTAREA */}
                    {field.type === 'textarea' ? (
                      <textarea
                        value={value}
                        onChange={(e) => handleChange(field.id, e.target.value)}
                        placeholder={field.placeholder || ''}
                        required={field.required}
                        rows={3}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-indigo-500 bg-white"
                      />
                    ) : /* SELECT */ field.type === 'select' ? (
                      <CustomSelect
                        value={value || ''}
                        onChange={(val) => handleChange(field.id, val)}
                        options={(field.options || []).map((opt: string) => ({ value: opt, label: opt }))}
                        placeholder={field.placeholder || 'Select an option…'}
                        searchable={(field.options || []).length > 6}
                      />
                    ) : /* RADIO */ field.type === 'radio' ? (
                      <div className="flex flex-wrap gap-3 pt-1">
                        {(field.options || []).map((opt: string, idx: number) => (
                          <label key={idx} className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="radio"
                              name={field.id}
                              value={opt}
                              checked={value === opt}
                              onChange={() => handleChange(field.id, opt)}
                              required={field.required}
                              className="text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-xs text-slate-700 font-medium">{opt}</span>
                          </label>
                        ))}
                      </div>
                    ) : /* CHECKBOX */ field.type === 'checkbox' ? (
                      <div className="pt-1">
                        <Toggle
                          checked={Boolean(value)}
                          onChange={(checked) => handleChange(field.id, checked)}
                          label={field.placeholder || field.label}
                        />
                      </div>
                    ) : /* DATE */ field.type === 'date' ? (
                      <input
                        type="date"
                        value={value}
                        onChange={(e) => handleChange(field.id, e.target.value)}
                        required={field.required}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-indigo-500 bg-white font-mono"
                      />
                    ) : (
                      /* DEFAULT INPUT (text, email, phone, number) */
                      <input
                        type={field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
                        value={value}
                        onChange={(e) => handleChange(field.id, e.target.value)}
                        placeholder={field.placeholder || ''}
                        required={field.required}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-indigo-500 bg-white"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>

              <Button type="submit" loading={submitting} className="font-bold shadow-xs">
                <Sparkles className="w-3.5 h-3.5" />
                {form.submitButtonText || 'Submit Inquiry'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
};

export default FormTestModal;

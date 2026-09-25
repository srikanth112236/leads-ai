import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import CustomSelect from '../components/common/CustomSelect';
import Toggle from '../components/common/Toggle';

export const PublicFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [form, setForm] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [responseMessage, setResponseMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchForm = async () => {
      setLoading(true);
      setError(null);
      try {
        const apiBaseUrl =
          (window as any).__API_BASE_URL__ || `${window.location.protocol}//${window.location.hostname}:3000`;
        const res = await axios.get(`${apiBaseUrl}/api/public/forms/${id}`);
        if (res.data?.success) {
          setForm(res.data.data);
          const initial: Record<string, any> = {};
          (res.data.data.fields || []).forEach((f: any) => {
            if (f.type === 'checkbox') initial[f.id] = false;
            else if (f.type === 'number') initial[f.id] = '';
            else initial[f.id] = '';
          });
          setFormData(initial);
        } else {
          setError(res.data?.error || 'Form not found');
        }
      } catch (err: any) {
        setError(err?.response?.data?.error || 'Failed to load form');
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchForm();
  }, [id]);

  const handleChange = (fieldId: string, val: any) => {
    setFormData((prev) => ({ ...prev, [fieldId]: val }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const apiBaseUrl =
        (window as any).__API_BASE_URL__ || `${window.location.protocol}//${window.location.hostname}:3000`;
      const res = await axios.post(`${apiBaseUrl}/api/public/forms/${id}/submit`, formData);
      if (res.data?.success) {
        setSubmitted(true);
        setResponseMessage(res.data.data?.message || form?.successMessage);
      } else {
        setError(res.data?.error || 'Submission failed');
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="flex items-center gap-3 text-slate-500 text-sm font-medium">
          <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <span>Loading form…</span>
        </div>
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white max-w-md w-full rounded-2xl border border-slate-200 p-8 text-center shadow-xs">
          <div className="w-12 h-12 rounded-full bg-red-50 text-red-500 flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-slate-900">Form Unavailable</h2>
          <p className="text-xs text-slate-500 mt-1">{error || 'This form does not exist or has been deactivated.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-b from-indigo-50/50 to-slate-100 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-xl bg-white rounded-3xl border border-slate-200/80 shadow-xl overflow-hidden">
        {/* Header banner */}
        <div className="bg-linear-to-r from-indigo-600 to-indigo-800 p-6 sm:p-8 text-white">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-white/20 text-white backdrop-blur-xs">
              Official Inquiry
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{form.name}</h1>
          {form.description && (
            <p className="text-xs sm:text-sm text-indigo-100 mt-1.5 leading-relaxed font-light">
              {form.description}
            </p>
          )}
        </div>

        {/* Content */}
        <div className="p-6 sm:p-8">
          {submitted ? (
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">Inquiry Received</h2>
              <p className="text-sm text-slate-600 max-w-sm mx-auto leading-relaxed">
                {responseMessage || form.successMessage || 'Thank you for reaching out! We will be in touch with you shortly.'}
              </p>
              <div className="pt-4">
                <button
                  type="button"
                  onClick={() => setSubmitted(false)}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 underline"
                >
                  Submit another response
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              {error && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-3.5">
                {(form.fields || []).map((field: any) => {
                  const value = formData[field.id] ?? '';

                  return (
                    <div key={field.id} className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-700">
                        {field.label} {field.required && <span className="text-red-500 font-bold">*</span>}
                      </label>

                      {field.type === 'textarea' ? (
                        <textarea
                          value={value}
                          onChange={(e) => handleChange(field.id, e.target.value)}
                          placeholder={field.placeholder || ''}
                          required={field.required}
                          rows={3}
                          className="w-full px-3.5 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 bg-white"
                        />
                      ) : field.type === 'select' ? (
                        <CustomSelect
                          value={value || ''}
                          onChange={(val) => handleChange(field.id, val)}
                          options={(field.options || []).map((opt: string) => ({ value: opt, label: opt }))}
                          placeholder={field.placeholder || 'Select an option…'}
                          searchable={(field.options || []).length > 6}
                        />
                      ) : field.type === 'radio' ? (
                        <div className="flex flex-wrap gap-4 pt-1">
                          {(field.options || []).map((opt: string, idx: number) => (
                            <label key={idx} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name={field.id}
                                value={opt}
                                checked={value === opt}
                                onChange={() => handleChange(field.id, opt)}
                                required={field.required}
                                className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
                              />
                              <span className="text-xs text-slate-700 font-medium">{opt}</span>
                            </label>
                          ))}
                        </div>
                      ) : field.type === 'checkbox' ? (
                        <div className="pt-1">
                          <Toggle
                            checked={Boolean(value)}
                            onChange={(checked) => handleChange(field.id, checked)}
                            label={field.placeholder || field.label}
                          />
                        </div>
                      ) : field.type === 'date' ? (
                        <input
                          type="date"
                          value={value}
                          onChange={(e) => handleChange(field.id, e.target.value)}
                          required={field.required}
                          className="w-full px-3.5 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 bg-white font-mono"
                        />
                      ) : (
                        <input
                          type={field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
                          value={value}
                          onChange={(e) => handleChange(field.id, e.target.value)}
                          placeholder={field.placeholder || ''}
                          required={field.required}
                          className="w-full px-3.5 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 bg-white"
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {submitting && (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  <span>{form.submitButtonText || 'Submit Inquiry'}</span>
                </button>
              </div>

              <div className="pt-2 text-center text-[10px] text-slate-400 flex items-center justify-center gap-1">
                <span>Secure Multi-Tenant Form by</span>
                <span className="font-semibold text-slate-600">Lead CRM</span>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default PublicFormPage;

import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Input from '../common/Input';
import Toggle from '../common/Toggle';
import CustomSelect from '../common/CustomSelect';
import { useToast } from '../common/Toast';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Layers,
  Sparkles,
  Building2,
  Type,
  Mail,
  Phone,
  Calendar,
  List,
  CheckSquare,
  Hash,
  FileText,
  Radio,
} from 'lucide-react';

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

export interface FormFieldItem {
  id: string;
  label: string;
  type: FormFieldType;
  placeholder?: string;
  required: boolean;
  options?: string[];
  defaultValue?: string;
  order?: number;
}

interface WebFormBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  formToEdit?: any | null;
  branches: any[];
  onSaved: () => void;
}

const FIELD_TYPE_OPTIONS: { value: FormFieldType; label: string; icon: any }[] = [
  { value: 'text', label: 'Text Input', icon: Type },
  { value: 'phone', label: 'Phone / Mobile', icon: Phone },
  { value: 'email', label: 'Email Address', icon: Mail },
  { value: 'date', label: 'Date Picker', icon: Calendar },
  { value: 'select', label: 'Dropdown Select', icon: List },
  { value: 'radio', label: 'Radio Choices', icon: Radio },
  { value: 'number', label: 'Number / Count', icon: Hash },
  { value: 'checkbox', label: 'Checkbox', icon: CheckSquare },
  { value: 'textarea', label: 'Multi-line Text', icon: FileText },
];

const CAR_BOOKING_PRESET: FormFieldItem[] = [
  { id: 'full_name', label: 'Full Name', type: 'text', placeholder: 'e.g. John Doe', required: true, order: 0 },
  { id: 'phone', label: 'Mobile Number', type: 'phone', placeholder: '+1 (555) 000-0000', required: true, order: 1 },
  { id: 'email', label: 'Email Address', type: 'email', placeholder: 'john@example.com', required: false, order: 2 },
  { id: 'pickup_date', label: 'Pickup Date', type: 'date', placeholder: '', required: true, order: 3 },
  {
    id: 'car_type',
    label: 'Preferred Vehicle',
    type: 'select',
    placeholder: 'Select a vehicle category',
    required: true,
    options: ['Economy Sedan', 'Compact SUV', 'Full-size SUV', 'Executive Luxury', '7-Seater Van'],
    order: 4,
  },
  { id: 'rental_duration', label: 'Duration (Days)', type: 'number', placeholder: 'e.g. 3', required: false, order: 5 },
  { id: 'pickup_city', label: 'Pickup Location / City', type: 'text', placeholder: 'e.g. Downtown Airport', required: false, order: 6 },
  { id: 'special_notes', label: 'Special Instructions', type: 'textarea', placeholder: 'Flight number, baby seat request, etc.', required: false, order: 7 },
];

const GENERAL_INQUIRY_PRESET: FormFieldItem[] = [
  { id: 'full_name', label: 'Full Name', type: 'text', placeholder: 'Enter your name', required: true, order: 0 },
  { id: 'phone', label: 'Phone Number', type: 'phone', placeholder: 'Enter phone number', required: true, order: 1 },
  { id: 'email', label: 'Email Address', type: 'email', placeholder: 'name@company.com', required: false, order: 2 },
  { id: 'inquiry_type', label: 'Inquiry Category', type: 'select', placeholder: 'Select category', required: false, options: ['Sales Quote', 'Customer Support', 'Booking Inquiry', 'Partnership'], order: 3 },
  { id: 'message', label: 'Message', type: 'textarea', placeholder: 'Describe your requirement…', required: true, order: 4 },
];

export const WebFormBuilderModal: React.FC<WebFormBuilderModalProps> = ({
  isOpen,
  onClose,
  formToEdit,
  branches,
  onSaved,
}) => {
  const { activeBranchId } = useAuth();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'fields' | 'settings'>('fields');
  const [saving, setSaving] = useState(false);

  // Form Details
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [branchId, setBranchId] = useState(activeBranchId || '');
  const [submitButtonText, setSubmitButtonText] = useState('Submit Inquiry');
  const [successMessage, setSuccessMessage] = useState(
    'Thank you! Your request has been received. Our team will contact you shortly.'
  );
  const [tagsStr, setTagsStr] = useState('Website Form');
  const [allowedDomainsStr, setAllowedDomainsStr] = useState('');
  const [fields, setFields] = useState<FormFieldItem[]>(CAR_BOOKING_PRESET);

  // State for new field or options editing
  const [newOptionInputs, setNewOptionInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (formToEdit) {
      setName(formToEdit.name || '');
      setDescription(formToEdit.description || '');
      setBranchId(formToEdit.branchId?._id || formToEdit.branchId || '');
      setSubmitButtonText(formToEdit.submitButtonText || 'Submit Inquiry');
      setSuccessMessage(
        formToEdit.successMessage ||
          'Thank you! Your request has been received. Our team will contact you shortly.'
      );
      setTagsStr((formToEdit.tags || ['Website Form']).join(', '));
      setAllowedDomainsStr((formToEdit.allowedDomains || []).join(', '));
      setFields(
        Array.isArray(formToEdit.fields) && formToEdit.fields.length > 0
          ? formToEdit.fields
          : CAR_BOOKING_PRESET
      );
    } else {
      setName('');
      setDescription('');
      setBranchId(activeBranchId || '');
      setSubmitButtonText('Submit Inquiry');
      setSuccessMessage('Thank you! Your request has been received. Our team will contact you shortly.');
      setTagsStr('Website Form');
      setAllowedDomainsStr('');
      setFields(CAR_BOOKING_PRESET);
    }
  }, [formToEdit, isOpen, activeBranchId]);

  const handleAddField = (type: FormFieldType = 'text') => {
    const nextIdx = fields.length + 1;
    const defaultLabels: Record<FormFieldType, string> = {
      text: `Custom Field ${nextIdx}`,
      phone: 'Mobile Phone',
      email: 'Email Address',
      date: 'Preferred Date',
      select: 'Select Option',
      radio: 'Choose One',
      number: 'Quantity / Days',
      checkbox: 'I agree to the terms',
      textarea: 'Additional Details',
    };

    const newField: FormFieldItem = {
      id: `field_${Date.now().toString(36)}`,
      label: defaultLabels[type] || `Field ${nextIdx}`,
      type,
      placeholder: '',
      required: false,
      options: type === 'select' || type === 'radio' ? ['Option 1', 'Option 2'] : [],
      order: fields.length,
    };
    setFields([...fields, newField]);
  };

  const handleUpdateField = (index: number, updates: Partial<FormFieldItem>) => {
    const updated = [...fields];
    updated[index] = { ...updated[index], ...updates };
    setFields(updated);
  };

  const handleDeleteField = (index: number) => {
    if (fields.length <= 1) {
      toast.error('Validation Error', 'Forms must have at least one field');
      return;
    }
    setFields(fields.filter((_, i) => i !== index));
  };

  const handleMoveField = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= fields.length) return;
    const updated = [...fields];
    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;
    setFields(updated.map((f, i) => ({ ...f, order: i })));
  };

  const handleAddOption = (fieldIndex: number) => {
    const field = fields[fieldIndex];
    const val = (newOptionInputs[field.id] || '').trim();
    if (!val) return;
    const currentOptions = field.options || [];
    handleUpdateField(fieldIndex, { options: [...currentOptions, val] });
    setNewOptionInputs({ ...newOptionInputs, [field.id]: '' });
  };

  const handleRemoveOption = (fieldIndex: number, optionIndex: number) => {
    const field = fields[fieldIndex];
    const updatedOptions = (field.options || []).filter((_, i) => i !== optionIndex);
    handleUpdateField(fieldIndex, { options: updatedOptions });
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Validation Error', 'Please enter a Form Name');
      setActiveTab('settings');
      return;
    }
    if (fields.length === 0) {
      toast.error('Validation Error', 'Please add at least one field to your form');
      setActiveTab('fields');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        branchId: branchId || null,
        submitButtonText: submitButtonText.trim() || 'Submit Inquiry',
        successMessage: successMessage.trim(),
        tags: tagsStr
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        allowedDomains: allowedDomainsStr
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean),
        fields: fields.map((f, idx) => ({ ...f, order: idx })),
      };

      if (formToEdit?._id) {
        await api.put(`/forms/${formToEdit._id}`, payload);
        toast.success('Form Updated', 'Your web form schema has been updated successfully.');
      } else {
        await api.post('/forms', payload);
        toast.success('Form Created', 'New web form created! Public submission API is now ready.');
      }
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error('Save Failed', err?.response?.data?.error || 'Failed to save form');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={formToEdit ? `Edit Form: ${formToEdit.name}` : 'Create Web Lead Form & Connect'}
      size="xl"
    >
      <div className="space-y-4 text-xs">
        {/* Navigation tabs */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('fields')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'fields'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Form Fields ({fields.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'settings'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Branch & Settings</span>
            </button>
          </div>

          {/* Quick presets */}
          {!formToEdit && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-400 font-medium">Templates:</span>
              <button
                type="button"
                onClick={() => {
                  setName('Car Booking Inquiry');
                  setFields(CAR_BOOKING_PRESET);
                  toast.info('Applied Car Booking Template');
                }}
                className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 font-semibold text-[10px]"
              >
                Car Booking
              </button>
              <button
                type="button"
                onClick={() => {
                  setName('General Contact Form');
                  setFields(GENERAL_INQUIRY_PRESET);
                  toast.info('Applied General Inquiry Template');
                }}
                className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 font-semibold text-[10px]"
              >
                Contact Us
              </button>
            </div>
          )}
        </div>

        {/* TAB 1: FORM FIELDS BUILDER */}
        {activeTab === 'fields' && (
          <div className="space-y-4">
            {/* Quick add field buttons bar */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  Add Field to Form:
                </span>
                <span className="text-[10px] text-slate-400 font-medium">
                  Click any field type to append
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {FIELD_TYPE_OPTIONS.map((f) => {
                  const Icon = f.icon;
                  return (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => handleAddField(f.value)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/50 transition-all text-xs font-semibold shadow-2xs"
                    >
                      <Icon className="w-3 h-3 text-indigo-500" />
                      <span>{f.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Fields List */}
            <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
              {fields.map((field, idx) => (
                <div
                  key={field.id}
                  className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs hover:border-indigo-200 transition-all space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-[10px]">
                        {idx + 1}
                      </span>
                      <span className="px-2 py-0.5 rounded-md font-mono text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {field.type}
                      </span>
                      <span className="font-mono text-[10px] text-slate-400">key: {field.id}</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleMoveField(idx, 'up')}
                        disabled={idx === 0}
                        className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30"
                        title="Move Up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveField(idx, 'down')}
                        disabled={idx === fields.length - 1}
                        className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30"
                        title="Move Down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteField(idx)}
                        className="p-1 rounded text-red-500 hover:text-red-700 hover:bg-red-50 ml-1"
                        title="Delete Field"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="sm:col-span-1">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Field Label *
                      </label>
                      <Input
                        value={field.label}
                        onChange={(e) =>
                          handleUpdateField(idx, {
                            label: e.target.value,
                            id:
                              field.id.startsWith('field_')
                                ? e.target.value
                                    .toLowerCase()
                                    .replace(/[^a-z0-9]/g, '_')
                                    .replace(/^_+|_+$/g, '') || field.id
                                : field.id,
                          })
                        }
                        placeholder="e.g. Pickup Date"
                      />
                    </div>

                    <div className="sm:col-span-1">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Placeholder / Hint
                      </label>
                      <Input
                        value={field.placeholder || ''}
                        onChange={(e) => handleUpdateField(idx, { placeholder: e.target.value })}
                        placeholder="e.g. Enter date"
                      />
                    </div>

                    <div className="sm:col-span-1 flex items-center justify-between pt-5">
                      <Toggle
                        checked={field.required}
                        onChange={(checked) => handleUpdateField(idx, { required: checked })}
                        label="Required Field"
                        size="sm"
                      />
                    </div>
                  </div>

                  {/* Special options editor for select and radio */}
                  {(field.type === 'select' || field.type === 'radio') && (
                    <div className="pt-2 border-t border-slate-100 space-y-2 bg-slate-50/70 p-2.5 rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-700">Dropdown Choices / Options:</span>
                        <span className="text-[10px] text-slate-400">Values that user can select</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(field.options || []).map((opt, optIdx) => (
                          <span
                            key={optIdx}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-800 text-xs font-medium shadow-2xs"
                          >
                            <span>{opt}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveOption(idx, optIdx)}
                              className="text-slate-400 hover:text-red-600 font-bold"
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>

                      <div className="flex gap-2 pt-1">
                        <input
                          type="text"
                          value={newOptionInputs[field.id] || ''}
                          onChange={(e) =>
                            setNewOptionInputs({ ...newOptionInputs, [field.id]: e.target.value })
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddOption(idx);
                            }
                          }}
                          placeholder="Type option name (e.g. Economy Sedan) and press Add"
                          className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:border-indigo-500"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => handleAddOption(idx)}
                          className="shrink-0 font-bold text-xs"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add Option
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 2: SETTINGS & BRANCH ASSIGNMENT */}
        {activeTab === 'settings' && (
          <div className="space-y-4 max-h-[460px] overflow-y-auto pr-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">Form Name *</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Website Car Booking Widget"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">Description (Internal or Subtitle)</label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Inbound leads from car rental pricing calculator"
                />
              </div>

              {/* Scoped Branch Assignment */}
              <div className="sm:col-span-2 p-3.5 bg-indigo-50/60 border border-indigo-100 rounded-xl space-y-2">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-indigo-600" />
                  <div>
                    <p className="text-xs font-bold text-indigo-950">Target Branch Routing</p>
                    <p className="text-[11px] text-indigo-800">
                      When leads submit this web form, automatically lock and assign them to this branch.
                    </p>
                  </div>
                </div>

                <div className="w-full sm:w-72 pt-1">
                  <CustomSelect
                    value={branchId}
                    placeholder="Select branch for incoming leads..."
                    options={[
                      { value: '', label: 'Company Default Branch' },
                      ...branches.map((b) => ({ value: b._id, label: b.name })),
                    ]}
                    onChange={(val) => setBranchId(val)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Submit Button Text</label>
                <Input
                  value={submitButtonText}
                  onChange={(e) => setSubmitButtonText(e.target.value)}
                  placeholder="e.g. Book Now, Request Quote"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Auto-assigned Tags (comma-separated)</label>
                <Input
                  value={tagsStr}
                  onChange={(e) => setTagsStr(e.target.value)}
                  placeholder="e.g. Website Form, Car Booking, Priority"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">Success Thank You Message</label>
                <Input
                  value={successMessage}
                  onChange={(e) => setSuccessMessage(e.target.value)}
                  placeholder="e.g. Thank you! We will call you within 15 minutes."
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Allowed Domains (Optional Whitelist, comma-separated)
                </label>
                <Input
                  value={allowedDomainsStr}
                  onChange={(e) => setAllowedDomainsStr(e.target.value)}
                  placeholder="e.g. example.com, mycarbooking.com (leave blank to allow all)"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Leave empty if submitting from local test apps or any domain.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-100">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>

          <Button onClick={handleSave} loading={saving} className="font-bold shadow-xs">
            {formToEdit ? 'Save Changes' : 'Create & Generate API'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default WebFormBuilderModal;

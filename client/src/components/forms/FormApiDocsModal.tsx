import React, { useState } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { useToast } from '../common/Toast';
import { Copy, Check, Terminal, Code2, Globe, FileCode2 } from 'lucide-react';

interface FormApiDocsModalProps {
  isOpen: boolean;
  onClose: () => void;
  form: any | null;
}

export const FormApiDocsModal: React.FC<FormApiDocsModalProps> = ({
  isOpen,
  onClose,
  form,
}) => {
  const toast = useToast();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'curl' | 'fetch' | 'html' | 'json'>('curl');

  if (!form) return null;

  // Determine API base url
  const apiBaseUrl = (window as any).__API_BASE_URL__ || `${window.location.protocol}//${window.location.hostname}:3000`;
  const submitUrl = `${apiBaseUrl}/api/public/forms/${form._id}/submit`;

  // Generate mock payload matching the form's actual fields
  const mockPayload: Record<string, any> = {};
  (form.fields || []).forEach((field: any) => {
    switch (field.type) {
      case 'text':
        mockPayload[field.id] = field.id.includes('name') ? 'John Doe' : (field.placeholder || 'Sample text');
        break;
      case 'phone':
        mockPayload[field.id] = '+1 555 123 4567';
        break;
      case 'email':
        mockPayload[field.id] = 'john.doe@example.com';
        break;
      case 'date':
        mockPayload[field.id] = new Date().toISOString().split('T')[0];
        break;
      case 'select':
      case 'radio':
        mockPayload[field.id] = (field.options && field.options.length > 0) ? field.options[0] : 'Standard Option';
        break;
      case 'number':
        mockPayload[field.id] = 3;
        break;
      case 'checkbox':
        mockPayload[field.id] = true;
        break;
      case 'textarea':
        mockPayload[field.id] = 'Looking forward to receiving information regarding your pricing.';
        break;
      default:
        mockPayload[field.id] = 'Sample value';
    }
  });

  const jsonString = JSON.stringify(mockPayload, null, 2);

  const curlCommand = `curl -X POST "${submitUrl}" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(mockPayload)}'`;

  const fetchCode = `// Send website lead to CRM
const submitLead = async (formData) => {
  try {
    const response = await fetch('${submitUrl}', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formData),
    });

    const result = await response.json();
    if (result.success) {
      console.log('Lead created in CRM:', result.data.leadId);
      alert(result.data.message);
    } else {
      console.error('Submission failed:', result.error);
    }
  } catch (error) {
    console.error('Network error:', error);
  }
};

// Example invocation:
submitLead(${jsonString});`;

  const htmlFormCode = `<!-- Embed HTML Form into any website -->
<form action="${submitUrl}" method="POST" id="crm-web-form">
${(form.fields || [])
  .map((f: any) => {
    if (f.type === 'textarea') {
      return `  <div>
    <label for="${f.id}">${f.label}${f.required ? ' *' : ''}</label>
    <textarea name="${f.id}" id="${f.id}" placeholder="${f.placeholder || ''}" ${f.required ? 'required' : ''}></textarea>
  </div>`;
    }
    if (f.type === 'select') {
      return `  <div>
    <label for="${f.id}">${f.label}${f.required ? ' *' : ''}</label>
    <select name="${f.id}" id="${f.id}" ${f.required ? 'required' : ''}>
${(f.options || []).map((opt: string) => `      <option value="${opt}">${opt}</option>`).join('\n')}
    </select>
  </div>`;
    }
    return `  <div>
    <label for="${f.id}">${f.label}${f.required ? ' *' : ''}</label>
    <input type="${f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : 'text'}" name="${f.id}" id="${f.id}" placeholder="${f.placeholder || ''}" ${f.required ? 'required' : ''} />
  </div>`;
  })
  .join('\n')}
  <button type="submit">${form.submitButtonText || 'Submit'}</button>
</form>`;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success('Copied to Clipboard');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Developer Integration & Public API — ${form.name}`}
      size="xl"
    >
      <div className="space-y-4 text-xs">
        {/* Banner */}
        <div className="p-3 bg-amber-50/80 border border-amber-200/80 rounded-xl text-amber-900 leading-relaxed">
          <p className="font-bold flex items-center gap-1.5 text-xs text-amber-950">
            <Globe className="w-4 h-4 text-amber-600" />
            Public Multi-Tenant Inbound Endpoint
          </p>
          <p className="text-[11px] text-amber-800 mt-0.5">
            This endpoint is publicly accessible without Bearer tokens. Any submissions are automatically routed to your company, anchored to your assigned branch, tagged, and deduplicated against your existing CRM database.
          </p>
        </div>

        {/* Public Endpoint URL row */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-700">Public POST URL:</span>
            <button
              onClick={() => copyToClipboard(submitUrl, 'url')}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800"
            >
              {copiedKey === 'url' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>Copy URL</span>
            </button>
          </div>
          <p className="font-mono text-xs text-indigo-900 bg-white p-2 rounded-lg border border-slate-200 break-all select-all font-semibold">
            POST {submitUrl}
          </p>
        </div>

        {/* Code Snippet Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-1">
          <button
            onClick={() => setActiveTab('curl')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all ${
              activeTab === 'curl'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            cURL Request
          </button>

          <button
            onClick={() => setActiveTab('fetch')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all ${
              activeTab === 'fetch'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            JavaScript (fetch)
          </button>

          <button
            onClick={() => setActiveTab('html')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all ${
              activeTab === 'html'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <FileCode2 className="w-3.5 h-3.5" />
            HTML Embed Form
          </button>

          <button
            onClick={() => setActiveTab('json')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all ${
              activeTab === 'json'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            JSON Payload
          </button>
        </div>

        {/* Code Viewers */}
        <div className="relative">
          {activeTab === 'curl' && (
            <div className="bg-slate-900 text-slate-100 rounded-xl p-4 font-mono text-[11px] overflow-x-auto relative">
              <button
                onClick={() => copyToClipboard(curlCommand, 'curl')}
                className="absolute top-3 right-3 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-semibold flex items-center gap-1"
              >
                {copiedKey === 'curl' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                Copy cURL
              </button>
              <pre className="pr-16 whitespace-pre-wrap">{curlCommand}</pre>
            </div>
          )}

          {activeTab === 'fetch' && (
            <div className="bg-slate-900 text-slate-100 rounded-xl p-4 font-mono text-[11px] overflow-x-auto relative">
              <button
                onClick={() => copyToClipboard(fetchCode, 'fetch')}
                className="absolute top-3 right-3 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-semibold flex items-center gap-1"
              >
                {copiedKey === 'fetch' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                Copy Fetch
              </button>
              <pre className="pr-16 whitespace-pre-wrap">{fetchCode}</pre>
            </div>
          )}

          {activeTab === 'html' && (
            <div className="bg-slate-900 text-slate-100 rounded-xl p-4 font-mono text-[11px] overflow-x-auto relative">
              <button
                onClick={() => copyToClipboard(htmlFormCode, 'html')}
                className="absolute top-3 right-3 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-semibold flex items-center gap-1"
              >
                {copiedKey === 'html' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                Copy HTML
              </button>
              <pre className="pr-16 whitespace-pre-wrap">{htmlFormCode}</pre>
            </div>
          )}

          {activeTab === 'json' && (
            <div className="bg-slate-900 text-slate-100 rounded-xl p-4 font-mono text-[11px] overflow-x-auto relative">
              <button
                onClick={() => copyToClipboard(jsonString, 'json')}
                className="absolute top-3 right-3 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-semibold flex items-center gap-1"
              >
                {copiedKey === 'json' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                Copy JSON
              </button>
              <pre className="pr-16 whitespace-pre-wrap">{jsonString}</pre>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-3">
          <Button onClick={onClose} variant="secondary">
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default FormApiDocsModal;

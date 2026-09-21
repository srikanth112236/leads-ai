import React, { useState } from 'react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import { useGet, usePost, usePut, useDelete } from '../hooks/useApi';
import { useQueryClient } from '@tanstack/react-query';

const emptyForm = {
  name: '', domain: '', status: 'active',
  contactEmail: '', contactPhone: '', address: '', city: '', country: '', website: '',
};
const emptyAdmin = { firstName: '', lastName: '', email: '', password: '' };

interface Credentials {
  email: string;
  password: string;
  companyName: string;
}

const CompaniesPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useGet('/companies');
  const companies = (data as any)?.data || [];
  const [form, setForm] = useState(emptyForm);
  const [admin, setAdmin] = useState(emptyAdmin);
  const [withAdmin, setWithAdmin] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['/companies'] });
  const create = usePost('/companies');
  const update = usePut(`/companies/${editingId || ''}`);

  const set = (k: string, v: string) => setForm({ ...form, [k]: v });

  const startEdit = (c: any) => {
    setEditingId(c._id);
    setForm({
      name: c.name || '', domain: c.domain || '', status: c.status || 'active',
      contactEmail: c.contactEmail || '', contactPhone: c.contactPhone || '',
      address: c.address || '', city: c.city || '', country: c.country || '', website: c.website || '',
    });
    setError(null);
  };

  const reset = () => {
    setEditingId(null);
    setForm(emptyForm);
    setAdmin(emptyAdmin);
    setWithAdmin(true);
    setError(null);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const onError = (err: any) => setError(err?.response?.data?.error || 'Save failed');
    if (editingId) {
      update.mutate(form, { onSuccess: () => { reset(); refresh(); }, onError });
    } else {
      create.mutate(
        withAdmin ? { ...form, admin } : form,
        {
          onSuccess: (res: any) => {
            const creds = res?.data?.data?.adminCredentials;
            if (creds) {
              setCredentials({ ...creds, companyName: form.name });
              setCopied(false);
            }
            reset();
            refresh();
          },
          onError,
        },
      );
    }
  };

  const copyAll = async () => {
    if (!credentials) return;
    await navigator.clipboard.writeText(`Company: ${credentials.companyName}\nLogin: ${window.location.origin}/login\nEmail: ${credentials.email}\nPassword: ${credentials.password}`);
    setCopied(true);
  };

  return (
    <div>
      <Card title={editingId ? 'Edit Company' : 'New Company'} className="mb-4">
        {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
        <form onSubmit={submit}>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Company details</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <Input label="Company name" value={form.name} onChange={(e) => set('name', e.target.value)} required />
            <Input label="Domain" value={form.domain} onChange={(e) => set('domain', e.target.value)} />
            <Input label="Website" value={form.website} onChange={(e) => set('website', e.target.value)} />
            <label className="text-sm mb-3">Status
              <select value={form.status} onChange={(e) => set('status', e.target.value)} className="ml-2 px-2 py-2 border rounded-lg">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="suspended">Suspended</option>
              </select>
            </label>
            <Input label="Contact email" type="email" value={form.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} />
            <Input label="Contact phone" value={form.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} />
            <Input label="Address" value={form.address} onChange={(e) => set('address', e.target.value)} />
            <Input label="City" value={form.city} onChange={(e) => set('city', e.target.value)} />
            <Input label="Country" value={form.country} onChange={(e) => set('country', e.target.value)} />
          </div>
          {!editingId && (
            <>
              <label className="flex items-center gap-2 text-sm font-semibold mt-3 mb-2">
                <input type="checkbox" checked={withAdmin} onChange={(e) => setWithAdmin(e.target.checked)} />
                Create first admin login for this company
              </label>
              {withAdmin && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                  <Input label="Admin first name" value={admin.firstName} onChange={(e) => setAdmin({ ...admin, firstName: e.target.value })} required />
                  <Input label="Admin last name" value={admin.lastName} onChange={(e) => setAdmin({ ...admin, lastName: e.target.value })} required />
                  <Input label="Admin email" type="email" value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} required />
                  <Input label="Admin password" type="password" value={admin.password} onChange={(e) => setAdmin({ ...admin, password: e.target.value })} required />
                </div>
              )}
            </>
          )}
          <div className="flex gap-2 mt-2">
            <Button type="submit" loading={create.isPending || update.isPending}>{editingId ? 'Save' : 'Create company'}</Button>
            {editingId && <Button variant="secondary" onClick={reset}>Cancel</Button>}
          </div>
        </form>
      </Card>
      <Card>
        {isLoading ? (
          <p>Loading...</p>
        ) : companies.length === 0 ? (
          <p>No companies found</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Name</th>
                <th className="text-left py-2">Contact</th>
                <th className="text-left py-2">Location</th>
                <th className="text-left py-2">Status</th>
                <th className="text-left py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c: any) => (
                <tr key={c._id} className="border-b">
                  <td className="py-2 font-semibold">{c.name}<br /><span className="text-xs text-slate-500 font-normal">{c.domain}</span></td>
                  <td className="py-2 text-xs">{c.contactEmail || '—'}<br />{c.contactPhone || ''}</td>
                  <td className="py-2 text-xs">{[c.city, c.country].filter(Boolean).join(', ') || '—'}</td>
                  <td className="py-2">{c.status}</td>
                  <td className="py-2 flex gap-2">
                    <Button variant="secondary" onClick={() => startEdit(c)}>Edit</Button>
                    <DeleteButton id={c._id} onDone={refresh} onError={setError} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {credentials && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-base font-extrabold text-slate-900 mb-1">Company created — save this login</h3>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
              Shown only once. It will not be displayed again.
            </p>
            <div className="space-y-2 text-sm bg-slate-50 border border-slate-200 rounded-lg p-4 font-mono">
              <p><span className="text-slate-500">Company:</span> <strong>{credentials.companyName}</strong></p>
              <p><span className="text-slate-500">Login page:</span> <strong>{window.location.origin}/login</strong></p>
              <p><span className="text-slate-500">Email:</span> <strong>{credentials.email}</strong></p>
              <p><span className="text-slate-500">Password:</span> <strong>{credentials.password}</strong></p>
            </div>
            <div className="flex gap-2 mt-4">
              <Button onClick={copyAll}>{copied ? 'Copied!' : 'Copy all'}</Button>
              <Button variant="secondary" onClick={() => setCredentials(null)}>Done</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const DeleteButton: React.FC<{ id: string; onDone: () => void; onError: (m: string) => void }> = ({ id, onDone, onError }) => {
  const del = useDelete(`/companies/${id}`);
  return (
    <Button
      variant="danger"
      loading={del.isPending}
      onClick={() => {
        if (!window.confirm('Delete this company? This cannot be undone.')) return;
        del.mutate(undefined, { onSuccess: onDone, onError: (err: any) => onError(err?.response?.data?.error || 'Delete failed') });
      }}
    >
      Delete
    </Button>
  );
};

export default CompaniesPage;

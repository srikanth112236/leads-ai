import React, { useState } from 'react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import { useGet, usePost, usePut, useDelete } from '../hooks/useApi';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const emptyForm = { companyId: '', name: '', location: '', status: 'active' };

const BranchesPage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isSuper = user?.role === 'SUPER_ADMIN';
  const { data, isLoading } = useGet('/branches');
  const branches = (data as any)?.data || [];
  const { data: companiesData } = useQuery({
    queryKey: ['companies-list'],
    queryFn: () => api.get('/companies').then((r) => r.data),
    enabled: isSuper,
    retry: false,
  });
  const companies = isSuper ? ((companiesData as any)?.data || []) : [];
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['/branches'] });
  const create = usePost('/branches');
  const update = usePut(`/branches/${editingId || ''}`);

  const startCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, companyId: isSuper ? '' : user?.companyId || '' });
    setShowForm(true);
    setError(null);
  };

  const startEdit = (b: any) => {
    setEditingId(b._id);
    setForm({ companyId: b.companyId || '', name: b.name || '', location: b.location || '', status: b.status || 'active' });
    setShowForm(true);
    setError(null);
  };

  const reset = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(false);
    setError(null);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const onError = (err: any) => setError(err?.response?.data?.error || 'Save failed');
    const onSuccess = () => { reset(); refresh(); };
    if (editingId) {
      const { companyId: _omit, ...patch } = form;
      void _omit;
      update.mutate(patch, { onSuccess, onError });
    } else {
      create.mutate(form, { onSuccess, onError });
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div />
        {!showForm && <Button onClick={startCreate}>New Branch</Button>}
      </div>
      {showForm && (
        <Card title={editingId ? 'Edit Branch' : 'New Branch'} className="mb-4">
          {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
          <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            {isSuper && !editingId && (
              <label className="text-sm mb-3">Company
                <select value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })} className="ml-2 px-2 py-2 border rounded-lg" required>
                  <option value="">Select…</option>
                  {companies.map((c: any) => <option key={c._id} value={c._id}>{c.name}</option>)}
                </select>
              </label>
            )}
            <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input label="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            <label className="text-sm mb-3">Status
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="ml-2 px-2 py-2 border rounded-lg">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <div className="flex gap-2 mb-3">
              <Button type="submit" loading={create.isPending || update.isPending}>{editingId ? 'Save' : 'Create'}</Button>
              <Button variant="secondary" onClick={reset}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}
      <Card>
        {isLoading ? (
          <p>Loading...</p>
        ) : branches.length === 0 ? (
          <p>No branches found</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Name</th>
                <th className="text-left py-2">Location</th>
                <th className="text-left py-2">Status</th>
                <th className="text-left py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {branches.map((b: any) => (
                <BranchRow key={b._id} b={b} onEdit={() => startEdit(b)} onDone={refresh} onError={setError} />
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
};

const BranchRow: React.FC<{ b: any; onEdit: () => void; onDone: () => void; onError: (m: string) => void }> = ({ b, onEdit, onDone, onError }) => {
  const remove = useDelete(`/branches/${b._id}`);
  return (
    <tr key={b._id} className="border-b">
      <td className="py-2">{b.name}</td>
      <td className="py-2">{b.location || '—'}</td>
      <td className="py-2">{b.status}</td>
      <td className="py-2 flex gap-2">
        <Button variant="secondary" onClick={onEdit}>Edit</Button>
        <Button
          variant="danger"
          loading={remove.isPending}
          onClick={() => {
            if (!window.confirm(`Delete branch "${b.name}"?`)) return;
            remove.mutate(undefined, { onSuccess: onDone, onError: (err: any) => onError(err?.response?.data?.error || 'Delete failed') });
          }}
        >
          Delete
        </Button>
      </td>
    </tr>
  );
};

export default BranchesPage;

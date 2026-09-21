import React, { useState } from 'react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import { useGet, usePost, usePut, useDelete } from '../hooks/useApi';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const emptyForm = { email: '', password: '', firstName: '', lastName: '', role: 'SALES_AGENT', branchId: '', phone: '', companyId: '' };
const EDITABLE_ROLES = ['SALES_AGENT', 'BRANCH_MANAGER', 'COMPANY_MANAGER', 'COMPANY_ADMIN'];

const UsersPage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isSuper = user?.role === 'SUPER_ADMIN';
  const canWrite = user?.role !== 'BRANCH_MANAGER';
  const [tab, setTab] = useState<'staff' | 'companies'>('staff');
  const listUrl = isSuper && tab === 'staff' ? '/users?scope=staff' : '/users';
  const { data, isLoading } = useGet(listUrl);
  const users = (data as any)?.data || [];
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

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['/users'] });
    queryClient.invalidateQueries({ queryKey: ['/users?scope=staff'] });
  };
  const create = usePost('/users');
  const update = usePut(`/users/${editingId || ''}`);

  const startEdit = (u: any) => {
    setEditingId(u._id);
    setForm({ email: u.email, password: '', firstName: u.firstName || '', lastName: u.lastName || '', role: u.role, branchId: u.branchId || '', phone: u.phone || '', companyId: u.companyId || '' });
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
      const { email, password, ...patch }: any = form;
      void email;
      update.mutate({ ...patch, branchId: patch.branchId || undefined }, { onSuccess, onError });
    } else {
      create.mutate(isSuper ? form : { ...form, companyId: undefined }, { onSuccess, onError });
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-2">
          {isSuper && (
            <>
              <Button variant={tab === 'staff' ? 'primary' : 'secondary'} onClick={() => setTab('staff')}>Platform Staff</Button>
              <Button variant={tab === 'companies' ? 'primary' : 'secondary'} onClick={() => setTab('companies')}>Company Users</Button>
            </>
          )}
        </div>
        {canWrite && !showForm && <Button onClick={() => { setShowForm(true); setError(null); }}>New User</Button>}
      </div>
      {showForm && (
        <Card title={editingId ? 'Edit User' : 'New User'} className="mb-4">
          {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
          <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            {isSuper && !editingId && (
              <label className="text-sm mb-3">Company
                <select value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })} className="ml-2 px-2 py-2 border rounded-lg" required>
                  <option value="">Select…</option>
                  {companies.map((c: any) => <option key={c._id} value={c._id}>{c.name}</option>)}
                </select>
              </label>
            )}
            {!editingId && <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />}
            {!editingId && <Input label="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />}
            <Input label="First name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required={!editingId} />
            <Input label="Last name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required={!editingId} />
            <label className="text-sm mb-3">Role
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="ml-2 px-2 py-2 border rounded-lg">
                {EDITABLE_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                {isSuper && !editingId && <option value="SUPER_ADMIN">SUPER_ADMIN</option>}
              </select>
            </label>
            <Input label="Branch ID (optional)" value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} />
            <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
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
        ) : users.length === 0 ? (
          <p>No users found</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Name</th>
                <th className="text-left py-2">Email</th>
                <th className="text-left py-2">Role</th>
                {isSuper && tab === 'companies' && <th className="text-left py-2">Company</th>}
                <th className="text-left py-2">Branch</th>
                <th className="text-left py-2">Active</th>
                {canWrite && <th className="text-left py-2">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {users.map((u: any) => (
                <UserRow key={u._id} u={u} canWrite={canWrite} showCompany={isSuper && tab === 'companies'} companies={companies} onEdit={() => startEdit(u)} onDone={refresh} onError={setError} />
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
};

const UserRow: React.FC<{ u: any; canWrite: boolean; showCompany: boolean; companies: any[]; onEdit: () => void; onDone: () => void; onError: (m: string) => void }> = ({ u, canWrite, showCompany, companies, onEdit, onDone, onError }) => {
  const toggle = usePut(`/users/${u._id}`);
  const remove = useDelete(`/users/${u._id}`);
  const companyName = companies.find((c: any) => c._id === u.companyId)?.name;
  return (
    <tr key={u._id} className="border-b">
      <td className="py-2">{u.firstName} {u.lastName}</td>
      <td className="py-2">{u.email}</td>
      <td className="py-2">{u.role}</td>
      {showCompany && <td className="py-2">{companyName || u.companyId || '—'}</td>}
      <td className="py-2">{u.branchId || '—'}</td>
      <td className="py-2">{u.isActive ? 'Yes' : 'No'}</td>
      {canWrite && (
        <td className="py-2 flex gap-2">
          <Button variant="secondary" onClick={onEdit}>Edit</Button>
          {u.isActive ? (
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() => {
                if (!window.confirm(`Deactivate ${u.email}?`)) return;
                remove.mutate(undefined, { onSuccess: onDone, onError: (err: any) => onError(err?.response?.data?.error || 'Deactivate failed') });
              }}
            >
              Deactivate
            </Button>
          ) : (
            <Button
              loading={toggle.isPending}
              onClick={() => toggle.mutate({ isActive: true }, { onSuccess: onDone, onError: (err: any) => onError(err?.response?.data?.error || 'Reactivate failed') })}
            >
              Reactivate
            </Button>
          )}
        </td>
      )}
    </tr>
  );
};

export default UsersPage;

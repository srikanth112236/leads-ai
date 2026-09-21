import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import { useGet, usePost, usePut, useDelete } from '../hooks/useApi';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
const emptyForm = { email: '', password: '', firstName: '', lastName: '', role: 'SALES_AGENT', branchId: '', phone: '', companyId: '' };
const EDITABLE_ROLES = ['SALES_AGENT', 'BRANCH_MANAGER', 'COMPANY_MANAGER', 'COMPANY_ADMIN'];
const UsersPage = () => {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const isSuper = user?.role === 'SUPER_ADMIN';
    const canWrite = user?.role !== 'BRANCH_MANAGER';
    const [tab, setTab] = useState('staff');
    const listUrl = isSuper && tab === 'staff' ? '/users?scope=staff' : '/users';
    const { data, isLoading } = useGet(listUrl);
    const users = data?.data || [];
    const { data: companiesData } = useQuery({
        queryKey: ['companies-list'],
        queryFn: () => api.get('/companies').then((r) => r.data),
        enabled: isSuper,
        retry: false,
    });
    const companies = isSuper ? (companiesData?.data || []) : [];
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [error, setError] = useState(null);
    const refresh = () => {
        queryClient.invalidateQueries({ queryKey: ['/users'] });
        queryClient.invalidateQueries({ queryKey: ['/users?scope=staff'] });
    };
    const create = usePost('/users');
    const update = usePut(`/users/${editingId || ''}`);
    const startEdit = (u) => {
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
    const submit = (e) => {
        e.preventDefault();
        setError(null);
        const onError = (err) => setError(err?.response?.data?.error || 'Save failed');
        const onSuccess = () => { reset(); refresh(); };
        if (editingId) {
            const { email, password, ...patch } = form;
            void email;
            update.mutate({ ...patch, branchId: patch.branchId || undefined }, { onSuccess, onError });
        }
        else {
            create.mutate(isSuper ? form : { ...form, companyId: undefined }, { onSuccess, onError });
        }
    };
    return (_jsxs("div", { children: [_jsxs("div", { className: "flex justify-between items-center mb-4", children: [_jsx("div", { className: "flex gap-2", children: isSuper && (_jsxs(_Fragment, { children: [_jsx(Button, { variant: tab === 'staff' ? 'primary' : 'secondary', onClick: () => setTab('staff'), children: "Platform Staff" }), _jsx(Button, { variant: tab === 'companies' ? 'primary' : 'secondary', onClick: () => setTab('companies'), children: "Company Users" })] })) }), canWrite && !showForm && _jsx(Button, { onClick: () => { setShowForm(true); setError(null); }, children: "New User" })] }), showForm && (_jsxs(Card, { title: editingId ? 'Edit User' : 'New User', className: "mb-4", children: [error && _jsx("p", { className: "text-red-500 text-sm mb-2", children: error }), _jsxs("form", { onSubmit: submit, className: "grid grid-cols-1 md:grid-cols-3 gap-3 items-end", children: [isSuper && !editingId && (_jsxs("label", { className: "text-sm mb-3", children: ["Company", _jsxs("select", { value: form.companyId, onChange: (e) => setForm({ ...form, companyId: e.target.value }), className: "ml-2 px-2 py-2 border rounded-lg", required: true, children: [_jsx("option", { value: "", children: "Select\u2026" }), companies.map((c) => _jsx("option", { value: c._id, children: c.name }, c._id))] })] })), !editingId && _jsx(Input, { label: "Email", type: "email", value: form.email, onChange: (e) => setForm({ ...form, email: e.target.value }), required: true }), !editingId && _jsx(Input, { label: "Password", type: "password", value: form.password, onChange: (e) => setForm({ ...form, password: e.target.value }), required: true }), _jsx(Input, { label: "First name", value: form.firstName, onChange: (e) => setForm({ ...form, firstName: e.target.value }), required: !editingId }), _jsx(Input, { label: "Last name", value: form.lastName, onChange: (e) => setForm({ ...form, lastName: e.target.value }), required: !editingId }), _jsxs("label", { className: "text-sm mb-3", children: ["Role", _jsxs("select", { value: form.role, onChange: (e) => setForm({ ...form, role: e.target.value }), className: "ml-2 px-2 py-2 border rounded-lg", children: [EDITABLE_ROLES.map((r) => _jsx("option", { value: r, children: r }, r)), isSuper && !editingId && _jsx("option", { value: "SUPER_ADMIN", children: "SUPER_ADMIN" })] })] }), _jsx(Input, { label: "Branch ID (optional)", value: form.branchId, onChange: (e) => setForm({ ...form, branchId: e.target.value }) }), _jsx(Input, { label: "Phone", value: form.phone, onChange: (e) => setForm({ ...form, phone: e.target.value }) }), _jsxs("div", { className: "flex gap-2 mb-3", children: [_jsx(Button, { type: "submit", loading: create.isPending || update.isPending, children: editingId ? 'Save' : 'Create' }), _jsx(Button, { variant: "secondary", onClick: reset, children: "Cancel" })] })] })] })), _jsx(Card, { children: isLoading ? (_jsx("p", { children: "Loading..." })) : users.length === 0 ? (_jsx("p", { children: "No users found" })) : (_jsxs("table", { className: "w-full", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b", children: [_jsx("th", { className: "text-left py-2", children: "Name" }), _jsx("th", { className: "text-left py-2", children: "Email" }), _jsx("th", { className: "text-left py-2", children: "Role" }), isSuper && tab === 'companies' && _jsx("th", { className: "text-left py-2", children: "Company" }), _jsx("th", { className: "text-left py-2", children: "Branch" }), _jsx("th", { className: "text-left py-2", children: "Active" }), canWrite && _jsx("th", { className: "text-left py-2", children: "Actions" })] }) }), _jsx("tbody", { children: users.map((u) => (_jsx(UserRow, { u: u, canWrite: canWrite, showCompany: isSuper && tab === 'companies', companies: companies, onEdit: () => startEdit(u), onDone: refresh, onError: setError }, u._id))) })] })) })] }));
};
const UserRow = ({ u, canWrite, showCompany, companies, onEdit, onDone, onError }) => {
    const toggle = usePut(`/users/${u._id}`);
    const remove = useDelete(`/users/${u._id}`);
    const companyName = companies.find((c) => c._id === u.companyId)?.name;
    return (_jsxs("tr", { className: "border-b", children: [_jsxs("td", { className: "py-2", children: [u.firstName, " ", u.lastName] }), _jsx("td", { className: "py-2", children: u.email }), _jsx("td", { className: "py-2", children: u.role }), showCompany && _jsx("td", { className: "py-2", children: companyName || u.companyId || '—' }), _jsx("td", { className: "py-2", children: u.branchId || '—' }), _jsx("td", { className: "py-2", children: u.isActive ? 'Yes' : 'No' }), canWrite && (_jsxs("td", { className: "py-2 flex gap-2", children: [_jsx(Button, { variant: "secondary", onClick: onEdit, children: "Edit" }), u.isActive ? (_jsx(Button, { variant: "danger", loading: remove.isPending, onClick: () => {
                            if (!window.confirm(`Deactivate ${u.email}?`))
                                return;
                            remove.mutate(undefined, { onSuccess: onDone, onError: (err) => onError(err?.response?.data?.error || 'Deactivate failed') });
                        }, children: "Deactivate" })) : (_jsx(Button, { loading: toggle.isPending, onClick: () => toggle.mutate({ isActive: true }, { onSuccess: onDone, onError: (err) => onError(err?.response?.data?.error || 'Reactivate failed') }), children: "Reactivate" }))] }))] }, u._id));
};
export default UsersPage;
//# sourceMappingURL=UsersPage.js.map
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import { useGet, usePost, usePut, useDelete } from '../hooks/useApi';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
const emptyForm = { companyId: '', name: '', location: '', status: 'active' };
const BranchesPage = () => {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const isSuper = user?.role === 'SUPER_ADMIN';
    const { data, isLoading } = useGet('/branches');
    const branches = data?.data || [];
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
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['/branches'] });
    const create = usePost('/branches');
    const update = usePut(`/branches/${editingId || ''}`);
    const startCreate = () => {
        setEditingId(null);
        setForm({ ...emptyForm, companyId: isSuper ? '' : user?.companyId || '' });
        setShowForm(true);
        setError(null);
    };
    const startEdit = (b) => {
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
    const submit = (e) => {
        e.preventDefault();
        setError(null);
        const onError = (err) => setError(err?.response?.data?.error || 'Save failed');
        const onSuccess = () => { reset(); refresh(); };
        if (editingId) {
            const { companyId: _omit, ...patch } = form;
            void _omit;
            update.mutate(patch, { onSuccess, onError });
        }
        else {
            create.mutate(form, { onSuccess, onError });
        }
    };
    return (_jsxs("div", { children: [_jsxs("div", { className: "flex justify-between items-center mb-4", children: [_jsx("div", {}), !showForm && _jsx(Button, { onClick: startCreate, children: "New Branch" })] }), showForm && (_jsxs(Card, { title: editingId ? 'Edit Branch' : 'New Branch', className: "mb-4", children: [error && _jsx("p", { className: "text-red-500 text-sm mb-2", children: error }), _jsxs("form", { onSubmit: submit, className: "grid grid-cols-1 md:grid-cols-4 gap-3 items-end", children: [isSuper && !editingId && (_jsxs("label", { className: "text-sm mb-3", children: ["Company", _jsxs("select", { value: form.companyId, onChange: (e) => setForm({ ...form, companyId: e.target.value }), className: "ml-2 px-2 py-2 border rounded-lg", required: true, children: [_jsx("option", { value: "", children: "Select\u2026" }), companies.map((c) => _jsx("option", { value: c._id, children: c.name }, c._id))] })] })), _jsx(Input, { label: "Name", value: form.name, onChange: (e) => setForm({ ...form, name: e.target.value }), required: true }), _jsx(Input, { label: "Location", value: form.location, onChange: (e) => setForm({ ...form, location: e.target.value }) }), _jsxs("label", { className: "text-sm mb-3", children: ["Status", _jsxs("select", { value: form.status, onChange: (e) => setForm({ ...form, status: e.target.value }), className: "ml-2 px-2 py-2 border rounded-lg", children: [_jsx("option", { value: "active", children: "Active" }), _jsx("option", { value: "inactive", children: "Inactive" })] })] }), _jsxs("div", { className: "flex gap-2 mb-3", children: [_jsx(Button, { type: "submit", loading: create.isPending || update.isPending, children: editingId ? 'Save' : 'Create' }), _jsx(Button, { variant: "secondary", onClick: reset, children: "Cancel" })] })] })] })), _jsx(Card, { children: isLoading ? (_jsx("p", { children: "Loading..." })) : branches.length === 0 ? (_jsx("p", { children: "No branches found" })) : (_jsxs("table", { className: "w-full", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b", children: [_jsx("th", { className: "text-left py-2", children: "Name" }), _jsx("th", { className: "text-left py-2", children: "Location" }), _jsx("th", { className: "text-left py-2", children: "Status" }), _jsx("th", { className: "text-left py-2", children: "Actions" })] }) }), _jsx("tbody", { children: branches.map((b) => (_jsx(BranchRow, { b: b, onEdit: () => startEdit(b), onDone: refresh, onError: setError }, b._id))) })] })) })] }));
};
const BranchRow = ({ b, onEdit, onDone, onError }) => {
    const remove = useDelete(`/branches/${b._id}`);
    return (_jsxs("tr", { className: "border-b", children: [_jsx("td", { className: "py-2", children: b.name }), _jsx("td", { className: "py-2", children: b.location || '—' }), _jsx("td", { className: "py-2", children: b.status }), _jsxs("td", { className: "py-2 flex gap-2", children: [_jsx(Button, { variant: "secondary", onClick: onEdit, children: "Edit" }), _jsx(Button, { variant: "danger", loading: remove.isPending, onClick: () => {
                            if (!window.confirm(`Delete branch "${b.name}"?`))
                                return;
                            remove.mutate(undefined, { onSuccess: onDone, onError: (err) => onError(err?.response?.data?.error || 'Delete failed') });
                        }, children: "Delete" })] })] }, b._id));
};
export default BranchesPage;
//# sourceMappingURL=BranchesPage.js.map
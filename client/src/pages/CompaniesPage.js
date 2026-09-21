import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
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
const CompaniesPage = () => {
    const queryClient = useQueryClient();
    const { data, isLoading } = useGet('/companies');
    const companies = data?.data || [];
    const [form, setForm] = useState(emptyForm);
    const [admin, setAdmin] = useState(emptyAdmin);
    const [withAdmin, setWithAdmin] = useState(true);
    const [editingId, setEditingId] = useState(null);
    const [error, setError] = useState(null);
    const [credentials, setCredentials] = useState(null);
    const [copied, setCopied] = useState(false);
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['/companies'] });
    const create = usePost('/companies');
    const update = usePut(`/companies/${editingId || ''}`);
    const set = (k, v) => setForm({ ...form, [k]: v });
    const startEdit = (c) => {
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
    const submit = (e) => {
        e.preventDefault();
        setError(null);
        const onError = (err) => setError(err?.response?.data?.error || 'Save failed');
        if (editingId) {
            update.mutate(form, { onSuccess: () => { reset(); refresh(); }, onError });
        }
        else {
            create.mutate(withAdmin ? { ...form, admin } : form, {
                onSuccess: (res) => {
                    const creds = res?.data?.data?.adminCredentials;
                    if (creds) {
                        setCredentials({ ...creds, companyName: form.name });
                        setCopied(false);
                    }
                    reset();
                    refresh();
                },
                onError,
            });
        }
    };
    const copyAll = async () => {
        if (!credentials)
            return;
        await navigator.clipboard.writeText(`Company: ${credentials.companyName}\nLogin: ${window.location.origin}/login\nEmail: ${credentials.email}\nPassword: ${credentials.password}`);
        setCopied(true);
    };
    return (_jsxs("div", { children: [_jsxs(Card, { title: editingId ? 'Edit Company' : 'New Company', className: "mb-4", children: [error && _jsx("p", { className: "text-red-500 text-sm mb-2", children: error }), _jsxs("form", { onSubmit: submit, children: [_jsx("p", { className: "text-xs font-bold text-slate-500 uppercase tracking-wide mb-2", children: "Company details" }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-4 gap-3 items-end", children: [_jsx(Input, { label: "Company name", value: form.name, onChange: (e) => set('name', e.target.value), required: true }), _jsx(Input, { label: "Domain", value: form.domain, onChange: (e) => set('domain', e.target.value) }), _jsx(Input, { label: "Website", value: form.website, onChange: (e) => set('website', e.target.value) }), _jsxs("label", { className: "text-sm mb-3", children: ["Status", _jsxs("select", { value: form.status, onChange: (e) => set('status', e.target.value), className: "ml-2 px-2 py-2 border rounded-lg", children: [_jsx("option", { value: "active", children: "Active" }), _jsx("option", { value: "inactive", children: "Inactive" }), _jsx("option", { value: "suspended", children: "Suspended" })] })] }), _jsx(Input, { label: "Contact email", type: "email", value: form.contactEmail, onChange: (e) => set('contactEmail', e.target.value) }), _jsx(Input, { label: "Contact phone", value: form.contactPhone, onChange: (e) => set('contactPhone', e.target.value) }), _jsx(Input, { label: "Address", value: form.address, onChange: (e) => set('address', e.target.value) }), _jsx(Input, { label: "City", value: form.city, onChange: (e) => set('city', e.target.value) }), _jsx(Input, { label: "Country", value: form.country, onChange: (e) => set('country', e.target.value) })] }), !editingId && (_jsxs(_Fragment, { children: [_jsxs("label", { className: "flex items-center gap-2 text-sm font-semibold mt-3 mb-2", children: [_jsx("input", { type: "checkbox", checked: withAdmin, onChange: (e) => setWithAdmin(e.target.checked) }), "Create first admin login for this company"] }), withAdmin && (_jsxs("div", { className: "grid grid-cols-1 md:grid-cols-4 gap-3 items-end", children: [_jsx(Input, { label: "Admin first name", value: admin.firstName, onChange: (e) => setAdmin({ ...admin, firstName: e.target.value }), required: true }), _jsx(Input, { label: "Admin last name", value: admin.lastName, onChange: (e) => setAdmin({ ...admin, lastName: e.target.value }), required: true }), _jsx(Input, { label: "Admin email", type: "email", value: admin.email, onChange: (e) => setAdmin({ ...admin, email: e.target.value }), required: true }), _jsx(Input, { label: "Admin password", type: "password", value: admin.password, onChange: (e) => setAdmin({ ...admin, password: e.target.value }), required: true })] }))] })), _jsxs("div", { className: "flex gap-2 mt-2", children: [_jsx(Button, { type: "submit", loading: create.isPending || update.isPending, children: editingId ? 'Save' : 'Create company' }), editingId && _jsx(Button, { variant: "secondary", onClick: reset, children: "Cancel" })] })] })] }), _jsx(Card, { children: isLoading ? (_jsx("p", { children: "Loading..." })) : companies.length === 0 ? (_jsx("p", { children: "No companies found" })) : (_jsxs("table", { className: "w-full", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b", children: [_jsx("th", { className: "text-left py-2", children: "Name" }), _jsx("th", { className: "text-left py-2", children: "Contact" }), _jsx("th", { className: "text-left py-2", children: "Location" }), _jsx("th", { className: "text-left py-2", children: "Status" }), _jsx("th", { className: "text-left py-2", children: "Actions" })] }) }), _jsx("tbody", { children: companies.map((c) => (_jsxs("tr", { className: "border-b", children: [_jsxs("td", { className: "py-2 font-semibold", children: [c.name, _jsx("br", {}), _jsx("span", { className: "text-xs text-slate-500 font-normal", children: c.domain })] }), _jsxs("td", { className: "py-2 text-xs", children: [c.contactEmail || '—', _jsx("br", {}), c.contactPhone || ''] }), _jsx("td", { className: "py-2 text-xs", children: [c.city, c.country].filter(Boolean).join(', ') || '—' }), _jsx("td", { className: "py-2", children: c.status }), _jsxs("td", { className: "py-2 flex gap-2", children: [_jsx(Button, { variant: "secondary", onClick: () => startEdit(c), children: "Edit" }), _jsx(DeleteButton, { id: c._id, onDone: refresh, onError: setError })] })] }, c._id))) })] })) }), credentials && (_jsx("div", { className: "fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4", children: _jsxs("div", { className: "bg-white rounded-xl shadow-xl max-w-md w-full p-6", children: [_jsx("h3", { className: "text-base font-extrabold text-slate-900 mb-1", children: "Company created \u2014 save this login" }), _jsx("p", { className: "text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4", children: "Shown only once. It will not be displayed again." }), _jsxs("div", { className: "space-y-2 text-sm bg-slate-50 border border-slate-200 rounded-lg p-4 font-mono", children: [_jsxs("p", { children: [_jsx("span", { className: "text-slate-500", children: "Company:" }), " ", _jsx("strong", { children: credentials.companyName })] }), _jsxs("p", { children: [_jsx("span", { className: "text-slate-500", children: "Login page:" }), " ", _jsxs("strong", { children: [window.location.origin, "/login"] })] }), _jsxs("p", { children: [_jsx("span", { className: "text-slate-500", children: "Email:" }), " ", _jsx("strong", { children: credentials.email })] }), _jsxs("p", { children: [_jsx("span", { className: "text-slate-500", children: "Password:" }), " ", _jsx("strong", { children: credentials.password })] })] }), _jsxs("div", { className: "flex gap-2 mt-4", children: [_jsx(Button, { onClick: copyAll, children: copied ? 'Copied!' : 'Copy all' }), _jsx(Button, { variant: "secondary", onClick: () => setCredentials(null), children: "Done" })] })] }) }))] }));
};
const DeleteButton = ({ id, onDone, onError }) => {
    const del = useDelete(`/companies/${id}`);
    return (_jsx(Button, { variant: "danger", loading: del.isPending, onClick: () => {
            if (!window.confirm('Delete this company? This cannot be undone.'))
                return;
            del.mutate(undefined, { onSuccess: onDone, onError: (err) => onError(err?.response?.data?.error || 'Delete failed') });
        }, children: "Delete" }));
};
export default CompaniesPage;
//# sourceMappingURL=CompaniesPage.js.map
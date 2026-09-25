import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import Input from '../components/common/Input';
import Button from '../components/common/Button';

const API_BASE = (import.meta as any).env?.VITE_API_URL || '/api';

const ResetPasswordPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/auth/reset-password`, { token, newPassword });
      setDone(true);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Reset failed. The link may be invalid or expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-md bg-white rounded-lg border border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.05)] p-7">
        <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Set a new password</h2>
        <p className="text-xs text-slate-500 mt-1 mb-5">Choose a strong password for your account.</p>
        {done ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center text-xl font-bold">✓</div>
            <p className="text-sm font-semibold text-slate-800 mt-3">Password reset successfully.</p>
            <Link to="/login" className="mt-3 inline-block text-xs font-semibold text-indigo-600 hover:text-indigo-800">
              ← Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            {error && (
              <div className="px-3 py-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs font-medium">
                {error}
              </div>
            )}
            <Input label="New password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
            <Input label="Confirm new password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            <Button type="submit" loading={loading} className="w-full">Reset password</Button>
            <Link to="/login" className="block text-center text-xs font-semibold text-slate-500 hover:text-slate-800 py-1">
              ← Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
};

export default ResetPasswordPage;

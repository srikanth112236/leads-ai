import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import Input from '../components/common/Input';
import Button from '../components/common/Button';

function friendlyError(error: any): string {
  const data = error?.response?.data;
  if (data?.error) return `${data.error}${data?.code ? ` (${data.code})` : ''}`;
  if (error?.code === 'ERR_NETWORK' || error?.message === 'Network Error') {
    return 'Cannot reach the server. Is the backend running on :3000?';
  }
  return error?.message || 'Login failed. Please try again.';
}

const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg shadow p-8">
          <h2 className="text-2xl font-bold mb-6 text-center">Lead CRM</h2>
          {error && (
            <div className="mb-4 px-3 py-2 bg-red-50 border border-red-300 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit}>
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <Button type="submit" loading={loading} className="w-full">Sign In</Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;

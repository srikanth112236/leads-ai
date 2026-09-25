import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import type { LoginResult, PendingApproval } from '../context/AuthContext';
import Input from '../components/common/Input';
import Button from '../components/common/Button';
import Toggle from '../components/common/Toggle';
import { getDeviceId, getDeviceName } from '../services/device';

const API_BASE = (import.meta as any).env?.VITE_API_URL || '/api';
// Platform illustration (Unsplash). If it ever fails to load, the indigo
// gradient underneath keeps the panel branded.
const HERO_IMAGE =
  'https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=1600&auto=format&fit=crop';

function friendlyError(error: any): string {
  const data = error?.response?.data;
  if (data?.error) return `${data.error}${data?.code ? ` (${data.code})` : ''}`;
  if (error?.code === 'ERR_NETWORK' || error?.message === 'Network Error') {
    return 'Cannot reach the server. Is the backend running?';
  }
  return error?.message || 'Login failed. Please try again.';
}

type Step = 'login' | 'forgot' | 'forgot-sent' | 'force-change' | 'cap-reached' | 'approval-pending';

interface CapInfo {
  message: string;
  tier?: string;
  deviceKind?: string;
  maxDevices?: number;
  approvers: Array<{ name: string; email: string }>;
  devices: Array<{ deviceId: string; deviceName?: string; deviceKind?: string; ip?: string; lastSeenAt?: string }>;
}

const LoginPage: React.FC = () => {
  const { login, adoptSession } = useAuth();
  const [approval, setApproval] = useState<PendingApproval | null>(null);
  const [approvalLeft, setApprovalLeft] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rememberRef = useRef(true);
  const [step, setStep] = useState<Step>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Forgot-password state
  const [forgotEmail, setForgotEmail] = useState('');

  // Forced-change state (first login with a temporary password)
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [capInfo, setCapInfo] = useState<CapInfo | null>(null);
  const [rules, setRules] = useState<LoginResult['passwordRules']>();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [imgOk, setImgOk] = useState(true);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      rememberRef.current = rememberMe;
      const result = await login(email, password, rememberMe);
      if (result.approvalRequired && result.approval) {
        setApproval(result.approval);
        setApprovalLeft(result.approval.expiresIn || 60);
        setStep('approval-pending');
        return;
      }
      if ((result as any).capReached && (result as any).capInfo) {
        setCapInfo((result as any).capInfo as CapInfo);
        setStep('cap-reached');
        return;
      }
      if (result.mustChangePassword) {
        // Stay on this page: keep the short-lived token only for the change call.
        setPendingToken(result.accessToken);
        setRules(result.passwordRules);
        setNewPassword('');
        setConfirmPassword('');
        setStep('force-change');
      }
    } catch (err: any) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  // Poll the pending login until an active device allows/denies it.
  useEffect(() => {
    if (step !== 'approval-pending' || !approval) return;
    setApprovalLeft(approval.expiresIn || 60);
    const tick = async () => {
      try {
        const res = await axios.get(`${API_BASE}/auth/sessions/pending/${approval.sessionId}`);
        const status = res.data?.data?.status;
        if (status === 'active') {
          if (pollRef.current) clearInterval(pollRef.current);
          const completed = adoptSession(res.data.data, rememberRef.current);
          if (completed.mustChangePassword) {
            setPendingToken(completed.accessToken);
            setRules(completed.passwordRules);
            setNewPassword('');
            setConfirmPassword('');
            setStep('force-change');
          }
          return;
        }
        if (status === 'denied' || status === 'expired') {
          if (pollRef.current) clearInterval(pollRef.current);
          setApproval(null);
          setStep('login');
          setError(
            status === 'denied'
              ? 'Login denied by your active device. Maximum 3 devices per account.'
              : 'Approval request expired. Please try logging in again.',
          );
        }
      } catch {
        // Transient poll failure – keep waiting until countdown ends.
      }
    };
    void tick();
    pollRef.current = setInterval(tick, 2000);
    const countdown = setInterval(() => {
      setApprovalLeft((s) => {
        if (s <= 1) {
          if (pollRef.current) clearInterval(pollRef.current);
          clearInterval(countdown);
          setApproval(null);
          setStep('login');
          setError('Approval request expired. Please try logging in again.');
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      clearInterval(countdown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, approval?.sessionId]);

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await axios.post(`${API_BASE}/auth/forgot-password`, { email: forgotEmail || email });
      setStep('forgot-sent');
    } catch (err: any) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  const ruleHints: string[] = [];
  if (rules) {
    ruleHints.push(`At least ${rules.minPasswordLength} characters`);
    if (rules.requireSpecialChar) ruleHints.push('One special symbol (!@#$%)');
    if (rules.requireNumber) ruleHints.push('One number (0-9)');
  }

  const handleForceChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      // The login call stored nothing persistent for forced sessions; reuse the
      // in-memory token via a direct call with the Authorization header.
      const token = pendingToken;
      await axios.put(
        `${API_BASE}/auth/change-password`,
        { currentPassword: password, newPassword },
        token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
      );
      setPendingToken(null);
      setNewPassword('');
      setConfirmPassword('');
      setPassword('');
      setStep('login');
      setNotice('Password updated. Please login again with your new password.');
    } catch (err: any) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-100">
      {/* Left: brand / illustration panel (50%) */}
      <div className="hidden lg:flex w-1/2 relative overflow-hidden bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-600">
        {imgOk && (
          <img
            src={HERO_IMAGE}
            alt="Lead CRM analytics workspace"
            className="absolute inset-0 w-full h-full object-cover"
            onError={() => setImgOk(false)}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-indigo-950/90 via-indigo-900/50 to-indigo-800/30" />
        <div className="relative z-10 flex flex-col justify-between p-10 w-full">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-white text-indigo-700 flex items-center justify-center font-extrabold text-lg shadow">
              L
            </div>
            <div>
              <p className="text-white font-extrabold text-base leading-tight">Lead CRM</p>
              <p className="text-indigo-200 text-xs">Multi-tenant platform</p>
            </div>
          </div>
          <div>
            <h1 className="text-white text-3xl font-extrabold tracking-tight leading-tight">
              Every lead, every branch,
              <br />
              one workspace.
            </h1>
            <ul className="mt-5 space-y-2.5 text-sm text-indigo-100">
              {['Meta ads + WhatsApp + website leads in one pipeline', 'Branch-level isolation with per-campaign access', 'Realtime follow-ups and conversion feedback to Meta'].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <span className="mt-0.5 w-4 h-4 rounded-full bg-emerald-400/90 text-indigo-950 flex items-center justify-center text-[10px] font-black shrink-0">✓</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-indigo-200/70 text-[11px]">Secure sign-in • Session protected • SSO ready</p>
        </div>
      </div>

      {/* Right: form panel (50%) */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2.5 mb-6">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-extrabold text-lg">L</div>
            <p className="font-extrabold text-slate-900">Lead CRM</p>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.05)] p-7">
            {step === 'login' && (
              <>
                <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Welcome back</h2>
                <p className="text-xs text-slate-500 mt-1 mb-5">Sign in to your workspace to continue.</p>
                {notice && (
                  <div className="mb-4 px-3 py-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-medium">
                    {notice}
                  </div>
                )}
                {error && (
                  <div className="mb-4 px-3 py-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs font-medium">
                    {error}
                  </div>
                )}
                <form onSubmit={handleLogin} className="space-y-3">
                  <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  <div>
                    <Input
                      label="Password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <div className="flex items-center justify-between mt-2">
                      <Toggle checked={rememberMe} onChange={setRememberMe} label="Remember me" size="sm" />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="text-[11px] font-semibold text-slate-500 hover:text-slate-800"
                        >
                          {showPassword ? 'Hide' : 'Show'}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setForgotEmail(email); setError(null); setStep('forgot'); }}
                          className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
                        >
                          Forgot password?
                        </button>
                      </div>
                    </div>
                  </div>
                  <Button type="submit" loading={loading} className="w-full" size="md">
                    Sign In
                  </Button>
                </form>
              </>
            )}

            {step === 'forgot' && (
              <>
                <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Reset password</h2>
                <p className="text-xs text-slate-500 mt-1 mb-5">Enter your work email and we will send a reset link valid for 15 minutes.</p>
                {error && (
                  <div className="mb-4 px-3 py-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs font-medium">
                    {error}
                  </div>
                )}
                <form onSubmit={handleForgot} className="space-y-3">
                  <Input label="Email" type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} required />
                  <Button type="submit" loading={loading} className="w-full">Send reset link</Button>
                  <button type="button" onClick={() => { setStep('login'); setError(null); }} className="w-full text-center text-xs font-semibold text-slate-500 hover:text-slate-800 py-1">
                    ← Back to sign in
                  </button>
                </form>
              </>
            )}

            {step === 'forgot-sent' && (
              <div className="text-center py-4">
                <div className="w-12 h-12 mx-auto rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center text-xl font-bold">✓</div>
                <h2 className="text-lg font-extrabold text-slate-900 mt-3">Check your inbox</h2>
                <p className="text-xs text-slate-500 mt-1">If the email exists, a reset link valid for 15 minutes is on its way.</p>
                <button onClick={() => setStep('login')} className="mt-4 text-xs font-semibold text-indigo-600 hover:text-indigo-800">
                  ← Back to sign in
                </button>
              </div>
            )}

            {step === 'cap-reached' && (
              <div className="py-2">
                <div className="w-12 h-12 mx-auto rounded-full bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center text-xl font-bold">!</div>
                <h2 className="text-lg font-extrabold text-slate-900 mt-3 text-center">Already signed in elsewhere</h2>
                <p className="text-xs text-slate-600 mt-1 text-center leading-relaxed">{capInfo?.message}</p>
                {capInfo && capInfo.approvers.length > 0 && (
                  <div className="mt-3 text-left text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 space-y-1.5">
                    <p className="font-bold text-slate-700">Please contact your administrator:</p>
                    {capInfo.approvers.slice(0, 3).map((a) => (
                      <p key={a.email} className="truncate">
                        <span className="font-semibold text-slate-800">{a.name}</span>
                        <span className="text-slate-500"> • {a.email}</span>
                      </p>
                    ))}
                  </div>
                )}
                {capInfo && capInfo.devices.length > 0 && (
                  <p className="text-[11px] text-slate-400 mt-2 text-center">
                    In use now: {capInfo.devices.slice(0, 3).map((d) => d.deviceName || 'a device').join(', ')}
                    {capInfo.devices.length > 3 ? ` +${capInfo.devices.length - 3} more` : ''}
                  </p>
                )}
                <Button
                  loading={loading}
                  className="w-full mt-4"
                  onClick={async () => {
                    setLoading(true);
                    setError(null);
                    try {
                      const res = await axios.post(`${API_BASE}/auth/login`, {
                        email, password,
                        deviceId: getDeviceId(),
                        deviceName: getDeviceName(),
                        requestApproval: true,
                      });
                      // A slot freed up meanwhile – adopt the login directly.
                      const completed = adoptSession(res.data?.data, rememberRef.current);
                      if (completed.mustChangePassword) {
                        setPendingToken(completed.accessToken);
                        setRules(completed.passwordRules);
                        setNewPassword('');
                        setConfirmPassword('');
                        setStep('force-change');
                      }
                    } catch (err: any) {
                      const data = err?.response?.data;
                      if (err?.response?.status === 403 && data?.code === 'DEVICE_APPROVAL_REQUIRED') {
                        setApproval(data?.data);
                        setApprovalLeft(data?.data?.expiresIn || 60);
                        setStep('approval-pending');
                      } else {
                        setError(friendlyError(err));
                        setStep('login');
                      }
                    } finally {
                      setLoading(false);
                    }
                  }}
                >
                  Request approval from admin
                </Button>
                <button
                  onClick={() => { setCapInfo(null); setStep('login'); setError(null); }}
                  className="w-full text-center text-xs font-semibold text-slate-500 hover:text-slate-800 py-2"
                >
                  Cancel and go back
                </button>
              </div>
            )}

            {step === 'approval-pending' && (
              <div className="text-center py-2">
                <div className="w-12 h-12 mx-auto rounded-full bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center">
                  <span className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                </div>
                <h2 className="text-lg font-extrabold text-slate-900 mt-3">Waiting for approval</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Your account already has {approval?.maxDevices || 3} active devices. Approve this browser from one of them.
                </p>
                <div className="mt-3 text-left text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 space-y-1.5">
                  {(approval?.devices || []).slice(0, 3).map((d) => (
                    <p key={d.deviceId} className="truncate">
                      <span className="font-semibold text-slate-700">{d.deviceName || 'Device'}</span>
                      {d.ip && <span className="font-mono text-slate-400"> • {d.ip}</span>}
                    </p>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-3">
                  Expires in <span className="font-bold text-slate-700">{approvalLeft}s</span>
                </p>
                <button
                  onClick={() => { if (pollRef.current) clearInterval(pollRef.current); setApproval(null); setStep('login'); }}
                  className="mt-2 text-xs font-semibold text-slate-500 hover:text-slate-800"
                >
                  Cancel and go back
                </button>
              </div>
            )}

            {step === 'force-change' && (
              <>
                <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Set your password</h2>
                <p className="text-xs text-slate-500 mt-1 mb-5">
                  This is your first login with a temporary password. Choose a new one to continue — you will login again afterwards.
                </p>
                {ruleHints.length > 0 && (
                  <ul className="mb-4 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 space-y-1">
                    {ruleHints.map((r) => <li key={r}>• {r}</li>)}
                  </ul>
                )}
                {error && (
                  <div className="mb-4 px-3 py-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs font-medium">
                    {error}
                  </div>
                )}
                <form onSubmit={handleForceChange} className="space-y-3">
                  <Input label="Current (temporary) password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                  <Input label="New password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
                  <Input label="Confirm new password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                  <Button type="submit" loading={loading} className="w-full">Update password</Button>
                </form>
              </>
            )}
          </div>
          <p className="text-center text-[11px] text-slate-400 mt-4">Protected by organization session policies.</p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;

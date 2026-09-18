import { useState } from 'react';
import { request } from './api.js';

export default function AuthPanel({ onUser }) {
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Email OTP verification state
  const [pendingVerification, setPendingVerification] = useState(null);
  const [otpCode, setOtpCode] = useState('');
  const [demoHint, setDemoHint] = useState('');

  // Registration form state for password match check
  const [regForm, setRegForm] = useState({
    username: '',
    fullName: '',
    nic: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  async function handleLogin(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(e.currentTarget);
    try {
      const { user } = await request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: form.get('username'),
          password: form.get('password'),
        }),
      });
      onUser(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError('');

    if (regForm.password !== regForm.confirmPassword) {
      setError('Passwords do not match. Please re-enter your password.');
      return;
    }

    setBusy(true);
    try {
      const res = await request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: regForm.username,
          password: regForm.password,
          confirmPassword: regForm.confirmPassword,
          fullName: regForm.fullName,
          nic: regForm.nic,
          email: regForm.email,
        }),
      });

      if (res.requiresVerification) {
        setPendingVerification({
          user: res.user,
          email: regForm.email,
        });
        if (res.demoOtpHint) {
          setDemoHint(res.demoOtpHint);
        }
        setSuccess(`Verification code dispatched to ${regForm.email}`);
      } else {
        onUser(res.user);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault();
    if (!otpCode || otpCode.trim().length !== 6) {
      setError('Please enter the 6-digit verification code.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const res = await request('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: otpCode.trim() }),
      });
      setSuccess('Email successfully verified!');
      setTimeout(() => {
        onUser(res.user || pendingVerification.user);
      }, 600);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleResendCode() {
    setBusy(true);
    setError('');
    try {
      const res = await request('/api/auth/resend-code', { method: 'POST' });
      setSuccess(res.message || 'New verification code dispatched.');
      if (res.demoOtpHint) {
        setDemoHint(res.demoOtpHint);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // OTP Verification View
  if (pendingVerification) {
    return (
      <section className="panel max-w-xl mx-auto">
        <div className="eyebrow text-sky-700 font-bold">SECURITY VERIFICATION</div>
        <h2 className="text-xl font-bold mt-1">Verify your email address</h2>
        <p className="muted text-sm mb-4">
          A 6-digit confirmation code has been sent to <strong>{pendingVerification.email}</strong>.
          Enter the code below to complete your registration.
        </p>

        {demoHint && (
          <div className="p-3 mb-4 rounded-lg bg-sky-50 border border-sky-200 text-xs text-sky-900">
            <strong>Demonstration hint:</strong> Simulated OTP code is <code>{demoHint}</code> (also logged in email outbox).
          </div>
        )}

        <form className="space-y-4" onSubmit={handleVerifyOtp}>
          <div>
            <label htmlFor="otpCode" className="block text-sm font-semibold mb-1">
              6-Digit Verification Code
            </label>
            <input
              id="otpCode"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="e.g. 123456"
              value={otpCode}
              onChange={e => setOtpCode(e.target.value.replace(/[^0-9]/g, ''))}
              className="text-center font-mono text-2xl tracking-widest letter-spacing-2 font-bold py-2"
              required
              autoFocus
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button type="submit" className="primary" disabled={busy || otpCode.length !== 6}>
              {busy ? 'Verifying…' : 'Verify & Enter Workspace'}
            </button>
            <button type="button" className="secondary text-xs" onClick={handleResendCode} disabled={busy}>
              Resend Code
            </button>
            <button
              type="button"
              className="text-xs text-slate-500 hover:text-slate-800 underline ml-auto"
              onClick={() => {
                // Continue without email verification (can be verified later in Profile)
                onUser(pendingVerification.user);
              }}
            >
              Skip for now
            </button>
          </div>

          {error && <p role="alert" className="notice error">{error}</p>}
          {success && <p role="status" className="notice success">{success}</p>}
        </form>
      </section>
    );
  }

  return (
    <section className="panel max-w-xl mx-auto">
      <div className="eyebrow text-sky-700 font-bold">PRIVATE REPORTING</div>
      <h2 className="text-xl font-bold mt-1">{register ? 'Create a citizen account' : 'Sign in to your workspace'}</h2>
      <p className="muted text-sm mb-5">
        Citizens see their own reports. Staff access is assigned by the backend; choosing a navigation tab does not change your role.
      </p>

      {!register ? (
        // Sign In Form
        <form className="space-y-4" onSubmit={handleLogin}>
          <div>
            <label htmlFor="username">Username</label>
            <input
              id="username"
              name="username"
              autoComplete="username"
              pattern="[a-zA-Z0-9-]{3,40}"
              minLength={3}
              maxLength={40}
              placeholder="e.g. demo-citizen"
              required
            />
          </div>
          <div>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              minLength={10}
              maxLength={128}
              required
            />
          </div>
          <p className="muted text-xs">Username: 3–40 letters, numbers or hyphens. Password: at least 10 characters.</p>
          <button type="submit" className="primary w-full" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          {error && <p role="alert" className="notice error">{error}</p>}
        </form>
      ) : (
        // Citizen Registration Form
        <form className="space-y-3" onSubmit={handleRegister}>
          <div>
            <label htmlFor="fullName">Full Name <span className="text-rose-600">*</span></label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              autoComplete="name"
              placeholder="e.g. Kasun Perera"
              maxLength={100}
              value={regForm.fullName}
              onChange={e => setRegForm({ ...regForm, fullName: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label htmlFor="nic">
                National ID (NIC) <span className="text-rose-600">*</span>
              </label>
              <input
                id="nic"
                name="nic"
                type="text"
                autoComplete="off"
                placeholder="123456789V or 12 digits"
                maxLength={12}
                value={regForm.nic}
                onChange={e => setRegForm({ ...regForm, nic: e.target.value.toUpperCase() })}
                required
              />
              <span className="text-[11px] text-slate-500 block mt-0.5">Format: 9 digits + V/X or 12 digits</span>
            </div>

            <div>
              <label htmlFor="regUsername">
                Username <span className="text-rose-600">*</span>
              </label>
              <input
                id="regUsername"
                name="username"
                autoComplete="username"
                pattern="[a-zA-Z0-9-]{3,40}"
                minLength={3}
                maxLength={40}
                placeholder="e.g. citizen-colombo"
                value={regForm.username}
                onChange={e => setRegForm({ ...regForm, username: e.target.value })}
                required
              />
              <span className="text-[11px] text-slate-500 block mt-0.5">3–40 lowercase letters, numbers, hyphens</span>
            </div>
          </div>

          <div>
            <label htmlFor="email">
              Email Address <span className="text-slate-500 text-xs font-normal">(Optional · Requires 6-digit verification)</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="e.g. citizen@example.com"
              value={regForm.email}
              onChange={e => setRegForm({ ...regForm, email: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label htmlFor="regPassword">
                Password <span className="text-rose-600">*</span>
              </label>
              <input
                id="regPassword"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={10}
                maxLength={128}
                placeholder="Min. 10 characters"
                value={regForm.password}
                onChange={e => setRegForm({ ...regForm, password: e.target.value })}
                required
              />
            </div>

            <div>
              <label htmlFor="confirmPassword">
                Repeat Password <span className="text-rose-600">*</span>
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={10}
                maxLength={128}
                placeholder="Re-enter password"
                value={regForm.confirmPassword}
                onChange={e => setRegForm({ ...regForm, confirmPassword: e.target.value })}
                required
              />
            </div>
          </div>

          {regForm.password && regForm.confirmPassword && (
            <div className="text-xs">
              {regForm.password === regForm.confirmPassword ? (
                <span className="text-emerald-700 font-semibold">✓ Passwords match</span>
              ) : (
                <span className="text-rose-600 font-semibold">✕ Passwords do not match</span>
              )}
            </div>
          )}

          <button type="submit" className="primary w-full mt-2" disabled={busy}>
            {busy ? 'Creating citizen account…' : 'Create Citizen Account'}
          </button>
          {error && <p role="alert" className="notice error">{error}</p>}
        </form>
      )}

      <button
        type="button"
        className="secondary mt-5 w-full text-xs"
        disabled={busy}
        onClick={() => {
          setRegister(!register);
          setError('');
          setSuccess('');
        }}
      >
        {register ? 'Already have an account? Sign in' : 'New here? Register as a citizen'}
      </button>

      <p className="muted text-xs mt-4 text-center">
        Staff demonstration accounts are seeded locally with <code>npm run seed:demo</code>. Public registration is restricted to citizens.
      </p>
    </section>
  );
}

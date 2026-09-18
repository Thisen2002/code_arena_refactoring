import { useState, useEffect } from 'react';
import { request } from './api.js';

export default function ProfileModal({ user, onClose, onUserUpdated }) {
  const [activeTab, setActiveTab] = useState('details'); // 'details' | 'security'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Profile details state
  const [fullName, setFullName] = useState(user.fullName || '');
  const [email, setEmail] = useState(user.email || '');
  const [nic, setNic] = useState(user.nic || '');
  const [emailVerified, setEmailVerified] = useState(Boolean(user.emailVerified));

  // OTP verification state for email changes
  const [requiresOtp, setRequiresOtp] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [demoHint, setDemoHint] = useState('');

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    // Load fresh profile from backend
    let active = true;
    request('/api/auth/profile')
      .then(res => {
        if (!active || !res.profile) return;
        setFullName(res.profile.fullName || '');
        setEmail(res.profile.email || '');
        setNic(res.profile.nic || '');
        setEmailVerified(Boolean(res.profile.emailVerified));
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  async function handleSaveProfile(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSuccess('');
    setDemoHint('');

    try {
      const res = await request('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          email,
          ...(user.role === 'citizen' ? { nic } : {}),
        }),
      });

      if (res.requiresVerification) {
        setRequiresOtp(true);
        if (res.demoOtpHint) setDemoHint(res.demoOtpHint);
        setSuccess('Profile saved. A 6-digit code has been sent to verify your new email.');
      } else {
        setSuccess('Profile successfully updated.');
        if (onUserUpdated && res.profile) onUserUpdated(res.profile);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyEmailOtp(e) {
    e.preventDefault();
    if (!otpCode || otpCode.trim().length !== 6) {
      setError('Please enter the 6-digit code.');
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
      setRequiresOtp(false);
      setEmailVerified(true);
      setSuccess('Email address verified successfully!');
      if (onUserUpdated && res.user) onUserUpdated(res.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleResendEmailOtp() {
    setBusy(true);
    setError('');
    try {
      const res = await request('/api/auth/resend-code', { method: 'POST' });
      setSuccess(res.message || 'Verification code resent.');
      if (res.demoOtpHint) setDemoHint(res.demoOtpHint);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) {
      setError('New passwords do not match.');
      return;
    }

    setBusy(true);
    setError('');
    setSuccess('');

    try {
      const res = await request('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmNewPassword,
        }),
      });
      setSuccess(res.message || 'Password successfully updated.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/20 text-sky-400 font-bold text-sm">
              👤
            </span>
            <div>
              <h2 className="text-base font-bold leading-tight text-white">My Profile & Security</h2>
              <p className="text-[11px] text-slate-300">
                Logged in as <strong className="text-sky-300">@{user.username}</strong> ({user.role})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white text-lg font-bold p-1 rounded-md transition"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {/* Modal Sub-Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-2 gap-3">
          <button
            type="button"
            className={`pb-2.5 text-xs font-semibold border-b-2 transition ${
              activeTab === 'details'
                ? 'border-sky-600 text-sky-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
            onClick={() => { setActiveTab('details'); setError(''); setSuccess(''); }}
          >
            Personal Details & Email
          </button>
          <button
            type="button"
            className={`pb-2.5 text-xs font-semibold border-b-2 transition ${
              activeTab === 'security'
                ? 'border-sky-600 text-sky-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
            onClick={() => { setActiveTab('security'); setError(''); setSuccess(''); }}
          >
            Change Password
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          {error && <p role="alert" className="notice error">{error}</p>}
          {success && <p role="status" className="notice success">{success}</p>}

          {activeTab === 'details' && (
            <>
              {/* Account Identity Notice */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">System Username</span>
                  <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                    {user.username}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Assigned Role</span>
                  <span className="badge bg-slate-200 text-slate-800 font-bold uppercase tracking-wider text-[10px]">
                    {user.role}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 italic pt-1 border-t border-slate-200">
                  Username and operational roles are system-enforced and cannot be altered.
                </p>
              </div>

              {/* Email Verification Banner */}
              {requiresOtp ? (
                <div className="border border-sky-300 bg-sky-50 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sky-950 font-bold text-sm">
                    <span>📩</span> Enter 6-Digit Email Verification Code
                  </div>
                  <p className="text-xs text-sky-900">
                    A verification code was dispatched to <strong>{email}</strong>.
                  </p>
                  {demoHint && (
                    <div className="text-[11px] bg-white/80 p-2 rounded text-sky-800 font-mono">
                      Demo Outbox OTP: <strong>{demoHint}</strong>
                    </div>
                  )}
                  <form onSubmit={handleVerifyEmailOtp} className="flex gap-2">
                    <input
                      type="text"
                      maxLength={6}
                      pattern="[0-9]{6}"
                      placeholder="6-digit code"
                      className="text-center font-mono font-bold tracking-widest text-lg py-1 flex-1"
                      value={otpCode}
                      onChange={e => setOtpCode(e.target.value.replace(/[^0-9]/g, ''))}
                      required
                    />
                    <button type="submit" className="primary text-xs" disabled={busy || otpCode.length !== 6}>
                      Verify
                    </button>
                    <button type="button" className="secondary text-xs" onClick={handleResendEmailOtp} disabled={busy}>
                      Resend
                    </button>
                  </form>
                </div>
              ) : null}

              {/* Profile Details Form */}
              <form onSubmit={handleSaveProfile} className="space-y-3.5">
                <div>
                  <label htmlFor="profFullName" className="block text-xs font-semibold text-slate-700 mb-1">
                    Full Name (Display Name)
                  </label>
                  <input
                    id="profFullName"
                    type="text"
                    placeholder="e.g. Kasun Perera"
                    maxLength={100}
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                  />
                </div>

                {user.role === 'citizen' && (
                  <div>
                    <label htmlFor="profNic" className="block text-xs font-semibold text-slate-700 mb-1">
                      National Identity Card (NIC)
                    </label>
                    <input
                      id="profNic"
                      type="text"
                      placeholder="123456789V or 12 digits"
                      maxLength={12}
                      value={nic}
                      onChange={e => setNic(e.target.value.toUpperCase())}
                    />
                    <span className="text-[11px] text-slate-500 block mt-0.5">
                      Valid Sri Lankan 9V/X or modern 12-digit format
                    </span>
                  </div>
                )}

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label htmlFor="profEmail" className="block text-xs font-semibold text-slate-700">
                      Email Address
                    </label>
                    {email && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        emailVerified ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {emailVerified ? '✓ Verified' : '⚠ Unverified'}
                      </span>
                    )}
                  </div>
                  <input
                    id="profEmail"
                    type="email"
                    placeholder="e.g. yourname@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                  <span className="text-[11px] text-slate-500 block mt-0.5">
                    Changing your email will dispatch a 6-digit OTP code to verify ownership.
                  </span>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button type="button" className="secondary text-xs" onClick={onClose}>
                    Cancel
                  </button>
                  <button type="submit" className="primary text-xs" disabled={busy}>
                    {busy ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </>
          )}

          {activeTab === 'security' && (
            <form onSubmit={handleChangePassword} className="space-y-3.5">
              <div>
                <label htmlFor="currentPw" className="block text-xs font-semibold text-slate-700 mb-1">
                  Current Password <span className="text-rose-600">*</span>
                </label>
                <input
                  id="currentPw"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter current password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  required
                />
              </div>

              <div>
                <label htmlFor="newPw" className="block text-xs font-semibold text-slate-700 mb-1">
                  New Password <span className="text-rose-600">*</span>
                </label>
                <input
                  id="newPw"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  minLength={10}
                  maxLength={128}
                  placeholder="At least 10 characters"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                />
              </div>

              <div>
                <label htmlFor="confirmNewPw" className="block text-xs font-semibold text-slate-700 mb-1">
                  Confirm New Password <span className="text-rose-600">*</span>
                </label>
                <input
                  id="confirmNewPw"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  minLength={10}
                  maxLength={128}
                  placeholder="Repeat new password"
                  value={confirmNewPassword}
                  onChange={e => setConfirmNewPassword(e.target.value)}
                  required
                />
              </div>

              {newPassword && confirmNewPassword && (
                <div className="text-xs">
                  {newPassword === confirmNewPassword ? (
                    <span className="text-emerald-700 font-semibold">✓ Passwords match</span>
                  ) : (
                    <span className="text-rose-600 font-semibold">✕ Passwords do not match</span>
                  )}
                </div>
              )}

              <label className="flex items-center gap-2 mt-1 text-sm cursor-pointer">
                <input type="checkbox" className="w-auto" checked={showPassword} onChange={() => setShowPassword(!showPassword)} />
                Show passwords
              </label>

              <p className="text-[11px] text-slate-500">
                Password must contain at least 10 characters. Sessions are secured with salted scrypt hashing.
              </p>

              <div className="pt-2 flex justify-end gap-2">
                <button type="button" className="secondary text-xs" onClick={onClose}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary text-xs"
                  disabled={busy || !currentPassword || newPassword.length < 10 || newPassword !== confirmNewPassword}
                >
                  {busy ? 'Updating Password…' : 'Update Password'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

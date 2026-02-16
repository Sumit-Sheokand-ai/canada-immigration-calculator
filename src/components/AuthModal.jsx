import { useEffect, useId, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  isCloudProfilesEnabled,
  setAlertPreferenceForUser,
  setProfileEmailForUser,
} from '../utils/cloudProfiles';
import { readAccountSettings, saveAccountSettings } from '../utils/accountSettings';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

export default function AuthModal({ open, onClose }) {
  const {
    isConfigured,
    loading,
    user,
    sendEmailMagicLink,
    verifyEmailOtp,
    refreshSession,
    signInWithGoogle,
    signOut,
    updateProfile,
  } = useAuth();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('request');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [settings, setSettings] = useState(() => readAccountSettings());
  const titleId = useId();

  const title = useMemo(() => (user ? 'Account' : 'Login / Signup'), [user]);
  const cloudEnabled = isCloudProfilesEnabled();

  useEffect(() => {
    if (!open) return undefined;
    if (resendCooldown <= 0) return undefined;
    const timer = window.setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [open, resendCooldown]);

  useEffect(() => {
    if (!open || !user) return;
    setSettings((prev) => ({
      ...prev,
      profileName: user.user_metadata?.full_name || prev.profileName || '',
      contactEmail: prev.contactEmail || user.email || '',
    }));
  }, [open, user]);

  useEffect(() => {
    if (!open || !user) return;
    if (!(step === 'sent' || step === 'verify')) return;
    setStatus('Signed in successfully.');
    const timer = window.setTimeout(() => onClose(), 500);
    return () => window.clearTimeout(timer);
  }, [onClose, open, step, user]);

  useEffect(() => {
    if (open) return;
    setStep('request');
    setCode('');
    setStatus('');
    setBusy(false);
    setResendCooldown(0);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, open]);

  if (!open) return null;

  const normalizedEmail = email.trim().toLowerCase();

  const handleSendMagicLink = async () => {
    if (!normalizedEmail || !EMAIL_RE.test(normalizedEmail)) {
      setStatus('Please enter a valid email address.');
      return;
    }
    setBusy(true);
    setStatus('');
    try {
      await sendEmailMagicLink(normalizedEmail);
      setStep('sent');
      setCode('');
      setResendCooldown(25);
      setStatus('Magic link sent. Open your email and click the secure sign-in link.');
    } catch (err) {
      setStatus(err.message || 'Could not send magic link.');
    } finally {
      setBusy(false);
    }
  };

  const handleCheckMagicLink = async () => {
    setBusy(true);
    setStatus('');
    try {
      const nextSession = await refreshSession();
      if (nextSession?.user) {
        setStatus('Signed in successfully.');
        setStep('request');
        setTimeout(() => onClose(), 500);
      } else {
        setStatus('No active session found yet. Click the magic link from your email in this browser, then try again.');
      }
    } catch (err) {
      setStatus(err.message || 'Could not refresh session.');
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    await handleSendMagicLink();
  };

  const handleVerifyCode = async () => {
    if (!normalizedEmail || !code.trim()) {
      setStatus('Enter your email and 6-digit code.');
      return;
    }
    setBusy(true);
    setStatus('');
    try {
      await verifyEmailOtp(normalizedEmail, code.trim());
      await refreshSession();
      setStatus('Signed in successfully.');
      setStep('request');
      setCode('');
      setTimeout(() => onClose(), 500);
    } catch (err) {
      setStatus(err.message || 'Verification failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setBusy(true);
    setStatus('');
    try {
      await signInWithGoogle();
      setStatus('Redirecting to Google...');
    } catch (err) {
      setStatus(err.message || 'Google login failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveSettings = async () => {
    const next = {
      ...settings,
      profileName: (settings.profileName || '').trim(),
      contactEmail: (settings.contactEmail || '').trim().toLowerCase(),
    };
    if (next.contactEmail && !EMAIL_RE.test(next.contactEmail)) {
      setStatus('Please enter a valid contact email.');
      return;
    }

    setBusy(true);
    setStatus('');
    try {
      await updateProfile({ fullName: next.profileName });
      saveAccountSettings(next);
      setSettings(next);

      if (cloudEnabled && user?.id) {
        await Promise.all([
          setAlertPreferenceForUser(user.id, next.defaultDrawAlerts),
          setProfileEmailForUser(user.id, next.contactEmail || user.email || ''),
        ]);
      }

      setStatus('Account settings saved.');
    } catch (err) {
      setStatus(err.message || 'Could not save account settings.');
    } finally {
      setBusy(false);
    }
  };

  const handleRefreshSession = async () => {
    setBusy(true);
    setStatus('');
    try {
      await refreshSession();
      setStatus('Session refreshed.');
    } catch (err) {
      setStatus(err.message || 'Session refresh failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    setBusy(true);
    setStatus('');
    try {
      await signOut();
      setStatus('Signed out.');
      setTimeout(() => onClose(), 400);
    } catch (err) {
      setStatus(err.message || 'Sign out failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-modal-backdrop" onClick={onClose} role="presentation">
      <div className="auth-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
        <div className="auth-modal-head">
          <h3 id={titleId}>{title}</h3>
          <button type="button" className="auth-close" onClick={onClose} aria-label="Close dialog">✕</button>
        </div>

        {!isConfigured && (
          <p className="auth-note">
            Auth is unavailable. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
          </p>
        )}

        {isConfigured && loading && <p className="auth-note">Checking session...</p>}

        {isConfigured && !loading && user && (
          <div className="auth-body">
            <p className="auth-note">
              Signed in as <strong>{user.email}</strong>
            </p>

            <div className="auth-settings-card">
              <h4>Account settings</h4>
              <label className="wi-field">
                <span>Display name</span>
                <input
                  type="text"
                  value={settings.profileName}
                  onChange={(e) => setSettings((prev) => ({ ...prev, profileName: e.target.value }))}
                  placeholder="Your name"
                />
              </label>
              <label className="wi-field">
                <span>Contact email for draw alerts</span>
                <input
                  type="email"
                  value={settings.contactEmail}
                  onChange={(e) => setSettings((prev) => ({ ...prev, contactEmail: e.target.value }))}
                  placeholder="you@example.com"
                />
              </label>

              <label className="auth-check-row">
                <input
                  type="checkbox"
                  checked={settings.defaultDrawAlerts}
                  onChange={(e) => setSettings((prev) => ({ ...prev, defaultDrawAlerts: e.target.checked }))}
                />
                <span>Enable draw alerts by default</span>
              </label>
              <label className="auth-check-row">
                <input
                  type="checkbox"
                  checked={settings.autoSyncProfiles}
                  onChange={(e) => setSettings((prev) => ({ ...prev, autoSyncProfiles: e.target.checked }))}
                />
                <span>Auto-sync saved profiles</span>
              </label>
              <label className="auth-check-row">
                <input
                  type="checkbox"
                  checked={settings.autoSaveProgress}
                  onChange={(e) => setSettings((prev) => ({ ...prev, autoSaveProgress: e.target.checked }))}
                />
                <span>Auto-save wizard progress on this device</span>
              </label>
              <label className="wi-field">
                <span>Animation intensity</span>
                <select
                  value={settings.motionIntensity || 'full'}
                  onChange={(e) => setSettings((prev) => ({ ...prev, motionIntensity: e.target.value }))}
                >
                  <option value="full">Full</option>
                  <option value="subtle">Subtle</option>
                  <option value="off">Off</option>
                </select>
              </label>
              {!cloudEnabled && (
                <p className="auth-note">
                  Cloud account settings require Supabase env vars.
                </p>
              )}
            </div>

            <div className="auth-actions">
              <button type="button" className="action-btn auth-btn-primary" disabled={busy} onClick={handleSaveSettings}>
                {busy ? 'Saving...' : 'Save settings'}
              </button>
              <button type="button" className="action-btn" disabled={busy} onClick={handleRefreshSession}>
                Refresh session
              </button>
              <button type="button" className="action-btn" disabled={busy} onClick={handleSignOut}>
                {busy ? 'Signing out...' : 'Sign out'}
              </button>
            </div>
          </div>
        )}

        {isConfigured && !loading && !user && (
          <div className="auth-body">
            <p className="auth-note">
              Sign in with a magic link (recommended) or verify manually with an email code.
            </p>
            <label className="wi-field">
              <span>Email</span>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
              />
            </label>

            {step === 'verify' && (
              <label className="wi-field">
                <span>Email verification code</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Enter code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </label>
            )}

            <div className="auth-actions">
              {step === 'request' ? (
                <button type="button" className="action-btn auth-btn-primary" disabled={busy} onClick={handleSendMagicLink}>
                  {busy ? 'Sending...' : 'Send magic link'}
                </button>
              ) : step === 'sent' ? (
                <>
                  <button type="button" className="action-btn auth-btn-primary" disabled={busy} onClick={handleCheckMagicLink}>
                    {busy ? 'Checking...' : 'I clicked the magic link'}
                  </button>
                  <button type="button" className="action-btn" disabled={busy || resendCooldown > 0} onClick={handleResend}>
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend magic link'}
                  </button>
                  <button
                    type="button"
                    className="action-btn"
                    disabled={busy}
                    onClick={() => {
                      setStep('verify');
                      setStatus('If your email contains a code, enter it below.');
                    }}
                  >
                    Use email code instead
                  </button>
                </>
              ) : (
                <button type="button" className="action-btn auth-btn-primary" disabled={busy} onClick={handleVerifyCode}>
                  {busy ? 'Verifying...' : 'Verify and sign in'}
                </button>
              )}
              <button type="button" className="action-btn" disabled={busy} onClick={handleGoogle}>
                Continue with Google
              </button>
              {step !== 'request' && (
                <button
                  type="button"
                  className="action-btn"
                  disabled={busy}
                  onClick={() => {
                    setStep('request');
                    setCode('');
                    setStatus('');
                    setResendCooldown(0);
                  }}
                >
                  Back
                </button>
              )}
            </div>
          </div>
        )}

        {status && <p className="auth-status" role="status" aria-live="polite">{status}</p>}
      </div>
    </div>
  );
}


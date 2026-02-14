import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';

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
  } = useAuth();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('request');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const title = useMemo(() => {
    if (user) return 'Account';
    return 'Login / Signup';
  }, [user]);
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

  if (!open) return null;

  const normalizedEmail = email.trim().toLowerCase();
  const handleSendMagicLink = async () => {
    if (!normalizedEmail || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
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
      <div className="auth-modal" role="dialog" aria-modal="true" aria-label="Authentication" onClick={(e) => e.stopPropagation()}>
        <div className="auth-modal-head">
          <h3>{title}</h3>
          <button type="button" className="auth-close" onClick={onClose}>✕</button>
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
            <button type="button" className="action-btn auth-btn-primary" disabled={busy} onClick={handleSignOut}>
              {busy ? 'Signing out...' : 'Sign out'}
            </button>
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

        {status && <p className="auth-status">{status}</p>}
      </div>
    </div>
  );
}

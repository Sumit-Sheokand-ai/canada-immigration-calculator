import { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function AuthModal({ open, onClose }) {
  const { isConfigured, loading, user, sendEmailOtp, verifyEmailOtp, signInWithGoogle, signOut } = useAuth();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('request');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  const title = useMemo(() => {
    if (user) return 'Account';
    return 'Login / Signup';
  }, [user]);

  if (!open) return null;

  const normalizedEmail = email.trim().toLowerCase();

  const handleSendCode = async () => {
    if (!normalizedEmail || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setStatus('Please enter a valid email address.');
      return;
    }
    setBusy(true);
    setStatus('');
    try {
      await sendEmailOtp(normalizedEmail);
      setStep('verify');
      setStatus('Verification code sent. Check your email.');
    } catch (err) {
      setStatus(err.message || 'Could not send verification code.');
    } finally {
      setBusy(false);
    }
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
            <p className="auth-note">Secure sign-in with email verification code (2-step) or Google.</p>
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
                <button type="button" className="action-btn auth-btn-primary" disabled={busy} onClick={handleSendCode}>
                  {busy ? 'Sending...' : 'Send email code'}
                </button>
              ) : (
                <button type="button" className="action-btn auth-btn-primary" disabled={busy} onClick={handleVerifyCode}>
                  {busy ? 'Verifying...' : 'Verify and sign in'}
                </button>
              )}
              <button type="button" className="action-btn" disabled={busy} onClick={handleGoogle}>
                Continue with Google
              </button>
              {step === 'verify' && (
                <button
                  type="button"
                  className="action-btn"
                  disabled={busy}
                  onClick={() => {
                    setStep('request');
                    setCode('');
                    setStatus('');
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

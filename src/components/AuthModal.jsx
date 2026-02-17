import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  isCloudProfilesEnabled,
  setAlertPreferenceForUser,
  setProfileEmailForUser,
} from '../utils/cloudProfiles';
import { readAccountSettings, saveAccountSettings } from '../utils/accountSettings';
import { getCategoryDrawInfo, getLatestDraws, clearCategoryConfigCache, clearLatestDrawsCache } from '../utils/drawDataSource';
import { clearQuestionBankCache, getQuestionBank } from '../utils/questionDataSource';
import { readRuntimeFlags, resetRuntimeFlags, saveRuntimeFlags } from '../utils/runtimeFlags';
import {
  clearPolicyRuleSetOverride,
  getAvailablePolicyRuleSets,
  readPolicyRuleSetOverride,
  resolvePolicyRuleSet,
  savePolicyRuleSetOverride,
} from '../scoring/policy';

const EMAIL_RE = /^\S+@\S+\.\S+$/;
const DELETE_ACCOUNT_CONFIRMATION = 'DELETE';
const MIN_PASSWORD_LENGTH = 8;

export default function AuthModal({ open, onClose }) {
  const {
    isConfigured,
    loading,
    user,
    ensureAuthReady,
    sendEmailMagicLink,
    verifyEmailOtp,
    refreshSession,
    signInWithGoogle,
    signOut,
    updateProfile,
    changePassword,
    deleteAccount,
  } = useAuth();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('request');
  const [activeAction, setActiveAction] = useState('');
  const [status, setStatus] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [settings, setSettings] = useState(() => readAccountSettings());
  const [runtimeFlags, setRuntimeFlags] = useState(() => readRuntimeFlags());
  const [policyOverrideId, setPolicyOverrideId] = useState(() => readPolicyRuleSetOverride() || '');
  const [adminMeta, setAdminMeta] = useState(() => ({
    drawSource: 'unknown',
    drawFreshness: 'unknown',
    drawUpdatedAt: '—',
    categorySource: 'unknown',
    categoryFreshness: 'unknown',
    categoryCount: 0,
    questionSource: 'unknown',
    questionFreshness: 'unknown',
    questionCount: 0,
    activePolicy: resolvePolicyRuleSet(),
    refreshedAt: '',
  }));
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const titleId = useId();

  const title = useMemo(() => (user ? 'Account' : 'Login / Signup'), [user]);
  const policyRuleSets = useMemo(() => getAvailablePolicyRuleSets(), []);
  const cloudEnabled = isCloudProfilesEnabled();
  const billingPortalUrl = import.meta.env.VITE_STRIPE_BILLING_PORTAL_URL;
  const busy = activeAction !== '';
  const isActionBusy = (name) => activeAction === name;
  const refreshAdminMetadata = useCallback(async ({ forceRefresh = false, silent = false } = {}) => {
    if (!silent) {
      setActiveAction('refreshAdminMeta');
      setStatus('');
    }
    try {
      const [latestRes, categoryRes, questionRes] = await Promise.all([
        getLatestDraws({ forceRefresh }),
        getCategoryDrawInfo({ forceRefresh }),
        getQuestionBank({ forceRefresh }),
      ]);
      setAdminMeta({
        drawSource: latestRes?.source || 'unknown',
        drawFreshness: latestRes?.freshness || 'unknown',
        drawUpdatedAt: latestRes?.data?.lastUpdated || '—',
        categorySource: categoryRes?.source || 'unknown',
        categoryFreshness: categoryRes?.freshness || 'unknown',
        categoryCount: Array.isArray(categoryRes?.data) ? categoryRes.data.length : 0,
        questionSource: questionRes?.source || 'unknown',
        questionFreshness: questionRes?.freshness || 'unknown',
        questionCount: Array.isArray(questionRes?.data) ? questionRes.data.length : 0,
        activePolicy: resolvePolicyRuleSet(),
        refreshedAt: new Date().toISOString(),
      });
      if (!silent) setStatus('Admin metadata refreshed.');
    } catch (err) {
      if (!silent) setStatus(err.message || 'Could not refresh admin metadata.');
    } finally {
      if (!silent) setActiveAction('');
    }
  }, []);

  useEffect(() => {
    if (!open || !isConfigured) return;
    void ensureAuthReady().catch(() => {
      // no-op: existing UI already communicates unavailable auth states
    });
  }, [ensureAuthReady, isConfigured, open]);

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
    setRuntimeFlags(readRuntimeFlags());
    setPolicyOverrideId(readPolicyRuleSetOverride() || '');
    void refreshAdminMetadata({ silent: true });
  }, [open, refreshAdminMetadata, user]);

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
    setActiveAction('');
    setResendCooldown(0);
    setNewPassword('');
    setConfirmPassword('');
    setDeleteConfirmation('');
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
  const normalizedDeleteConfirmation = deleteConfirmation.trim().toUpperCase();
  const scrollToAccountSection = (sectionId) => {
    const element = document.getElementById(sectionId);
    if (!element) return;
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSendMagicLink = async () => {
    if (!normalizedEmail || !EMAIL_RE.test(normalizedEmail)) {
      setStatus('Please enter a valid email address.');
      return;
    }
    setActiveAction('sendMagicLink');
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
      setActiveAction('');
    }
  };

  const handleCheckMagicLink = async () => {
    setActiveAction('checkMagicLink');
    setStatus('');
    try {
      const nextSession = await refreshSession();
      if (nextSession?.user) {
        setStatus('Signed in successfully.');
        setStep('request');
        window.setTimeout(() => onClose(), 500);
      } else {
        setStatus('No active session found yet. Click the magic link from your email in this browser, then try again.');
      }
    } catch (err) {
      setStatus(err.message || 'Could not refresh session.');
    } finally {
      setActiveAction('');
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
    setActiveAction('verifyCode');
    setStatus('');
    try {
      await verifyEmailOtp(normalizedEmail, code.trim());
      await refreshSession();
      setStatus('Signed in successfully.');
      setStep('request');
      setCode('');
      window.setTimeout(() => onClose(), 500);
    } catch (err) {
      setStatus(err.message || 'Verification failed.');
    } finally {
      setActiveAction('');
    }
  };

  const handleGoogle = async () => {
    setActiveAction('googleAuth');
    setStatus('');
    try {
      await signInWithGoogle();
      setStatus('Redirecting to Google...');
    } catch (err) {
      setStatus(err.message || 'Google login failed.');
    } finally {
      setActiveAction('');
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

    setActiveAction('saveSettings');
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
      setActiveAction('');
    }
  };

  const handleChangePassword = async () => {
    const nextPassword = newPassword.trim();
    const confirmation = confirmPassword.trim();

    if (nextPassword.length < MIN_PASSWORD_LENGTH) {
      setStatus(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (nextPassword !== confirmation) {
      setStatus('New password and confirmation do not match.');
      return;
    }

    setActiveAction('changePassword');
    setStatus('');
    try {
      await changePassword(nextPassword);
      setNewPassword('');
      setConfirmPassword('');
      setStatus('Password updated successfully.');
    } catch (err) {
      setStatus(err.message || 'Could not change password.');
    } finally {
      setActiveAction('');
    }
  };

  const handleOpenMembershipPortal = () => {
    if (!billingPortalUrl) {
      setStatus('Membership management is unavailable. Add VITE_STRIPE_BILLING_PORTAL_URL.');
      return;
    }
    window.open(billingPortalUrl, '_blank', 'noopener,noreferrer');
    setStatus('Opened membership portal in a new tab.');
  };

  const handleDeleteAccount = async () => {
    if (normalizedDeleteConfirmation !== DELETE_ACCOUNT_CONFIRMATION) {
      setStatus(`Type ${DELETE_ACCOUNT_CONFIRMATION} to confirm account deletion.`);
      return;
    }

    setActiveAction('deleteAccount');
    setStatus('');
    try {
      await deleteAccount();
      setDeleteConfirmation('');
      setStatus('Account deleted.');
      window.setTimeout(() => onClose(), 350);
    } catch (err) {
      setStatus(err.message || 'Could not delete account.');
    } finally {
      setActiveAction('');
    }
  };

  const handleRefreshSession = async () => {
    setActiveAction('refreshSession');
    setStatus('');
    try {
      await refreshSession();
      setStatus('Session refreshed.');
    } catch (err) {
      setStatus(err.message || 'Session refresh failed.');
    } finally {
      setActiveAction('');
    }
  };

  const handleSignOut = async () => {
    setActiveAction('signOut');
    setStatus('');
    try {
      await signOut();
      setStatus('Signed out.');
      window.setTimeout(() => onClose(), 400);
    } catch (err) {
      setStatus(err.message || 'Sign out failed.');
    } finally {
      setActiveAction('');
    }
  };
  const handleSaveAdminControls = async () => {
    setActiveAction('saveAdminControls');
    setStatus('');
    try {
      saveRuntimeFlags(runtimeFlags);
      if (policyOverrideId) {
        savePolicyRuleSetOverride(policyOverrideId);
      } else {
        clearPolicyRuleSetOverride();
      }
      clearLatestDrawsCache();
      clearCategoryConfigCache();
      clearQuestionBankCache();
      await refreshAdminMetadata({ forceRefresh: true, silent: true });
      setStatus('Admin controls saved.');
    } catch (err) {
      setStatus(err.message || 'Could not save admin controls.');
    } finally {
      setActiveAction('');
    }
  };

  const handleResetAdminControls = async () => {
    setActiveAction('resetAdminControls');
    setStatus('');
    try {
      setRuntimeFlags(resetRuntimeFlags());
      clearPolicyRuleSetOverride();
      setPolicyOverrideId('');
      clearLatestDrawsCache();
      clearCategoryConfigCache();
      clearQuestionBankCache();
      await refreshAdminMetadata({ forceRefresh: true, silent: true });
      setStatus('Admin controls reset to defaults.');
    } catch (err) {
      setStatus(err.message || 'Could not reset admin controls.');
    } finally {
      setActiveAction('');
    }
  };

  const handleClearAdminCaches = async () => {
    setActiveAction('clearAdminCaches');
    setStatus('');
    try {
      clearLatestDrawsCache();
      clearCategoryConfigCache();
      clearQuestionBankCache();
      await refreshAdminMetadata({ forceRefresh: true, silent: true });
      setStatus('Draw/category/question caches cleared.');
    } catch (err) {
      setStatus(err.message || 'Could not clear caches.');
    } finally {
      setActiveAction('');
    }
  };

  return (
    <div className="auth-modal-backdrop" onClick={onClose} role="presentation">
      <div className="auth-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
        <div className="auth-modal-head">
          <h3 id={titleId}>{title}</h3>
          <button type="button" className="auth-close" onClick={onClose} aria-label="Close dialog">×</button>
        </div>

        <div className="auth-modal-scroll">
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
              <div className="auth-settings-card auth-settings-section">
                <h4>Account actions</h4>
                <div className="auth-action-shortcuts">
                  <button type="button" className="action-btn" onClick={() => scrollToAccountSection('auth-security')}>
                    Change password
                  </button>
                  <button type="button" className="action-btn" onClick={() => scrollToAccountSection('auth-admin')}>
                    Admin controls
                  </button>
                  <button type="button" className="action-btn" onClick={() => scrollToAccountSection('auth-membership')}>
                    Remove membership
                  </button>
                  <button type="button" className="action-btn auth-btn-danger" onClick={() => scrollToAccountSection('auth-danger-zone')}>
                    Delete account
                  </button>
                </div>
              </div>

              <div className="auth-settings-card auth-settings-section">
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
              <div className="auth-settings-card auth-settings-section" id="auth-admin">
                <h4>Admin controls</h4>
                <p className="auth-note">
                  Runtime controls for data mode, policy versioning, and source metadata.
                </p>
                <label className="auth-check-row">
                  <input
                    type="checkbox"
                    checked={runtimeFlags.forceLocalData}
                    onChange={(e) => setRuntimeFlags((prev) => ({ ...prev, forceLocalData: e.target.checked }))}
                  />
                  <span>Force local data mode (disable remote Supabase reads)</span>
                </label>
                <label className="auth-check-row">
                  <input
                    type="checkbox"
                    checked={runtimeFlags.allowRemoteQuestionBank}
                    onChange={(e) => setRuntimeFlags((prev) => ({ ...prev, allowRemoteQuestionBank: e.target.checked }))}
                  />
                  <span>Allow remote question-bank payloads</span>
                </label>
                <label className="auth-check-row">
                  <input
                    type="checkbox"
                    checked={runtimeFlags.enableAdvancedForecasting}
                    onChange={(e) => setRuntimeFlags((prev) => ({ ...prev, enableAdvancedForecasting: e.target.checked }))}
                  />
                  <span>Enable advanced trend forecasting widgets</span>
                </label>
                <label className="auth-check-row">
                  <input
                    type="checkbox"
                    checked={runtimeFlags.enablePerfTelemetry}
                    onChange={(e) => setRuntimeFlags((prev) => ({ ...prev, enablePerfTelemetry: e.target.checked }))}
                  />
                  <span>Enable route/performance telemetry events</span>
                </label>
                <label className="wi-field">
                  <span>Scoring policy override</span>
                  <select value={policyOverrideId} onChange={(e) => setPolicyOverrideId(e.target.value)}>
                    <option value="">Automatic (effective-date ruleset)</option>
                    {policyRuleSets.map((ruleSet) => (
                      <option key={ruleSet.id} value={ruleSet.id}>
                        {ruleSet.id} · effective {ruleSet.effectiveDate}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="auth-admin-meta">
                  <p><strong>Active policy:</strong> {adminMeta.activePolicy?.id || '—'} ({adminMeta.activePolicy?.source || 'unknown'})</p>
                  <p><strong>Draw source:</strong> {adminMeta.drawSource} ({adminMeta.drawFreshness}) · Updated {adminMeta.drawUpdatedAt}</p>
                  <p><strong>Category source:</strong> {adminMeta.categorySource} ({adminMeta.categoryFreshness}) · {adminMeta.categoryCount} categories</p>
                  <p><strong>Question bank:</strong> {adminMeta.questionSource} ({adminMeta.questionFreshness}) · {adminMeta.questionCount} steps</p>
                  <p><strong>Metadata refreshed:</strong> {adminMeta.refreshedAt ? new Date(adminMeta.refreshedAt).toLocaleString() : '—'}</p>
                </div>
                <div className="auth-actions">
                  <button
                    type="button"
                    className="action-btn auth-btn-primary"
                    disabled={busy}
                    onClick={handleSaveAdminControls}
                  >
                    {isActionBusy('saveAdminControls') ? 'Saving controls...' : 'Save controls'}
                  </button>
                  <button
                    type="button"
                    className="action-btn"
                    disabled={busy}
                    onClick={() => void refreshAdminMetadata({ forceRefresh: true })}
                  >
                    {isActionBusy('refreshAdminMeta') ? 'Refreshing metadata...' : 'Refresh metadata'}
                  </button>
                  <button
                    type="button"
                    className="action-btn"
                    disabled={busy}
                    onClick={handleClearAdminCaches}
                  >
                    {isActionBusy('clearAdminCaches') ? 'Clearing caches...' : 'Clear caches'}
                  </button>
                  <button
                    type="button"
                    className="action-btn"
                    disabled={busy}
                    onClick={handleResetAdminControls}
                  >
                    {isActionBusy('resetAdminControls') ? 'Resetting...' : 'Reset controls'}
                  </button>
                </div>
              </div>

              <div className="auth-settings-card auth-settings-section" id="auth-security">
                <h4>Security</h4>
                <label className="wi-field">
                  <span>New password</span>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                  />
                </label>
                <label className="wi-field">
                  <span>Confirm new password</span>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    autoComplete="new-password"
                  />
                </label>
                <div className="auth-actions">
                  <button
                    type="button"
                    className="action-btn"
                    disabled={busy}
                    onClick={handleChangePassword}
                  >
                    {isActionBusy('changePassword') ? 'Updating...' : 'Change password'}
                  </button>
                </div>
              </div>

              <div className="auth-settings-card auth-settings-section" id="auth-membership">
                <h4>Membership</h4>
                <p className="auth-note">
                  Remove or manage your membership from the billing portal.
                </p>
                <div className="auth-actions">
                  <button
                    type="button"
                    className="action-btn"
                    disabled={busy}
                    onClick={handleOpenMembershipPortal}
                  >
                    Remove membership
                  </button>
                </div>
              </div>

              <div className="auth-settings-card auth-settings-section auth-danger-zone" id="auth-danger-zone">
                <h4>Danger zone</h4>
                <p className="auth-note">
                  This permanently deletes your account. Type <strong>{DELETE_ACCOUNT_CONFIRMATION}</strong> to confirm.
                </p>
                <label className="wi-field">
                  <span>Confirmation</span>
                  <input
                    type="text"
                    value={deleteConfirmation}
                    onChange={(e) => setDeleteConfirmation(e.target.value)}
                    placeholder={DELETE_ACCOUNT_CONFIRMATION}
                  />
                </label>
                <div className="auth-actions">
                  <button
                    type="button"
                    className="action-btn auth-btn-danger"
                    disabled={busy || normalizedDeleteConfirmation !== DELETE_ACCOUNT_CONFIRMATION}
                    onClick={handleDeleteAccount}
                  >
                    {isActionBusy('deleteAccount') ? 'Deleting...' : 'Delete account'}
                  </button>
                </div>
              </div>

              <div className="auth-actions">
                <button type="button" className="action-btn auth-btn-primary" disabled={busy} onClick={handleSaveSettings}>
                  {isActionBusy('saveSettings') ? 'Saving...' : 'Save settings'}
                </button>
                <button type="button" className="action-btn" disabled={busy} onClick={handleRefreshSession}>
                  {isActionBusy('refreshSession') ? 'Refreshing...' : 'Refresh session'}
                </button>
                <button type="button" className="action-btn" disabled={busy} onClick={handleSignOut}>
                  {isActionBusy('signOut') ? 'Signing out...' : 'Sign out'}
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
                    {isActionBusy('sendMagicLink') ? 'Sending...' : 'Send magic link'}
                  </button>
                ) : step === 'sent' ? (
                  <>
                    <button type="button" className="action-btn auth-btn-primary" disabled={busy} onClick={handleCheckMagicLink}>
                      {isActionBusy('checkMagicLink') ? 'Checking...' : 'I clicked the magic link'}
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
                    {isActionBusy('verifyCode') ? 'Verifying...' : 'Verify and sign in'}
                  </button>
                )}
                <button type="button" className="action-btn" disabled={busy} onClick={handleGoogle}>
                  {isActionBusy('googleAuth') ? 'Redirecting...' : 'Continue with Google'}
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
    </div>
  );
}

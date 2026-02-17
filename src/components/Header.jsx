import { lazy, Suspense, useEffect, useState } from 'react';
import { m as motion, useReducedMotion } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { trackEvent } from '../utils/analytics';
import { prefetchAuthModalChunk } from '../utils/chunkPrefetch';
const AuthModal = lazy(() => import('./AuthModal'));

const langLabels = { en: 'EN', fr: 'FR' };

export default function Header({ canInstallApp = false, onInstallApp = () => {}, motionIntensity = 'full' }) {
  const prefersReducedMotion = useReducedMotion() || motionIntensity !== 'full';
  const { dark, toggle } = useTheme();
  const { lang, setLang, t } = useLanguage();
  const { user, ensureAuthReady } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    const openAccount = () => {
      setShowAuthModal(true);
      prefetchAuthModalChunk();
      void ensureAuthReady().catch(() => {});
    };
    window.addEventListener('crs-open-account-modal', openAccount);
    return () => {
      window.removeEventListener('crs-open-account-modal', openAccount);
    };
  }, [ensureAuthReady]);

  return (
    <>
      <motion.header
        className="header"
        initial={prefersReducedMotion ? false : { y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 20 }}
      >
        <div className="header-inner">
          <div className="logo">
            <span className="logo-leaf">🍁</span>
            <span>{t('header.title')}</span>
          </div>
          <div className="header-actions">
            {canInstallApp && (
              <button
                type="button"
                className="install-btn"
                onClick={onInstallApp}
                aria-label="Install app"
                title="Add app shortcut"
              >
                Install app
              </button>
            )}
            <button
              type="button"
              className="auth-toggle"
              onClick={() => {
                prefetchAuthModalChunk();
                setShowAuthModal(true);
                void ensureAuthReady().catch(() => {});
                trackEvent('account_modal_opened', { source: 'header_button', is_authenticated: !!user });
              }}
              onMouseEnter={() => {
                prefetchAuthModalChunk();
                void ensureAuthReady().catch(() => {});
              }}
              onFocus={() => {
                prefetchAuthModalChunk();
                void ensureAuthReady().catch(() => {});
              }}
              aria-label={user ? 'Manage account' : 'Login or signup'}
              title={user ? user.email : 'Login / Signup'}
            >
              {user ? 'Account' : 'Login'}
            </button>
            <select
              className="lang-select"
              value={lang}
              onChange={e => setLang(e.target.value)}
              aria-label="Select language"
            >
              {Object.entries(langLabels).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <button
              type="button"
              className="theme-toggle"
              onClick={toggle}
              aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              title={dark ? 'Light mode' : 'Dark mode'}
            >
              {dark ? 'Light' : 'Dark'}
            </button>
          </div>
        </div>
      </motion.header>
      {showAuthModal && (
        <Suspense fallback={(
          <div className="auth-modal-backdrop" role="presentation">
            <div className="auth-modal auth-modal-loading" role="dialog" aria-modal="true">
              <div className="auth-modal-head">
                <h3>Loading account…</h3>
                <button
                  type="button"
                  className="auth-close"
                  onClick={() => setShowAuthModal(false)}
                  aria-label="Close dialog"
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        )}
        >
          <AuthModal open={showAuthModal} onClose={() => setShowAuthModal(false)} />
        </Suspense>
      )}
    </>
  );
}

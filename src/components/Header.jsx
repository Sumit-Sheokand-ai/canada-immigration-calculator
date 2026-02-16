import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../context/AuthContext';
import AuthModal from './AuthModal';

const langLabels = { en: 'EN', fr: 'FR' };

export default function Header({ canInstallApp = false, onInstallApp = () => {}, motionIntensity = 'full' }) {
  const prefersReducedMotion = useReducedMotion() || motionIntensity === 'off';
  const { dark, toggle } = useTheme();
  const { lang, setLang, t } = useLanguage();
  const { user } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
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
            onClick={() => setShowAuthModal(true)}
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
      <AuthModal open={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </motion.header>
  );
}

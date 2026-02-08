import { motion } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../i18n/LanguageContext';

const langLabels = { en: 'EN', fr: 'FR', hi: 'HI' };

export default function Header() {
  const { dark, toggle } = useTheme();
  const { lang, setLang, t } = useLanguage();

  return (
    <motion.header
      className="header"
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 120, damping: 20 }}
    >
      <div className="header-inner">
        <div className="logo">
          <span className="logo-leaf">🍁</span>
          <span>{t('header.title')}</span>
        </div>
        <div className="header-actions">
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
            className="theme-toggle"
            onClick={toggle}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={dark ? 'Light mode' : 'Dark mode'}
          >
            {dark ? '☀️' : '🌙'}
          </button>
        </div>
      </div>
    </motion.header>
  );
}

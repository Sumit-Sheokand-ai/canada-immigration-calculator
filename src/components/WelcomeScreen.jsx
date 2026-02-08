import { motion } from 'framer-motion';
import { latestDraws } from '../data/crsData';
import { useLanguage } from '../i18n/LanguageContext';

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.12, delayChildren: 0.2 } }
};
const item = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 100, damping: 18 } }
};

export default function WelcomeScreen({ onStart, hasSaved }) {
  const { t } = useLanguage();

  const features = [
    { icon: 'I', iconClass: 'fi fi-score', title: t('feature.accurate'), desc: t('feature.accurateDesc') },
    { icon: 'II', iconClass: 'fi fi-tips', title: t('feature.suggestions'), desc: t('feature.suggestionsDesc') },
    { icon: 'III', iconClass: 'fi fi-data', title: t('feature.draws'), desc: t('feature.drawsDesc') },
    { icon: 'IV', iconClass: 'fi fi-fast', title: t('feature.instant'), desc: t('feature.instantDesc') },
  ];

  return (
    <motion.div
      className="welcome"
      variants={container}
      initial="hidden"
      animate="show"
      exit={{ opacity: 0, y: -40, transition: { duration: 0.3 } }}
    >
      <motion.div className="welcome-hero" variants={item}>
        <div className="hero-flag">
          <span className="flag-leaf">🍁</span>
        </div>
        <h1>{t('welcome.heading').split('\n').map((l, i) => <span key={i}>{l}{i === 0 && <br />}</span>)}</h1>
        <p className="hero-sub">{t('welcome.sub')}</p>
      </motion.div>

      {hasSaved && (
        <motion.div className="resume-banner" variants={item}>
          <p>{t('welcome.resume')}</p>
          <div className="resume-actions">
            <motion.button className="btn-resume" whileTap={{ scale: 0.96 }} onClick={() => onStart(true)}>
              {t('welcome.resumeBtn')}
            </motion.button>
            <motion.button className="btn-fresh" whileTap={{ scale: 0.96 }} onClick={() => onStart(false)}>
              {t('welcome.startFresh')}
            </motion.button>
          </div>
        </motion.div>
      )}

      <motion.div className="features-grid" variants={item}>
        {features.map((f, i) => (
          <motion.div
            className="feature-card"
            key={i}
            variants={item}
            whileHover={{ y: -4, boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}
          >
            <span className="feature-icon feature-num">{f.icon}</span>
            <strong>{f.title}</strong>
            <span className="feature-desc">{f.desc}</span>
          </motion.div>
        ))}
      </motion.div>

      <motion.button
        className="btn-start"
        variants={item}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => onStart(false)}
      >
        {t('welcome.btn')}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </motion.button>

      <motion.p className="welcome-updated" variants={item}>
        {t('welcome.updated')} {latestDraws.lastUpdated}
      </motion.p>
    </motion.div>
  );
}

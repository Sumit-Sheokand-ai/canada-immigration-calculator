import { useMemo } from 'react';
import { m as motion, useReducedMotion } from 'framer-motion';
import {
  arrowForwardSharp,
  flashSharp,
  shieldCheckmarkSharp,
  sparklesSharp,
  statsChartSharp,
  trendingUpSharp,
} from 'ionicons/icons';
import { useLanguage } from '../i18n/LanguageContext';
import StarBorder from './StarBorder';

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.12, delayChildren: 0.2 } }
};
const item = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 100, damping: 18 } }
};

function sourceLabel(source) {
  return source === 'supabase' ? 'Live sync' : 'Local data mode';
}
function iconDataToSvgMarkup(iconData) {
  if (typeof iconData !== 'string') return '';
  const commaIndex = iconData.indexOf(',');
  if (commaIndex === -1) return '';
  return decodeURIComponent(iconData.slice(commaIndex + 1));
}
function SvgIcon({ icon, className = '' }) {
  const markup = useMemo(() => iconDataToSvgMarkup(icon), [icon]);
  if (!markup) return null;
  return (
    <span
      className={`svg-icon ${className}`.trim()}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

export default function WelcomeScreen({ onStart, onPrepareStart = () => {}, hasSaved, drawData, drawSource = 'local-fallback', motionIntensity = 'full' }) {
  const prefersReducedMotion = useReducedMotion() || motionIntensity !== 'full';
  const { t } = useLanguage();

  const features = [
    { icon: statsChartSharp, title: t('feature.accurate'), desc: t('feature.accurateDesc') },
    { icon: flashSharp, title: t('feature.suggestions'), desc: t('feature.suggestionsDesc') },
    { icon: trendingUpSharp, title: t('feature.draws'), desc: t('feature.drawsDesc') },
    { icon: shieldCheckmarkSharp, title: t('feature.instant'), desc: t('feature.instantDesc') },
  ];

  return (
    <motion.div
      className="welcome"
      variants={container}
      initial={prefersReducedMotion ? false : 'hidden'}
      animate="show"
      exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -40, transition: { duration: 0.3 } }}
    >
      <motion.div className="welcome-hero" variants={item}>
        <div className="hero-flag">
          <span className="flag-leaf" aria-hidden="true">
            <SvgIcon icon={sparklesSharp} />
          </span>
        </div>
        <h1>{t('welcome.heading').split('\n').map((l, i) => <span key={i}>{l}{i === 0 && <br />}</span>)}</h1>
        <p className="hero-sub">{t('welcome.sub')}</p>
      </motion.div>

      {hasSaved && (
        <motion.div className="resume-banner" variants={item}>
          <p>{t('welcome.resume')}</p>
          <div className="resume-actions">
            <motion.button type="button" className="btn-resume" whileTap={prefersReducedMotion ? undefined : { scale: 0.96 }} onClick={() => onStart(true)} onMouseEnter={onPrepareStart} onFocus={onPrepareStart}>
              {t('welcome.resumeBtn')}
            </motion.button>
            <motion.button type="button" className="btn-fresh" whileTap={prefersReducedMotion ? undefined : { scale: 0.96 }} onClick={() => onStart(false)} onMouseEnter={onPrepareStart} onFocus={onPrepareStart}>
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
            whileHover={prefersReducedMotion ? undefined : { y: -4, boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}
          >
            <span className="feature-icon" aria-hidden="true">
              <SvgIcon icon={f.icon} />
            </span>
            <strong>{f.title}</strong>
            <span className="feature-desc">{f.desc}</span>
          </motion.div>
        ))}
      </motion.div>

      <motion.div variants={item}>
        <StarBorder color="var(--primary)" speed="5s">
          <motion.button
            type="button"
            className="btn-start"
            whileHover={prefersReducedMotion ? undefined : { scale: 1.03 }}
            whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
            onClick={() => onStart(false)}
            onMouseEnter={onPrepareStart}
            onFocus={onPrepareStart}
          >
            {t('welcome.btn')}
            <SvgIcon icon={arrowForwardSharp} className="btn-start-icon" />
          </motion.button>
        </StarBorder>
        <p className="welcome-microcopy">{t('welcome.microcopy')}</p>
      </motion.div>
      <motion.p className="welcome-trust" variants={item}>
        {t('welcome.trust')} {drawData?.lastUpdated || '—'} · {sourceLabel(drawSource)}
      </motion.p>
    </motion.div>
  );
}

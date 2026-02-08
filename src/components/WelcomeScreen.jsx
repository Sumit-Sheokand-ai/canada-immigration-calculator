import { motion } from 'framer-motion';
import { latestDraws } from '../data/crsData';

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.12, delayChildren: 0.2 } }
};
const item = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 100, damping: 18 } }
};

const features = [
  { icon: '📊', title: 'Accurate CRS Score', desc: 'Full Comprehensive Ranking System calculation' },
  { icon: '🎯', title: 'Smart Suggestions', desc: 'Personalized tips to increase your points' },
  { icon: '📅', title: 'Latest Draw Data', desc: 'Updated IRCC Express Entry draw results' },
  { icon: '⚡', title: 'Instant Results', desc: 'Get your score in under 2 minutes' },
];

export default function WelcomeScreen({ onStart }) {
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
        <h1>Canada Immigration<br />Points Calculator</h1>
        <p className="hero-sub">
          Calculate your Comprehensive Ranking System (CRS) score and discover
          your best path to Canadian permanent residency.
        </p>
      </motion.div>

      <motion.div className="features-grid" variants={item}>
        {features.map((f, i) => (
          <motion.div
            className="feature-card"
            key={i}
            variants={item}
            whileHover={{ y: -4, boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}
          >
            <span className="feature-icon">{f.icon}</span>
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
        onClick={onStart}
      >
        Calculate My Score
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </motion.button>

      <motion.p className="welcome-updated" variants={item}>
        Data last updated: {latestDraws.lastUpdated}
      </motion.p>
    </motion.div>
  );
}

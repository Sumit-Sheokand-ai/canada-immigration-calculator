import { motion } from 'framer-motion';

export default function Header() {
  return (
    <motion.header
      className="header"
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 120, damping: 20 }}
    >
      <div className="header-inner">
        <div className="logo">
          <span style={{ fontSize: '1.6rem' }}>🍁</span>
          <span>CRS Calculator</span>
        </div>
      </div>
    </motion.header>
  );
}

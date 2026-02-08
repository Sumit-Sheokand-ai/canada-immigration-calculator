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
          <svg viewBox="0 0 32 32" width="28" height="28" className="maple-leaf">
            <path d="M16 2l2.5 6.5 3.5-2-1 4 5 1-3 3 4 3h-5l1 5-3.5-3L16 23l-3.5-3.5L9 22.5l1-5H5l4-3-3-3 5-1-1-4 3.5 2z" fill="#e63946"/>
          </svg>
          <span>CRS Calculator</span>
        </div>
        <div className="header-badge">Express Entry 2025</div>
      </div>
    </motion.header>
  );
}

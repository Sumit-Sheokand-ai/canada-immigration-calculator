import { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import { AnimatePresence } from 'framer-motion';
import Header from './components/Header';
import WelcomeScreen from './components/WelcomeScreen';
import Wizard from './components/Wizard';
const Results = lazy(() => import('./components/Results'));
import { useLanguage } from './i18n/LanguageContext';
import './App.css';

const STORAGE_KEY = 'crs-progress';

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveProgress(answers) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(answers)); } catch {}
}

function clearProgress() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

// Decode answers from URL hash (for shared links)
function decodeHash() {
  try {
    const hash = window.location.hash.slice(1);
    if (!hash) return null;
    return JSON.parse(decodeURIComponent(atob(hash)));
  } catch { return null; }
}

export function encodeAnswers(answers) {
  return btoa(encodeURIComponent(JSON.stringify(answers)));
}

export default function App() {
  const { t } = useLanguage();

  // Check URL hash for shared results
  const [mode, setMode] = useState(() => {
    const shared = decodeHash();
    if (shared) return 'results';
    return 'welcome';
  });
  const [answers, setAnswers] = useState(() => decodeHash() || {});

  const handleStart = useCallback((resume) => {
    if (resume) {
      const saved = loadProgress();
      if (saved) setAnswers(saved);
    }
    setMode('wizard');
  }, []);

  const handleFinish = useCallback((ans) => {
    setAnswers(ans);
    clearProgress();
    setMode('results');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleRestart = useCallback(() => {
    setAnswers({});
    clearProgress();
    window.history.replaceState(null, '', window.location.pathname);
    setMode('welcome');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const hasSaved = !!loadProgress();

  // Back-to-top button
  const [showTop, setShowTop] = useState(false);
  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="app">
      <Header />
      <main className="main" role="main">
        <AnimatePresence mode="wait">
          {mode === 'welcome' && <WelcomeScreen key="welcome" onStart={handleStart} hasSaved={hasSaved} />}
          {mode === 'wizard' && <Wizard key="wizard" onFinish={handleFinish} onProgress={saveProgress} initialAnswers={answers} />}
          {mode === 'results' && (
            <Suspense fallback={<div className="loading-fallback">Loading results…</div>}>
              <Results key="results" answers={answers} onRestart={handleRestart} />
            </Suspense>
          )}
        </AnimatePresence>
      </main>
      <footer className="footer">
        <p>© {new Date().getFullYear()} {t('footer.copy')}</p>
      </footer>
      {showTop && (
        <button
          className="btn-top"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Back to top"
        >
          ↑
        </button>
      )}
    </div>
  );
}

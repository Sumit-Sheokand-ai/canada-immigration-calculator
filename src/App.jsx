import { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import { AnimatePresence } from 'framer-motion';
import Header from './components/Header';
import WelcomeScreen from './components/WelcomeScreen';
import Wizard from './components/Wizard';
import Loader from './components/Loader';
const Results = lazy(() => import('./components/Results'));
import { useLanguage } from './i18n/LanguageContext';
import {
  decodeShareAnswers,
  getProfileIdFromQuery,
  getSavedProfileById,
} from './utils/profileStore';
import { unsubscribeAlertsByToken } from './utils/cloudProfiles';
import './App.css';

const STORAGE_KEY = 'crs-progress';

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveProgress(answers) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(answers)); } catch { /* ignore storage errors */ }
}

function clearProgress() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore storage errors */ }
}
function getUnsubscribeToken() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('unsubscribe');
  } catch {
    return null;
  }
}

function getInitialAnswers() {
  const fromHash = decodeShareAnswers();
  if (fromHash) return fromHash;
  const profileId = getProfileIdFromQuery();
  if (profileId) {
    const saved = getSavedProfileById(profileId);
    if (saved?.answers) return saved.answers;
  }
  return {};
}


export default function App() {
  const { t } = useLanguage();
  const unsubscribeToken = getUnsubscribeToken();
  const initialAnswers = getInitialAnswers();

  const [mode, setMode] = useState(() => (
    unsubscribeToken ? 'unsubscribe' : (Object.keys(initialAnswers).length > 0 ? 'results' : 'welcome')
  ));
  const [answers, setAnswers] = useState(() => initialAnswers);
  const [unsubscribeState, setUnsubscribeState] = useState(() => (unsubscribeToken ? 'loading' : 'idle'));

  useEffect(() => {
    if (!unsubscribeToken) return;
    let mounted = true;
    unsubscribeAlertsByToken(unsubscribeToken)
      .then((res) => {
        if (!mounted) return;
        setUnsubscribeState(res.status === 'ok' ? 'success' : 'notfound');
      })
      .catch(() => {
        if (!mounted) return;
        setUnsubscribeState('error');
      });
    return () => { mounted = false; };
  }, [unsubscribeToken]);

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
          {mode === 'unsubscribe' && (
            <div className="card unsubscribe-card">
              <h3>Draw alert preferences</h3>
              {unsubscribeState === 'loading' && <p>Processing your unsubscribe request…</p>}
              {unsubscribeState === 'success' && <p>You’ve been unsubscribed from draw alerts successfully.</p>}
              {unsubscribeState === 'notfound' && <p>This unsubscribe link is invalid or already inactive.</p>}
              {unsubscribeState === 'error' && <p>We couldn’t process this request right now. Please try again later.</p>}
              <button className="btn-restart" onClick={() => setMode('welcome')}>
                Back to calculator
              </button>
            </div>
          )}
          {mode === 'results' && (
            <Suspense fallback={<div className="loading-fallback"><Loader /></div>}>
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

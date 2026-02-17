import { useState, useCallback, useEffect, useMemo, lazy, Suspense } from 'react';
import { AnimatePresence } from 'framer-motion';
import Header from './components/Header';
import Loader from './components/Loader';
const WelcomeScreen = lazy(() => import('./components/WelcomeScreen'));
const Wizard = lazy(() => import('./components/Wizard'));
const Results = lazy(() => import('./components/Results'));
import { useLanguage } from './i18n/LanguageContext';
import { unsubscribeAlertsByToken } from './utils/cloudProfiles';
import {
  getCategoryDrawInfo,
  getFallbackCategoryDrawInfo,
  getFallbackLatestDraws,
  getLatestDraws,
} from './utils/drawDataSource';
import { trackEvent } from './utils/analytics';
import { readAccountSettings } from './utils/accountSettings';
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
  return {};
}
function detectLowEndDevice() {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  if (!nav) return false;
  const connection = nav.connection || nav.mozConnection || nav.webkitConnection;
  const saveDataEnabled = Boolean(connection?.saveData);
  const deviceMemory = Number(nav.deviceMemory || 0);
  const hardwareCores = Number(nav.hardwareConcurrency || 0);
  const lowMemory = Number.isFinite(deviceMemory) && deviceMemory > 0 && deviceMemory <= 4;
  const lowCores = Number.isFinite(hardwareCores) && hardwareCores > 0 && hardwareCores <= 4;
  return saveDataEnabled || lowMemory || lowCores;
}
function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
async function withRetries(task, { retries = 2, baseDelayMs = 250 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      await sleep(baseDelayMs * (2 ** attempt));
    }
  }
  throw lastError || new Error('Retry attempts exhausted.');
}


export default function App() {
  const { t } = useLanguage();
  const [accountSettings, setAccountSettings] = useState(() => readAccountSettings());
  const shouldAutoSaveProgress = accountSettings.autoSaveProgress !== false;
  const motionIntensity = ['off', 'subtle', 'full'].includes(accountSettings.motionIntensity)
    ? accountSettings.motionIntensity
    : 'full';
  const isLowEndDevice = useMemo(() => detectLowEndDevice(), []);
  const effectiveMotionIntensity = motionIntensity === 'off'
    ? 'off'
    : (isLowEndDevice && motionIntensity === 'full' ? 'subtle' : motionIntensity);
  const unsubscribeToken = getUnsubscribeToken();
  const initialAnswers = getInitialAnswers();

  const [mode, setMode] = useState(() => (
    unsubscribeToken ? 'unsubscribe' : (Object.keys(initialAnswers).length > 0 ? 'results' : 'welcome')
  ));
  const [answers, setAnswers] = useState(() => initialAnswers);
  const [unsubscribeState, setUnsubscribeState] = useState(() => (unsubscribeToken ? 'loading' : 'idle'));
  const [drawData, setDrawData] = useState(() => getFallbackLatestDraws());
  const [drawSource, setDrawSource] = useState('local-fallback');
  const [categoryInfo, setCategoryInfo] = useState(() => getFallbackCategoryDrawInfo());
  const [dataSyncState, setDataSyncState] = useState(() => ({
    syncing: false,
    lastError: '',
    lastSyncedAt: '',
  }));

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

  const syncDataSources = useCallback(async ({ forceRefresh = false, reason = 'initial' } = {}) => {
    setDataSyncState((prev) => ({ ...prev, syncing: true, lastError: '' }));
    let latestError = null;
    let categoryError = null;

    try {
      const latest = await withRetries(
        () => getLatestDraws({ forceRefresh }),
        { retries: 2, baseDelayMs: 250 }
      );
      if (latest?.status === 'ok' && latest.data) {
        setDrawData(latest.data);
        setDrawSource(latest.source || 'local-fallback');
      }
    } catch (error) {
      latestError = error;
      setDrawData(getFallbackLatestDraws());
      setDrawSource('local-fallback');
    }

    try {
      const category = await withRetries(
        () => getCategoryDrawInfo({ forceRefresh }),
        { retries: 2, baseDelayMs: 250 }
      );
      if (category?.status === 'ok' && Array.isArray(category.data) && category.data.length > 0) {
        setCategoryInfo(category.data);
      } else {
        setCategoryInfo(getFallbackCategoryDrawInfo());
      }
    } catch (error) {
      categoryError = error;
      setCategoryInfo(getFallbackCategoryDrawInfo());
    }

    const degraded = !!latestError || !!categoryError;
    setDataSyncState({
      syncing: false,
      lastError: degraded ? 'Live sync is currently unavailable. Showing local data mode.' : '',
      lastSyncedAt: new Date().toISOString(),
    });

    if (degraded) {
      trackEvent('draw_data_sync_degraded', {
        reason,
        latest_error: String(latestError?.message || ''),
        category_error: String(categoryError?.message || ''),
      });
    } else {
      trackEvent('draw_data_sync_ok', {
        reason,
        source: 'live',
      });
    }
  }, []);
  const handleRetryDataSync = useCallback(() => {
    void syncDataSources({ forceRefresh: true, reason: 'manual_retry' });
  }, [syncDataSources]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void syncDataSources();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [syncDataSources]);

  const handleStart = useCallback((resume) => {
    if (resume && shouldAutoSaveProgress) {
      const saved = loadProgress();
      if (saved) setAnswers(saved);
    }
    trackEvent('wizard_started', { resumed: !!resume });
    setMode('wizard');
  }, [shouldAutoSaveProgress]);

  const handleFinish = useCallback((ans) => {
    setAnswers(ans);
    clearProgress();
    trackEvent('wizard_completed', { answer_count: Object.keys(ans || {}).length });
    setMode('results');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleRestart = useCallback(() => {
    setAnswers({});
    clearProgress();
    trackEvent('calculator_restarted');
    window.history.replaceState(null, '', window.location.pathname);
    setMode('welcome');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const hasSaved = shouldAutoSaveProgress && !!loadProgress();

  // Back-to-top button
  const [showTop, setShowTop] = useState(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState(null);
  const [isStandalone, setIsStandalone] = useState(() => {
    const standaloneMedia = window.matchMedia?.('(display-mode: standalone)')?.matches;
    const standaloneNavigator = window.navigator?.standalone === true;
    return !!(standaloneMedia || standaloneNavigator);
  });
  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const onBeforeInstallPrompt = (event) => {
      if (typeof event?.prompt === 'function') {
        setDeferredInstallPrompt(event);
      }
    };
    const onInstalled = () => {
      setDeferredInstallPrompt(null);
      setIsStandalone(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstallApp = useCallback(async () => {
    if (!deferredInstallPrompt) return;
    trackEvent('install_prompt_triggered');
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    if (choice?.outcome === 'accepted') {
      setDeferredInstallPrompt(null);
      trackEvent('install_prompt_accepted');
    } else {
      trackEvent('install_prompt_dismissed');
    }
  }, [deferredInstallPrompt]);

  useEffect(() => {
    const refreshSettings = () => {
      setAccountSettings(readAccountSettings());
    };
    window.addEventListener('storage', refreshSettings);
    window.addEventListener('crs-account-settings-updated', refreshSettings);
    return () => {
      window.removeEventListener('storage', refreshSettings);
      window.removeEventListener('crs-account-settings-updated', refreshSettings);
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-motion', effectiveMotionIntensity);
  }, [effectiveMotionIntensity]);

  useEffect(() => {
    const root = document.documentElement;
    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const hasFinePointer = window.matchMedia?.('(pointer: fine)')?.matches;
    const enabled = effectiveMotionIntensity !== 'off' && !prefersReduced && !!hasFinePointer;

    if (!enabled) {
      root.style.setProperty('--pointer-x', '50%');
      root.style.setProperty('--pointer-y', '40%');
      root.style.setProperty('--pointer-glow', '0');
      return undefined;
    }
    root.style.setProperty('--pointer-glow', effectiveMotionIntensity === 'subtle' ? '0.45' : '1');

    let rafId = 0;
    let currentX = 50;
    let currentY = 40;
    let targetX = 50;
    let targetY = 40;

    const tick = () => {
      currentX += (targetX - currentX) * 0.12;
      currentY += (targetY - currentY) * 0.12;
      root.style.setProperty('--pointer-x', `${currentX.toFixed(2)}%`);
      root.style.setProperty('--pointer-y', `${currentY.toFixed(2)}%`);
      if (Math.abs(targetX - currentX) > 0.05 || Math.abs(targetY - currentY) > 0.05) {
        rafId = window.requestAnimationFrame(tick);
      } else {
        rafId = 0;
      }
    };

    const schedule = () => {
      if (!rafId) rafId = window.requestAnimationFrame(tick);
    };

    const onPointerMove = (event) => {
      targetX = (event.clientX / window.innerWidth) * 100;
      targetY = (event.clientY / window.innerHeight) * 100;
      schedule();
    };

    const onPointerLeave = () => {
      targetX = 50;
      targetY = 40;
      schedule();
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave, { passive: true });

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [effectiveMotionIntensity]);

  return (
    <div className="app">
      <div className="anime-bg" aria-hidden="true">
        <span className="anime-bg-aurora anime-bg-aurora--one" />
        <span className="anime-bg-aurora anime-bg-aurora--two" />
        <span className="anime-bg-aurora anime-bg-aurora--three" />
        <span className="anime-bg-grid" />
        <span className="anime-bg-noise" />
        <span className="anime-bg-pointer-glow" />
        <span className="anime-bg-flare" />
        <span className="anime-bg-vignette" />
        <div className="anime-bg-sparks">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Header
        canInstallApp={!isStandalone && !!deferredInstallPrompt}
        onInstallApp={handleInstallApp}
        motionIntensity={effectiveMotionIntensity}
      />
      <main className="main" role="main" id="main-content">
        <AnimatePresence mode="wait">
          {mode === 'welcome' && (
            <Suspense fallback={<div className="loading-fallback"><Loader /></div>}>
              <WelcomeScreen
                key="welcome"
                onStart={handleStart}
                hasSaved={hasSaved}
                drawData={drawData}
                drawSource={drawSource}
                motionIntensity={effectiveMotionIntensity}
              />
            </Suspense>
          )}
          {mode === 'wizard' && (
            <Suspense fallback={<div className="loading-fallback"><Loader /></div>}>
              <Wizard
                key="wizard"
                onFinish={handleFinish}
                onProgress={shouldAutoSaveProgress ? saveProgress : undefined}
                initialAnswers={answers}
                motionIntensity={effectiveMotionIntensity}
              />
            </Suspense>
          )}
          {mode === 'unsubscribe' && (
            <div className="card unsubscribe-card">
              <h3>Draw alert preferences</h3>
              {unsubscribeState === 'loading' && <p>Processing your unsubscribe request…</p>}
              {unsubscribeState === 'success' && <p>You’ve been unsubscribed from draw alerts successfully.</p>}
              {unsubscribeState === 'notfound' && <p>This unsubscribe link is invalid or already inactive.</p>}
              {unsubscribeState === 'error' && <p>We couldn’t process this request right now. Please try again later.</p>}
              <button type="button" className="btn-restart" onClick={() => setMode('welcome')}>
                Back to calculator
              </button>
            </div>
          )}
          {mode === 'results' && (
            <Suspense fallback={<div className="loading-fallback"><Loader /></div>}>
              <Results
                key="results"
                answers={answers}
                onRestart={handleRestart}
                drawData={drawData}
                drawSource={drawSource}
                categoryInfo={categoryInfo}
                motionIntensity={effectiveMotionIntensity}
                onRetryDataSync={handleRetryDataSync}
                isDataSyncing={dataSyncState.syncing}
                dataSyncError={dataSyncState.lastError}
              />
            </Suspense>
          )}
        </AnimatePresence>
      </main>
      <footer className="footer">
        <p>© {new Date().getFullYear()} {t('footer.copy')}</p>
        <p className="footer-legal-links">
          <a href="/guides.html">Guides</a>
          <span aria-hidden="true"> · </span>
          <a href="/terms.html">Terms of Service</a>
          <span aria-hidden="true"> · </span>
          <a href="/privacy.html">Privacy Policy</a>
          <span aria-hidden="true"> · </span>
          <a href="/trust.html">Trust Center</a>
        </p>
      </footer>
      {showTop && (
        <button
          type="button"
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
